/**
 * Fuzz: hundreds of runs with random legal and illegal moves, random ad availability,
 * random continue choices and cells, and random save/restore mid-run. Every log is
 * rebuilt independently by checkLog; every restore must continue identically.
 */

import { describe, expect, it } from "vitest";
import { Run } from "../engine/run.js";
import { config, shapes } from "./helpers/play.js";
import { checkLog, prng } from "./helpers/grammar.js";

function randomRun(seed: number): { run: Run; restores: number } {
  const rnd = prng(seed * 7919 + 1);
  let run = Run.start(shapes, config, seed);
  let restores = 0;
  for (let step = 0; step < 2000; step++) {
    const st = run.state();
    if (st.phase === "ended") break;

    if (rnd() < 0.05) {
      // Save and restore through JSON, as the app does across a restart.
      const copy = Run.deserialize(shapes, config, JSON.parse(JSON.stringify(run.serialize())));
      expect(copy.state()).toEqual(run.state());
      run = copy;
      restores++;
    }

    if (st.phase === "continue_offered") {
      if (rnd() < 0.6) run.continueRun(Math.floor(rnd() * 8), Math.floor(rnd() * 8));
      else run.declineContinue();
      continue;
    }

    const options = { continueAvailable: rnd() < 0.5 };
    if (rnd() < 0.1) {
      // Illegal on purpose: random slot and origin, possibly off-board or a placed slot.
      const before = JSON.stringify({ ...run.serialize(), events: [] });
      const ev = run.place(Math.floor(rnd() * 5) - 1, { x: Math.floor(rnd() * 12) - 2, y: Math.floor(rnd() * 12) - 2 }, options);
      if (ev[0]?.type === "PlacementRejected") expect(JSON.stringify({ ...run.serialize(), events: [] })).toBe(before);
      continue;
    }

    const legal: { h: number; x: number; y: number }[] = [];
    for (let h = 0; h < 3; h++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (run.canPlace(h, { x, y })) legal.push({ h, x, y });
    expect(legal.length, "playing phase with no legal move").toBeGreaterThan(0);
    const m = legal[Math.floor(rnd() * legal.length)]!;
    const preview = run.preview(m.h, { x: m.x, y: m.y });
    const ev = run.place(m.h, { x: m.x, y: m.y }, options);
    const scored = ev.find((e) => e.type === "ComboScored");
    expect(scored).toMatchObject({ points: preview!.points, linesCleared: preview!.linesCleared });
  }
  return { run, restores };
}

describe("fuzz", () => {
  it("400 random runs: every event log independently explains the final state", () => {
    let continues = 0;
    let declines = 0;
    let restores = 0;
    let ended = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = randomRun(seed);
      restores += r.restores;
      const events = r.run.events();
      try {
        checkLog(events, r.run.state(), shapes);
      } catch (err) {
        throw new Error(`seed ${seed}: ${(err as Error).message}`);
      }
      if (events.some((e) => e.type === "ContinueUsed")) continues++;
      if (events.some((e) => e.type === "RunEnded" && e.endedBy === "declined_continue")) declines++;
      if (r.run.state().phase === "ended") ended++;
    }
    // The fuzz must actually reach the interesting paths.
    expect(ended).toBe(400);
    expect(continues).toBeGreaterThan(20);
    expect(declines).toBeGreaterThan(20);
    expect(restores).toBeGreaterThan(100);
  });

  it("the checker itself catches a tampered log", () => {
    const run = Run.start(shapes, config, 3);
    for (let n = 0; n < 5; n++) {
      outer: for (let h = 0; h < 3; h++)
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if (run.canPlace(h, { x, y })) {
              run.place(h, { x, y }, { continueAvailable: false });
              break outer;
            }
    }
    const events = run.events().map((e) => JSON.parse(JSON.stringify(e)));
    const placed = events.find((e) => e.type === "Placed");
    placed.origin.x += 1;
    expect(() => checkLog(events, run.state(), shapes)).toThrow();
    const scored = run.events().map((e) => JSON.parse(JSON.stringify(e)));
    scored.find((e) => e.type === "ComboScored").total += 1;
    expect(() => checkLog(scored, run.state(), shapes)).toThrow(/total/);
  });
});
