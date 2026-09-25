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
  readonly save: RunSave;
}

export interface SessionStatus {
  readonly mode: Mode;
  readonly best: number;
  readonly dailyKey: string;
  readonly dailyDone: boolean;
  readonly adsRemoved: boolean;
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

  constructor(private readonly deps: SessionDeps) {
    this.run = Run.start(deps.shapes, deps.config, deps.randomSeed());
  }

  /** Load progress, then resume the saved run if one is in flight, else start endless. */
  async boot(): Promise<void> {
    this.progress = Progress.deserialize(await this.loadJson(PROGRESS_KEY));
    const stored = (await this.loadJson(RUN_KEY)) as StoredRun | null;
    if (stored && stored.save && stored.save.phase !== "ended") {
      try {
        this.run = Run.deserialize(this.deps.shapes, this.deps.config, stored.save);
        this.mode = stored.mode;
        this.dailyKeyForRun = stored.dailyKey;
        this.pushStatus();
        await this.deps.view.replay([], this.viewState());
        await this.refreshContinueAvailable();
        if (this.run.state().phase === "continue_offered") await this.handleOffer();
        return;
      } catch {
        // A save from an older engine that no longer loads: start fresh rather than brick.
      }
    }
    await this.startEndless();
  }

  async startEndless(): Promise<void> {
    await this.startRun("endless", this.deps.randomSeed(), undefined);
  }

  /** False when today's daily is already done (R7: one attempt per day). */
  async startDaily(): Promise<boolean> {
    const key = dailyKey(this.deps.now());
    if (this.progress.dailyDone(key)) return false;
    await this.startRun("daily", dailySeedForKey(key), key);
    this.deps.ops.analytics.track({ name: "daily_played", day: key });
    return true;
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

  /** R3: one rewarded ad per run; the engine already refuses a second offer. */
  private async handleOffer(): Promise<void> {
    const { ops, view } = this.deps;
    ops.analytics.track({ name: "continue_offered" });
    let rewarded = false;
    if (await view.offerContinue()) {
      ops.analytics.track({ name: "ad_shown", kind: "rewarded", placement: "continue" });
      rewarded = await ops.ads.showRewarded("continue");
      if (rewarded) ops.analytics.track({ name: "ad_rewarded", placement: "continue" });
    }
    let events: GameEvent[];
    if (rewarded) {
      ops.analytics.track({ name: "continue_taken" });
      const cell = await view.pickContinueCell();
      events = this.run.continueRun(cell.y, cell.x);
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
    await this.deps.ops.save.store(PROGRESS_KEY, JSON.stringify(this.progress.serialize()));
    await this.deps.ops.save.remove(RUN_KEY);
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
      save: this.run.serialize(),
    };
    await this.deps.ops.save.store(RUN_KEY, JSON.stringify(stored));
  }

  private async loadJson(key: string): Promise<unknown> {
    const raw = await this.deps.ops.save.load(key);
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
