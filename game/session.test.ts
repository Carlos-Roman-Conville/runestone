import { describe, expect, it } from "vitest";
import { config, craft, shapes, singlesOnlyBoard } from "../engine.tests/helpers/play.js";
import type { GameEvent } from "../engine/events.js";
import type { Pos } from "../engine/grid.js";
import { dailyKey, dailySeedForKey } from "../engine/daily.js";
import { fakeOps, FakeSave, type FakeOps } from "../ops/fake/index.js";
import { PROGRESS_KEY, RUN_KEY, Session, type SessionStatus, type SessionView } from "./session.js";
import type { ViewState } from "./view-model.js";

/** A stub scene that records what it was asked and answers from a script. */
class StubView implements SessionView {
  replays: { types: string[]; phase: ViewState["phase"] }[] = [];
  statuses: SessionStatus[] = [];
  offers = 0;
  picks = 0;
  wantsAd = true;
  cell: Pos = { x: 3, y: 3 };

  async replay(events: readonly GameEvent[], view: ViewState): Promise<void> {
    this.replays.push({ types: events.map((e) => e.type), phase: view.phase });
  }
  async offerContinue(): Promise<boolean> {
    this.offers++;
    return this.wantsAd;
  }
  async pickContinueCell(): Promise<Pos> {
    this.picks++;
    return this.cell;
  }
  setStatus(status: SessionStatus): void {
    this.statuses.push(status);
  }
}

const NOW = new Date("2026-09-25T12:00:00Z");

function make(ops: FakeOps = fakeOps(), view = new StubView(), now = NOW) {
  let seed = 100;
  const session = new Session({ shapes, config, ops, view, now: () => now, randomSeed: () => seed++ });
  return { session, ops, view };
}

/** A saved run one single away from a no-fit board, so the next drop triggers the offer. */
function nearNoFitSave(hand: [string, string, string] = ["single", "square3", "square3"]) {
  const run = craft({ rows: singlesOnlyBoard(), hand, seed: 1 });
  return JSON.stringify({ mode: "endless", save: run.serialize() });
}

describe("Session boot and save", () => {
  it("boot with nothing saved starts an endless run and saves it", async () => {
    const { session, ops, view } = make();
    await session.boot();
    expect(session.mode).toBe("endless");
    expect(session.run.state().phase).toBe("playing");
    expect(view.replays[0]?.types).toEqual(["HandDrawn"]);
    expect(ops.save.snapshot()[RUN_KEY]).toBeDefined();
    expect(view.statuses.at(-1)?.best).toBe(0);
  });

  it("a run survives a restart: drop, rebuild from the save snapshot, same state", async () => {
    const a = make();
    await a.session.boot();
    const hand = a.session.run.state().hand;
    // First legal origin for slot 0 on an empty board is (0,0) for any shape.
    await a.session.drop(0, { x: 0, y: 0 });
    expect(a.session.run.state().hand[0]).toBeNull();
    expect(a.session.run.state().hand.slice(1)).toEqual(hand.slice(1));

    const restarted = fakeOps();
    (restarted as { save: FakeSave }).save = new FakeSave(a.ops.save.snapshot());
    const b = make(restarted);
    await b.session.boot();
    expect(b.session.run.state()).toEqual(a.session.run.state());
    expect(b.session.run.events()).toEqual(a.session.run.events());
    expect(b.view.replays[0]?.types).toEqual([]); // resumed, not re-dealt
  });

  it("a finished run records progress, clears the run save, and the next boot starts fresh", async () => {
    const ops = fakeOps();
    ops.ads.rewardedLoaded = false;
    await ops.save.store(RUN_KEY, nearNoFitSave());
    const { session, view } = make(ops);
    await session.boot();
    await session.drop(0, { x: 3, y: 3 });
    expect(session.run.state().phase).toBe("ended");
    expect(view.replays.at(-1)?.types).toEqual(["Placed", "LinesCleared", "ComboScored", "NoFitDetected", "RunEnded"]);
    expect(session.progress.runsPlayed).toBe(1);
    expect(session.progress.highScore).toBe(session.run.state().score);
    const snap = ops.save.snapshot();
    expect(snap[RUN_KEY]).toBeUndefined();
    expect(JSON.parse(snap[PROGRESS_KEY] as string).runsPlayed).toBe(1);
    expect(view.statuses.at(-1)?.best).toBe(session.run.state().score);

    const again = make(ops);
    await again.session.boot();
    expect(again.session.run.state().placements).toBe(0);
    expect(again.session.progress.highScore).toBe(session.run.state().score);
  });

  it("a save store that refuses every write never interrupts play, and the view is told", async () => {
    const ops = fakeOps();
    ops.save.store = () => Promise.reject(new DOMException("QuotaExceededError"));
    ops.save.remove = () => Promise.reject(new DOMException("QuotaExceededError"));
    const { session, view } = make(ops);
    await session.boot();
    expect(session.run.state().phase).toBe("playing");
    const replaysBefore = view.replays.length;
    await session.drop(0, { x: 0, y: 0 });
    expect(session.run.state().placements).toBe(1);
    expect(view.replays.length).toBe(replaysBefore + 1); // the move was animated
    expect(view.replays.at(-1)?.types[0]).toBe("Placed");
    expect(view.statuses.at(-1)?.saveFailing).toBe(true);
  });

  it("garbage in the save store does not brick boot", async () => {
    const ops = fakeOps();
    await ops.save.store(RUN_KEY, "{not json");
    await ops.save.store(PROGRESS_KEY, "[]");
    const { session } = make(ops);
    await session.boot();
    expect(session.run.state().phase).toBe("playing");
  });
});

describe("Session continue via rewarded ad (R3)", () => {
  async function bootNearNoFit(script: { loaded?: boolean; watchToEnd?: boolean; wantsAd?: boolean; hand?: [string, string, string] }) {
    const ops = fakeOps();
    ops.ads.rewardedLoaded = script.loaded ?? true;
    ops.ads.watchToEnd = script.watchToEnd ?? true;
    ops.analytics.setConsent(true);
    await ops.save.store(RUN_KEY, nearNoFitSave(script.hand));
    const view = new StubView();
    view.wantsAd = script.wantsAd ?? true;
    const { session } = make(ops, view);
    await session.boot();
    return { session, ops, view };
  }

  it("offers, shows the ad, lets the player pick a cell, and the run continues", async () => {
    const { session, ops, view } = await bootNearNoFit({ hand: ["single", "line2_h", "line3_v"] });
    expect(session.continueAvailable).toBe(true);
    await session.drop(0, { x: 3, y: 3 });
    expect(view.offers).toBe(1);
    expect(view.picks).toBe(1);
    expect(ops.ads.calls).toContain("showRewarded:continue");
    expect(view.replays.at(-2)?.types).toContain("ContinueOffered");
    expect(view.replays.at(-1)?.types).toEqual(["ContinueUsed"]);
    const s = session.run.state();
    expect(s.phase).toBe("playing");
    expect(s.continueUsed).toBe(true);
    expect(s.grid[3]).toBe("........");
    expect(session.continueAvailable).toBe(false); // used; never offered twice
    const names = ops.analytics.events.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["continue_offered", "ad_shown", "ad_rewarded", "continue_taken"]));
  });

  it("the player declines: no ad shown, run ends with declined_continue", async () => {
    const { session, ops, view } = await bootNearNoFit({ wantsAd: false });
    await session.drop(0, { x: 3, y: 3 });
    expect(view.offers).toBe(1);
    expect(view.picks).toBe(0);
    expect(ops.ads.calls).not.toContain("showRewarded:continue");
    expect(view.replays.at(-1)?.types).toEqual(["RunEnded"]);
    expect(session.run.events().at(-1)).toMatchObject({ endedBy: "declined_continue" });
    expect(session.progress.runsPlayed).toBe(1);
  });

  it("the player skips the ad early: no reward, run ends", async () => {
    const { session, view } = await bootNearNoFit({ watchToEnd: false });
    await session.drop(0, { x: 3, y: 3 });
    expect(view.picks).toBe(0);
    expect(session.run.state().phase).toBe("ended");
  });

  it("no ad loaded: no offer at all, run ends with no_fit", async () => {
    const { session, view } = await bootNearNoFit({ loaded: false });
    expect(session.continueAvailable).toBe(false);
    await session.drop(0, { x: 3, y: 3 });
    expect(view.offers).toBe(0);
    expect(session.run.events().at(-1)).toMatchObject({ endedBy: "no_fit" });
  });

  it("a restart after the ad paid out but before the pick goes straight to the pick, no second ad", async () => {
    const ops = fakeOps();
    await ops.save.store(RUN_KEY, nearNoFitSave(["single", "line2_h", "line3_v"]));
    const view = new StubView();
    // The player watches the ad; the app dies while the pick prompt is up.
    let killed: Record<string, string> | null = null;
    view.pickContinueCell = async () => {
      killed = ops.save.snapshot();
      return new Promise<Pos>(() => {}); // never answered: the process is gone
    };
    const first = make(ops, view);
    await first.session.boot();
    void first.session.drop(0, { x: 3, y: 3 });
    for (let i = 0; i < 20 && !killed; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(killed).not.toBeNull();
    expect(ops.ads.calls.filter((c) => c === "showRewarded:continue")).toHaveLength(1);

    const reopened = fakeOps();
    (reopened as { save: FakeSave }).save = new FakeSave(killed as unknown as Record<string, string>);
    const view2 = new StubView();
    const second = make(reopened, view2);
    await second.session.boot();
    expect(view2.offers).toBe(0); // not asked again
    expect(view2.picks).toBe(1); // straight to the pick
    expect(reopened.ads.calls).not.toContain("showRewarded:continue");
    expect(second.session.run.state().continueUsed).toBe(true);
    expect(second.session.run.state().phase).toBe("playing");
    expect(JSON.parse(reopened.save.snapshot()[RUN_KEY] as string).rewardPending).toBeUndefined();
  });

  it("an ad SDK that never answers cannot freeze the game", async () => {
    const ops = fakeOps();
    ops.ads.rewardedAvailable = () => new Promise(() => {});
    ops.ads.showRewarded = () => new Promise(() => {});
    await ops.save.store(RUN_KEY, nearNoFitSave(["single", "line2_h", "line3_v"]));
    const view = new StubView();
    let seed = 100;
    const session = new Session({ shapes, config, ops, view, now: () => NOW, randomSeed: () => seed++, adTimeouts: { availableMs: 20, showMs: 20 } });
    await session.boot(); // would hang forever without the timeout
    expect(session.continueAvailable).toBe(false);
    await session.drop(0, { x: 3, y: 3 });
    expect(session.run.state().phase).toBe("ended"); // no ad ready: plain game over, not a hang
  });

  it("an ad that starts but never reports back counts as not watched", async () => {
    const ops = fakeOps();
    ops.ads.showRewarded = () => new Promise(() => {});
    await ops.save.store(RUN_KEY, nearNoFitSave(["single", "line2_h", "line3_v"]));
    const view = new StubView();
    let seed = 100;
    const session = new Session({ shapes, config, ops, view, now: () => NOW, randomSeed: () => seed++, adTimeouts: { availableMs: 20, showMs: 20 } });
    await session.boot();
    expect(session.continueAvailable).toBe(true);
    await session.drop(0, { x: 3, y: 3 });
    expect(view.offers).toBe(1);
    expect(view.picks).toBe(0);
    expect(session.run.events().at(-1)).toMatchObject({ type: "RunEnded", endedBy: "declined_continue" });
  });

  it("a saved run that was mid-offer re-offers on boot", async () => {
    const ops = fakeOps();
    const run = craft({ rows: singlesOnlyBoard(), hand: ["single", "square3", "square3"], seed: 1 });
    run.place(0, { x: 3, y: 3 }, { continueAvailable: true });
    expect(run.state().phase).toBe("continue_offered");
    await ops.save.store(RUN_KEY, JSON.stringify({ mode: "endless", save: run.serialize() }));
    const view = new StubView();
    view.wantsAd = false;
    const { session } = make(ops, view);
    await session.boot();
    expect(view.offers).toBe(1);
    expect(session.run.state().phase).toBe("ended");
  });
});

describe("Session with two tabs sharing one store", () => {
  it("a stale second tab cannot start a daily the first tab already started (R7)", async () => {
    const ops = fakeOps();
    const a = make(ops);
    const b = make(ops);
    await a.session.boot();
    await b.session.boot(); // both loaded before either started the daily
    expect(await a.session.startDaily()).toBe(true);
    expect(await b.session.startDaily()).toBe(false);
    expect(b.view.statuses.at(-1)?.dailyDone).toBe(true);
  });

  it("a stale tab finishing a run never overwrites a better best from the other tab", async () => {
    const ops = fakeOps();
    ops.ads.rewardedLoaded = false;
    const b = make(ops);
    await b.session.boot(); // tab B opens first, with empty progress
    // Tab A finishes a big run in the meantime.
    await ops.save.store(PROGRESS_KEY, JSON.stringify({ version: 1, highScore: 5000, runsPlayed: 9, dailyDone: ["2026-09-24"], dailyBest: { "2026-09-24": 80 }, adsRemoved: false }));
    // Tab B finishes a small run.
    await ops.save.store(RUN_KEY, nearNoFitSave());
    const b2 = make(ops, b.view);
    await b2.session.boot();
    await b2.session.drop(0, { x: 3, y: 3 });
    const saved = JSON.parse(ops.save.snapshot()[PROGRESS_KEY] as string);
    expect(saved.highScore).toBe(5000);
    expect(saved.dailyDone).toContain("2026-09-24");
    expect(saved.runsPlayed).toBe(10);
  });
});

describe("Session daily (R7)", () => {
  it("starts today's daily with the day's seed, marks it done at the end, refuses a second attempt", async () => {
    const ops = fakeOps();
    ops.ads.rewardedLoaded = false;
    ops.analytics.setConsent(true);
    const { session, view } = make(ops);
    await session.boot();
    const key = dailyKey(NOW);
    expect(view.statuses.at(-1)?.dailyDone).toBe(false);

    expect(await session.startDaily()).toBe(true);
    expect(session.mode).toBe("daily");
    expect(session.run.seed).toBe(dailySeedForKey(key));
    expect(ops.analytics.events.some((e) => e.name === "daily_played")).toBe(true);
    expect(JSON.parse(ops.save.snapshot()[RUN_KEY] as string).dailyKey).toBe(key);

    // Play first-fit to the end.
    while (session.run.state().phase === "playing") {
      let moved = false;
      outer: for (let i = 0; i < 3; i++)
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if (session.run.canPlace(i, { x, y })) {
              await session.drop(i, { x, y });
              moved = true;
              break outer;
            }
      if (!moved) throw new Error("no move");
    }
    expect(session.progress.dailyDone(key)).toBe(true);
    expect(view.statuses.at(-1)?.dailyDone).toBe(true);
    expect(await session.startDaily()).toBe(false);

    // A restart remembers it.
    const again = make(ops);
    await again.session.boot();
    expect(again.session.progress.dailyDone(key)).toBe(true);
    expect(await again.session.startDaily()).toBe(false);
  });

  it("two devices on the same UTC day get the same board", async () => {
    const a = make(fakeOps(), new StubView(), new Date("2026-09-25T01:00:00Z"));
    const b = make(fakeOps(), new StubView(), new Date("2026-09-25T23:00:00Z"));
    await a.session.boot();
    await b.session.boot();
    await a.session.startDaily();
    await b.session.startDaily();
    expect(a.session.run.events()).toEqual(b.session.run.events());
  });
});
