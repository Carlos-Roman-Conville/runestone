/**
 * Soak: long random sessions through the real Session with fake ops and a hostile stub
 * view. The view taps Daily and New run at bad moments, the app is "killed" mid
 * animation and rebooted from whatever the save store held at that instant, ads are
 * randomly unavailable, skipped or throwing. Invariants are checked after every step.
 */

import { describe, expect, it } from "vitest";
import { checkLog, prng } from "../engine.tests/helpers/grammar.js";
import { config, shapes } from "../engine.tests/helpers/play.js";
import type { GameEvent } from "../engine/events.js";
import type { Pos } from "../engine/grid.js";
import { dailyKey } from "../engine/daily.js";
import { Progress } from "../engine/progress.js";
import { fakeOps, FakeSave, type FakeOps } from "../ops/fake/index.js";
import { PROGRESS_KEY, RUN_KEY, Session, type SessionView } from "./session.js";
import type { ViewState } from "./view-model.js";

const NOW = new Date("2026-09-26T12:00:00Z");

interface World {
  ops: FakeOps;
  session: Session;
  view: HostileView;
  /** Save-store snapshots taken mid-animation: a kill at that instant. */
  kills: Record<string, string>[];
}

class HostileView implements SessionView {
  session!: Session;
  constructor(
    private readonly rnd: () => number,
    private readonly kills: Record<string, string>[],
    private readonly save: FakeSave,
  ) {}
  async replay(events: readonly GameEvent[]): Promise<void> {
    if (events.length && this.rnd() < 0.08) this.kills.push(this.save.snapshot());
    // A tap on New run or Daily while an animation plays.
    if (this.rnd() < 0.05) await this.session.startEndless();
    if (this.rnd() < 0.05) await this.session.startDaily();
  }
  async offerContinue(): Promise<boolean> {
    if (this.rnd() < 0.1) this.kills.push(this.save.snapshot());
    return this.rnd() < 0.7;
  }
  async pickContinueCell(): Promise<Pos> {
    if (this.rnd() < 0.2) await this.session.startDaily(); // Daily is on screen during pick mode
    if (this.rnd() < 0.1) await this.session.startEndless();
    return { x: Math.floor(this.rnd() * 8), y: Math.floor(this.rnd() * 8) };
  }
  setStatus(): void {}
}

function boot(rnd: () => number, snapshot: Record<string, string>, seedBase: number): World {
  const ops = fakeOps();
  (ops as { save: FakeSave }).save = new FakeSave(snapshot);
  ops.analytics.setConsent(true);
  const kills: Record<string, string>[] = [];
  const view = new HostileView(rnd, kills, ops.save);
  let seed = seedBase;
  const session = new Session({ shapes, config, ops, view, now: () => NOW, randomSeed: () => seed++ });
  view.session = session;
  return { ops, session, view, kills };
}

function scriptAds(ops: FakeOps, rnd: () => number): void {
  ops.ads.rewardedLoaded = rnd() < 0.7;
  ops.ads.watchToEnd = rnd() < 0.8;
  const throwing = rnd() < 0.1;
  const original = Object.getPrototypeOf(ops.ads).showRewarded as FakeOps["ads"]["showRewarded"];
  ops.ads.showRewarded = throwing ? () => Promise.reject(new Error("ad SDK exploded")) : original.bind(ops.ads);
}

async function randomDrop(w: World, rnd: () => number): Promise<void> {
  const run = w.session.run;
  const legal: { h: number; p: Pos }[] = [];
  for (let h = 0; h < 3; h++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (run.canPlace(h, { x, y })) legal.push({ h, p: { x, y } });
  if (!legal.length) return;
  const m = legal[Math.floor(rnd() * legal.length)]!;
  await w.session.drop(m.h, m.p);
}

function invariants(w: World, label: string): void {
  const { session, ops } = w;
  const state = session.run.state();
  checkLog(session.run.events(), state, shapes);
  const snap = ops.save.snapshot();
  const saved = snap[RUN_KEY];
  if (state.phase !== "ended") {
    expect(saved, `${label}: a live run must be saved`).toBeDefined();
    expect(JSON.parse(saved as string).save, `${label}: the save must equal the live run`).toEqual(JSON.parse(JSON.stringify(session.run.serialize())));
  } else {
    expect(saved, `${label}: an ended run must not stay in the run slot`).toBeUndefined();
    const p = JSON.parse(snap[PROGRESS_KEY] as string);
    expect(p).toEqual(session.progress.serialize());
  }
  const events = session.run.events();
  expect(events.filter((e) => e.type === "ContinueUsed").length).toBeLessThanOrEqual(1);
}

describe("session soak", () => {
  it("60 hostile sessions: saves always match, kills never lose a finished run, no soft-locks", async () => {
    let endedRuns = 0;
    let killsReplayed = 0;
    let continuesUsed = 0;
    for (let s = 1; s <= 60; s++) {
      const rnd = prng(s * 104729);
      let w = boot(rnd, {}, s * 1000);
      await w.session.boot();
      for (let step = 0; step < 250; step++) {
        scriptAds(w.ops, rnd);
        const label = `session ${s} step ${step}`;
        const phase = w.session.run.state().phase;
        if (phase === "ended") {
          endedRuns++;
          if (w.session.run.events().some((e) => e.type === "ContinueUsed")) continuesUsed++;
          if (rnd() < 0.3) await w.session.startDaily();
          if (w.session.run.state().phase === "ended") await w.session.startEndless();
        } else if (phase === "continue_offered") {
          throw new Error(`${label}: soft-locked in continue_offered with no pending offer`);
        } else {
          await randomDrop(w, rnd);
        }
        invariants(w, label);

        // Replay any kill taken mid-animation: boot from that instant and check nothing finished was lost.
        const kill = w.kills.shift();
        if (kill && rnd() < 0.5) {
          killsReplayed++;
          const before = Progress.deserialize(kill[PROGRESS_KEY] ? JSON.parse(kill[PROGRESS_KEY]) : null);
          const pending = kill[RUN_KEY] ? JSON.parse(kill[RUN_KEY]) : null;
          w = boot(rnd, kill, s * 1000 + step * 7 + 500);
          await w.session.boot();
          const after = w.session.progress;
          if (pending?.save?.phase === "ended") {
            expect(after.runsPlayed, `${label}: a run that ended before the kill must be recorded on boot`).toBe(before.runsPlayed + 1);
            expect(after.highScore).toBeGreaterThanOrEqual(pending.save.score);
          }
          invariants(w, `${label} after kill`);
        }
      }
    }
    expect(endedRuns).toBeGreaterThan(60);
    expect(killsReplayed).toBeGreaterThan(20);
    expect(continuesUsed).toBeGreaterThan(5);
  });

  it("R7: once a daily is started, tapping Daily again or restarting never grants a second attempt", async () => {
    const rnd = prng(42);
    const w = boot(rnd, {}, 1);
    w.view.replay = async () => {};
    w.view.pickContinueCell = async () => ({ x: 0, y: 0 });
    await w.session.boot();
    expect(await w.session.startDaily()).toBe(true);
    const seed = w.session.run.seed;
    await randomDrop(w, rnd);
    const placed = w.session.run.state().placements;
    expect(placed).toBe(1);
    expect(await w.session.startDaily()).toBe(false); // mid-daily tap: no restart
    expect(w.session.run.state().placements).toBe(1);

    const again = boot(rnd, w.ops.save.snapshot(), 2);
    again.view.replay = async () => {};
    await again.session.boot();
    expect(again.session.run.seed).toBe(seed); // resumed, same daily
    expect(again.session.run.state().placements).toBe(1);
    expect(await again.session.startDaily()).toBe(false);
    expect(again.session.progress.dailyDone(dailyKey(NOW))).toBe(true);
  });
});
