/**
 * Session: the run lifecycle without a renderer. Start or resume a run, place on
 * drop, offer and apply the rewarded-ad continue (R3), run the daily (R7), record
 * Progress, save through the ops port, and report analytics. No Pixi import, so it
 * runs under Node with the ops fakes and a stub view; that is how the "save survives
 * a restart" gate is tested in CI before it is tested on a phone.
 *
 * The view contains zero rules, and so does this file: every decision is Run's.
 */

import type { GameEvent, RunEnded } from "../engine/events.js";
import type { Pos } from "../engine/grid.js";
import { dailyKey, dailySeedForKey } from "../engine/daily.js";
import { Progress } from "../engine/progress.js";
import { Run, type RunConfig, type RunSave } from "../engine/run.js";
import type { ShapeSet } from "../engine/shapes.js";
import type { Ops } from "../ops/index.js";
import { reduce, type ViewState } from "./view-model.js";

export type Mode = "endless" | "daily";

export const PROGRESS_KEY = "runestone.progress.v1";
export const RUN_KEY = "runestone.run.v1";

interface StoredRun {
  readonly mode: Mode;
  readonly dailyKey?: string;
  /** The rewarded ad already paid out; only the cell pick is left. Survives a restart. */
  readonly rewardPending?: boolean;
  readonly save: RunSave;
}

export interface SessionStatus {
  readonly mode: Mode;
  readonly best: number;
  readonly dailyKey: string;
  readonly dailyDone: boolean;
  readonly adsRemoved: boolean;
  /** Writes to the save store are failing (private mode, full storage). Play continues. */
  readonly saveFailing: boolean;
}

/** What the scene must provide. Everything is async so animations can be awaited. */
export interface SessionView {
  /** Animate one action's events, then show `view`. Empty events means just show it. */
  replay(events: readonly GameEvent[], view: ViewState): Promise<void>;
  /** A continue is on offer. Resolve true if the player wants to watch the ad. */
  offerContinue(): Promise<boolean>;
  /** The ad paid out. Resolve with the cell whose row and column the player chose to clear. */
  pickContinueCell(): Promise<Pos>;
  /** Facts outside the run: mode, best score, today's daily state. */
  setStatus(status: SessionStatus): void;
}

export interface SessionDeps {
  readonly shapes: ShapeSet;
  readonly config: RunConfig;
  readonly ops: Ops;
  readonly view: SessionView;
  /** Injected clocks keep the daily testable. */
  readonly now: () => Date;
  readonly randomSeed: () => number;
}

export class Session {
  run: Run;
  mode: Mode = "endless";
  progress = new Progress();
  /** Cached answer from ops.ads, refreshed after every action; place() needs it synchronously. */
  continueAvailable = false;
  private dailyKeyForRun: string | undefined;
  private busy = false;
  /** The ad paid out and the player has not picked yet; persisted so a restart never re-asks for the ad. */
  private rewardPending = false;
  /** The last write to the save store failed; the view tells the player progress is not being kept. */
  private saveFailing = false;

  constructor(private readonly deps: SessionDeps) {
    this.run = Run.start(deps.shapes, deps.config, deps.randomSeed());
  }

  /** Load progress, then resume the saved run if one is in flight, else start endless. */
  async boot(): Promise<void> {
    this.busy = true;
    try {
      await this.bootInner();
    } finally {
      this.busy = false;
    }
  }

  private async bootInner(): Promise<void> {
    this.progress = Progress.deserialize(await this.loadJson(PROGRESS_KEY));
    const stored = (await this.loadJson(RUN_KEY)) as StoredRun | null;
    if (stored && stored.save && stored.save.phase === "ended") {
      // The app was closed after the run ended but before it was recorded: record it now.
      try {
        this.run = Run.deserialize(this.deps.shapes, this.deps.config, stored.save);
        this.mode = stored.mode;
        this.dailyKeyForRun = stored.dailyKey;
        await this.finishRun();
      } catch {
        await this.saveRemove(RUN_KEY);
      }
    } else if (stored && stored.save) {
      try {
        this.run = Run.deserialize(this.deps.shapes, this.deps.config, stored.save);
        this.mode = stored.mode;
        this.dailyKeyForRun = stored.dailyKey;
        this.rewardPending = stored.rewardPending === true && this.run.state().phase === "continue_offered";
        this.pushStatus();
        await this.deps.view.replay([], this.viewState());
        await this.refreshContinueAvailable();
        if (this.run.state().phase === "continue_offered") await this.handleOffer();
        return;
      } catch {
        // A save from an older engine that no longer loads: start fresh rather than brick.
      }
    }
    await this.startRun("endless", this.deps.randomSeed(), undefined);
  }

  /** Ignored while an action, animation or continue prompt is in progress. */
  async startEndless(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.startRun("endless", this.deps.randomSeed(), undefined);
    } finally {
      this.busy = false;
    }
  }

  /**
   * R7: one attempt per day. Starting spends the attempt (saved at once), so neither a
   * second tap nor a restart can re-roll it; an in-flight daily is resumed, not replaced.
   * False when today's attempt is already spent or the session is busy.
   */
  async startDaily(): Promise<boolean> {
    if (this.busy) return false;
    const key = dailyKey(this.deps.now());
    if (this.progress.dailyDone(key)) return false;
    this.busy = true;
    try {
      this.progress.markDaily(key, 0);
      await this.saveStore(PROGRESS_KEY, JSON.stringify(this.progress.serialize()));
      await this.startRun("daily", dailySeedForKey(key), key);
      this.deps.ops.analytics.track({ name: "daily_played", day: key });
      return true;
    } finally {
      this.busy = false;
    }
  }

  viewState(): ViewState {
    return reduce(this.run.state(), []);
  }

  status(): SessionStatus {
    const key = dailyKey(this.deps.now());
    return {
      mode: this.mode,
      best: this.progress.highScore,
      dailyKey: key,
      dailyDone: this.progress.dailyDone(key),
      adsRemoved: this.progress.adsRemoved,
      saveFailing: this.saveFailing,
    };
  }

  /** The player dropped hand[handIndex] at origin. Ignored while a replay or offer is in progress. */
  async drop(handIndex: number, origin: Pos): Promise<void> {
    if (this.busy || this.run.state().phase !== "playing") return;
    this.busy = true;
    try {
      const events = this.run.place(handIndex, origin, { continueAvailable: this.continueAvailable });
      await this.persistRun();
      await this.deps.view.replay(events, reduce(this.run.state(), events));
      await this.afterAction();
    } finally {
      this.busy = false;
    }
  }

  // ---- internals ----------------------------------------------------------------

  private async startRun(mode: Mode, seed: number, key: string | undefined): Promise<void> {
    this.run = Run.start(this.deps.shapes, this.deps.config, seed);
    this.mode = mode;
    this.dailyKeyForRun = key;
    this.rewardPending = false;
    this.deps.ops.analytics.track({ name: "run_start", mode, seed });
    await this.persistRun();
    this.pushStatus();
    const drawn = this.run.events().filter((e) => e.type === "HandDrawn");
    await this.deps.view.replay(drawn.slice(-1), this.viewState());
    await this.refreshContinueAvailable();
  }

  private async afterAction(): Promise<void> {
    const phase = this.run.state().phase;
    if (phase === "continue_offered") await this.handleOffer();
    else if (phase === "ended") await this.finishRun();
    else await this.refreshContinueAvailable();
  }

  /**
   * R3: one rewarded ad per run; the engine already refuses a second offer. The moment
   * the ad pays out, that fact is saved, so a restart between the ad and the cell pick
   * goes straight back to the pick instead of asking for the ad again.
   */
  private async handleOffer(): Promise<void> {
    const { ops, view } = this.deps;
    let rewarded = this.rewardPending;
    if (!rewarded) {
      ops.analytics.track({ name: "continue_offered" });
      if (await view.offerContinue()) {
        ops.analytics.track({ name: "ad_shown", kind: "rewarded", placement: "continue" });
        try {
          rewarded = await ops.ads.showRewarded("continue");
        } catch {
          rewarded = false; // an SDK error must not strand the run in continue_offered
        }
        if (rewarded) {
          ops.analytics.track({ name: "ad_rewarded", placement: "continue" });
          ops.analytics.track({ name: "continue_taken" });
          this.rewardPending = true;
          await this.persistRun();
        }
      }
    }
    let events: GameEvent[];
    if (rewarded) {
      const cell = await view.pickContinueCell();
      events = this.run.continueRun(cell.y, cell.x);
      this.rewardPending = false;
    } else {
      events = this.run.declineContinue();
    }
    await this.persistRun();
    await view.replay(events, reduce(this.run.state(), events));
    if (this.run.state().phase === "ended") await this.finishRun();
    else await this.refreshContinueAvailable();
  }

  private async finishRun(): Promise<void> {
    const end = this.run.events().at(-1) as RunEnded;
    const state = this.run.state();
    const summary = {
      mode: this.mode,
      score: state.score,
      placements: state.placements,
      endedBy: end.endedBy,
      ...(this.dailyKeyForRun ? { dailyKey: this.dailyKeyForRun } : {}),
    };
    this.progress.record(summary);
    this.deps.ops.analytics.track({ name: "run_end", mode: this.mode, score: state.score, placements: state.placements, endedBy: end.endedBy });
    await this.saveStore(PROGRESS_KEY, JSON.stringify(this.progress.serialize()));
    await this.saveRemove(RUN_KEY);
    this.continueAvailable = false;
    this.pushStatus();
  }

  private async refreshContinueAvailable(): Promise<void> {
    const state = this.run.state();
    if (state.phase === "ended" || state.continueUsed) {
      this.continueAvailable = false;
      return;
    }
    try {
      this.continueAvailable = await this.deps.ops.ads.rewardedAvailable("continue");
    } catch {
      this.continueAvailable = false;
    }
  }

  private async persistRun(): Promise<void> {
    const stored: StoredRun = {
      mode: this.mode,
      ...(this.dailyKeyForRun ? { dailyKey: this.dailyKeyForRun } : {}),
      ...(this.rewardPending ? { rewardPending: true } : {}),
      save: this.run.serialize(),
    };
    await this.saveStore(RUN_KEY, JSON.stringify(stored));
  }

  /**
   * Saving is best effort. A browser that refuses writes (private mode, full quota)
   * must never interrupt play: the move has already happened in Run, and throwing here
   * would skip its replay and leave the screen out of step with the game.
   */
  private async saveStore(key: string, value: string): Promise<void> {
    try {
      await this.deps.ops.save.store(key, value);
      this.markSave(true);
    } catch {
      this.markSave(false);
    }
  }

  private async saveRemove(key: string): Promise<void> {
    try {
      await this.deps.ops.save.remove(key);
    } catch {
      this.markSave(false);
    }
  }

  private markSave(ok: boolean): void {
    if (this.saveFailing === !ok) return;
    this.saveFailing = !ok;
    this.pushStatus();
  }

  private async loadJson(key: string): Promise<unknown> {
    let raw: string | null;
    try {
      raw = await this.deps.ops.save.load(key);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  private pushStatus(): void {
    this.deps.view.setStatus(this.status());
  }
}
