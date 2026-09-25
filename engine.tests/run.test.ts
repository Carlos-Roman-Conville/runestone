import { describe, expect, it } from "vitest";
import type { ComboScored, HandDrawn, PlacementRejected, RunEnded } from "../engine/events.js";
import { Run } from "../engine/run.js";
import { config, craft, EMPTY_ROW, firstFit, FULL_ROW, playOut, shapes, singlesOnlyBoard, types } from "./helpers/play.js";

const NO_AD = { continueAvailable: false };
const AD = { continueAvailable: true };

describe("Run start", () => {
  it("emits RunStarted then HandDrawn with three real shape ids and an empty grid", () => {
    const run = Run.start(shapes, config, 1);
    expect(types(run.events())).toEqual(["RunStarted", "HandDrawn"]);
    const hand = run.events()[1] as HandDrawn;
    expect(hand.turn).toBe(0);
    for (const id of hand.shapes) expect(shapes.has(id)).toBe(true);
    const s = run.state();
    expect(s.phase).toBe("playing");
    expect(s.grid).toEqual(Array(8).fill(EMPTY_ROW));
    expect(s.hand).toEqual([...hand.shapes]);
    expect(s.score).toBe(0);
    expect(s.placements).toBe(0);
  });

  it("same seed + same inputs → identical event log", () => {
    const a = Run.start(shapes, config, 42);
    const b = Run.start(shapes, config, 42);
    playOut(a);
    playOut(b);
    expect(a.events()).toEqual(b.events());
    expect(a.state()).toEqual(b.state());
  });

  it("different seeds give different hands", () => {
    const a = Run.start(shapes, config, 1).state().hand;
    const b = Run.start(shapes, config, 2).state().hand;
    expect(a).not.toEqual(b);
  });
});

describe("Run illegal placement", () => {
  function rejected(run: Run, handIndex: number, origin: { x: number; y: number }): PlacementRejected {
    const before = run.serialize();
    const events = run.place(handIndex, origin, NO_AD);
    expect(events).toHaveLength(1);
    const e = events[0] as PlacementRejected;
    expect(e.type).toBe("PlacementRejected");
    const after = run.serialize();
    expect({ ...after, events: [] }).toEqual({ ...before, events: [] });
    expect(after.events).toEqual([...before.events, e]);
    return e;
  }

  it("no_such_shape for an index outside the hand", () => {
    const run = craft({ rows: Array(8).fill(EMPTY_ROW), hand: ["single", "single", "single"], seed: 1 });
    expect(rejected(run, 3, { x: 0, y: 0 }).reason).toBe("no_such_shape");
    expect(rejected(run, -1, { x: 0, y: 0 }).reason).toBe("no_such_shape");
  });

  it("no_such_shape for a slot already placed", () => {
    const run = craft({ rows: Array(8).fill(EMPTY_ROW), hand: [null, "single", "single"], seed: 1 });
    expect(rejected(run, 0, { x: 0, y: 0 }).reason).toBe("no_such_shape");
  });

  it("out_of_bounds when any cell leaves the grid", () => {
    const run = craft({ rows: Array(8).fill(EMPTY_ROW), hand: ["line5_h", "single", "single"], seed: 1 });
    expect(rejected(run, 0, { x: 4, y: 0 }).reason).toBe("out_of_bounds");
    expect(rejected(run, 1, { x: -1, y: 0 }).reason).toBe("out_of_bounds");
  });

  it("occupied when in bounds but overlapping", () => {
    const rows = [...Array(7).fill(EMPTY_ROW), FULL_ROW];
    const run = craft({ rows, hand: ["single", "single", "single"], seed: 1 });
    expect(rejected(run, 0, { x: 0, y: 7 }).reason).toBe("occupied");
    expect(run.canPlace(0, { x: 0, y: 7 })).toBe(false);
    expect(run.canPlace(0, { x: 0, y: 6 })).toBe(true);
  });
});

describe("Run legal placement", () => {
  it("emits Placed → LinesCleared → ComboScored and nothing else when nothing clears", () => {
    const run = craft({ rows: Array(8).fill(EMPTY_ROW), hand: ["square2", "single", "single"], seed: 1 });
    const events = run.place(0, { x: 2, y: 3 }, NO_AD);
    expect(types(events)).toEqual(["Placed", "LinesCleared", "ComboScored"]);
    const scored = events[2] as ComboScored;
    expect(scored.points).toBe(4 * config.scoring.perCell);
    expect(scored.linesCleared).toBe(0);
    expect(scored.combo).toBe(0);
    expect(scored.streak).toBe(0);
    expect(scored.total).toBe(scored.points);
    for (const e of events) expect(e.turn).toBe(1);
    const s = run.state();
    expect(s.hand).toEqual([null, "single", "single"]);
    expect(s.placements).toBe(1);
    expect(s.grid[3]).toBe("..##....");
  });

  it("clears a line, scores it, and emits StreakChanged 0 → 1", () => {
    const rows = ["#######.", ...Array(7).fill(EMPTY_ROW)];
    const run = craft({ rows, hand: ["single", "single", "single"], seed: 1 });
    const events = run.place(0, { x: 7, y: 0 }, NO_AD);
    expect(types(events)).toEqual(["Placed", "LinesCleared", "ComboScored", "StreakChanged"]);
    const scored = events[2] as ComboScored;
    expect(scored.linesCleared).toBe(1);
    expect(scored.combo).toBe(config.scoring.comboMultiplier[1]);
    expect(scored.streak).toBe(1);
    expect(scored.points).toBe(config.scoring.perCell + config.scoring.perLine * config.scoring.comboMultiplier[1]! * config.scoring.streakMultiplier[0]!);
    expect(run.state().grid[0]).toBe(EMPTY_ROW);
    expect(run.state().streak).toBe(1);
  });

  it("streak resets on a non-clearing placement (R9) with StreakChanged n → 0", () => {
    const rows = ["#######.", ...Array(7).fill(EMPTY_ROW)];
    const run = craft({ rows, hand: ["single", "single", "single"], seed: 1 });
    run.place(0, { x: 7, y: 0 }, NO_AD);
    const events = run.place(1, { x: 3, y: 3 }, NO_AD);
    expect(types(events)).toEqual(["Placed", "LinesCleared", "ComboScored", "StreakChanged"]);
    expect(events[3]).toMatchObject({ from: 1, to: 0 });
  });

  it("R10: a new hand is drawn only when all three are placed", () => {
    const run = Run.start(shapes, config, 3);
    const first = run.state().hand;
    const a = run.place(firstFit(run)!.handIndex, firstFit(run)!.origin, NO_AD);
    expect(types(a)).not.toContain("HandDrawn");
    const b = run.place(firstFit(run)!.handIndex, firstFit(run)!.origin, NO_AD);
    expect(types(b)).not.toContain("HandDrawn");
    expect(run.state().hand.filter((h) => h === null)).toHaveLength(2);
    const c = run.place(firstFit(run)!.handIndex, firstFit(run)!.origin, NO_AD);
    const t = types(c);
    expect(t.indexOf("HandEmpty")).toBeGreaterThan(t.indexOf("ComboScored"));
    expect(t.indexOf("HandDrawn")).toBe(t.indexOf("HandEmpty") + 1);
    expect(run.state().hand.every((h) => h !== null)).toBe(true);
    expect(run.state().hand).not.toEqual(first);
  });

  it("turn on every event equals the placement count", () => {
    const run = Run.start(shapes, config, 5);
    playOut(run);
    let placements = 0;
    for (const e of run.events()) {
      if (e.type === "Placed") placements++;
      expect(e.turn, e.type).toBe(placements);
    }
  });
});

describe("Run game over and continue (R3)", () => {
  // After the single lands at (3,3) only isolated holes remain, so square2 / T_0 / lines cannot fit.
  const lastCell = { x: 3, y: 3 };
  const nearlyFull = singlesOnlyBoard();

  it("ends with RunEnded no_fit when nothing fits and no ad is available", () => {
    const run = craft({ rows: nearlyFull, hand: ["single", "square2", "T_0"], seed: 1 });
    const events = run.place(0, lastCell, NO_AD);
    expect(types(events)).toEqual(["Placed", "LinesCleared", "ComboScored", "NoFitDetected", "RunEnded"]);
    expect(events[3]).toMatchObject({ hand: ["square2", "T_0"] });
    const end = events[4] as RunEnded;
    expect(end.endedBy).toBe("no_fit");
    expect(end.placements).toBe(1);
    expect(end.score).toBe(run.state().score);
    expect(run.state().phase).toBe("ended");
    expect(run.canContinue()).toBe(false);
  });

  it("offers a continue when an ad is available, then applies it once", () => {
    const run = craft({ rows: nearlyFull, hand: ["single", "line2_h", "line3_v"], seed: 1 });
    const events = run.place(0, lastCell, AD);
    expect(types(events)).toEqual(["Placed", "LinesCleared", "ComboScored", "NoFitDetected", "ContinueOffered"]);
    expect(run.state().phase).toBe("continue_offered");
    expect(run.canContinue()).toBe(true);
    expect(() => run.place(1, { x: 0, y: 0 }, AD)).toThrow(/continue_offered/);

    const used = run.continueRun(3, 3);
    expect(types(used)).toEqual(["ContinueUsed"]);
    expect(used[0]).toMatchObject({ row: 3, col: 3 });
    expect((used[0] as { cells: unknown[] }).cells).toHaveLength(13); // row 3 has 7 filled, column 3 has 6 more
    const s = run.state();
    expect(s.phase).toBe("playing");
    expect(s.continueUsed).toBe(true);
    expect(s.grid[3]).toBe(EMPTY_ROW);
    expect(s.grid.map((r) => r[3]).join("")).toBe("........");
    expect(s.hand).toEqual([null, "line2_h", "line3_v"]);
    expect(run.canContinue()).toBe(false);
    expect(() => run.continueRun(0, 0)).toThrow(/no continue/);
  });

  it("a second no-fit after the continue ends the run even with an ad available", () => {
    const run = craft({ rows: nearlyFull, hand: ["single", "line2_h", "line3_v"], seed: 1 });
    run.place(0, lastCell, AD);
    run.continueRun(3, 3);
    const events = playOut(run, true);
    const t = types(events);
    expect(t.filter((x) => x === "ContinueOffered")).toHaveLength(0);
    expect(t[t.length - 1]).toBe("RunEnded");
    expect((events[events.length - 1] as RunEnded).endedBy).toBe("no_fit");
  });

  it("continue applied to a hand that still cannot fit ends the run immediately", () => {
    // A 3x3 cannot fit a one-wide cross even with the diagonal holes beside it (a 2x2 could).
    const run = craft({ rows: nearlyFull, hand: ["single", "square3", "square3"], seed: 1 });
    run.place(0, lastCell, AD);
    const events = run.continueRun(3, 3);
    expect(types(events)).toEqual(["ContinueUsed", "NoFitDetected", "RunEnded"]);
    expect(run.state().phase).toBe("ended");
  });

  it("declining the continue ends the run with declined_continue", () => {
    const run = craft({ rows: nearlyFull, hand: ["single", "square2", "T_0"], seed: 1 });
    run.place(0, lastCell, AD);
    const events = run.declineContinue();
    expect(types(events)).toEqual(["RunEnded"]);
    expect((events[0] as RunEnded).endedBy).toBe("declined_continue");
    expect(() => run.declineContinue()).toThrow(/no continue/);
    expect(() => run.place(1, { x: 0, y: 0 }, AD)).toThrow(/ended/);
  });

  it("never offers a continue once one was used, even on a fresh no-fit", () => {
    const run = craft({ rows: nearlyFull, hand: ["single", "square2", "T_0"], seed: 1, continueUsed: true });
    const events = run.place(0, lastCell, AD);
    expect(types(events)).toEqual(["Placed", "LinesCleared", "ComboScored", "NoFitDetected", "RunEnded"]);
  });

  it("continueRun rejects an out-of-grid row or column", () => {
    const run = craft({ rows: nearlyFull, hand: ["single", "square2", "T_0"], seed: 1 });
    run.place(0, lastCell, AD);
    expect(() => run.continueRun(8, 0)).toThrow(RangeError);
    expect(run.canContinue()).toBe(true);
  });
});

describe("Run copies", () => {
  it("clone does not alias: playing the clone leaves the original untouched", () => {
    const run = Run.start(shapes, config, 9);
    const before = run.serialize();
    const copy = run.clone();
    playOut(copy);
    expect(run.serialize()).toEqual(before);
    expect(copy.state().phase).toBe("ended");
    expect(run.state().phase).toBe("playing");
  });

  it("clone continues identically to the original", () => {
    const run = Run.start(shapes, config, 10);
    const copy = run.clone();
    playOut(run);
    playOut(copy);
    expect(copy.events()).toEqual(run.events());
  });

  it("serialize/deserialize round-trips mid-run and continues identically", () => {
    const run = Run.start(shapes, config, 11);
    for (let i = 0; i < 5; i++) {
      const m = firstFit(run)!;
      run.place(m.handIndex, m.origin, NO_AD);
    }
    const save = JSON.parse(JSON.stringify(run.serialize()));
    const restored = Run.deserialize(shapes, config, save);
    expect(restored.state()).toEqual(run.state());
    expect(restored.events()).toEqual(run.events());
    playOut(run);
    playOut(restored);
    expect(restored.events()).toEqual(run.events());
  });

  it("deserialize rejects an unknown version or a bad hand", () => {
    const save = Run.start(shapes, config, 1).serialize();
    expect(() => Run.deserialize(shapes, config, { ...save, version: 2 as unknown as 1 })).toThrow(/version/);
    expect(() => Run.deserialize(shapes, config, { ...save, hand: ["single"] })).toThrow(/slots/);
    expect(() => Run.deserialize(shapes, config, { ...save, hand: ["nope", null, null] })).toThrow(/unknown shape id/);
  });

  it("preview reports what a placement would do without doing it", () => {
    const rows = ["#######.", ...Array(7).fill(EMPTY_ROW)];
    const run = craft({ rows, hand: ["single", "square2", "single"], seed: 1 });
    const before = run.serialize();
    const p = run.preview(0, { x: 7, y: 0 })!;
    expect(p.linesCleared).toBe(1);
    expect(p.streakAfter).toBe(1);
    expect(p.filledAfter).toBe(0);
    expect(p.gridAfter).toEqual(Array(8).fill(EMPTY_ROW));
    expect(p.points).toBe(config.scoring.perCell + config.scoring.perLine * config.scoring.comboMultiplier[1]! * config.scoring.streakMultiplier[0]!);
    expect(run.preview(1, { x: 0, y: 4 })).toMatchObject({ points: 4 * config.scoring.perCell, linesCleared: 0, filledAfter: 11 });
    expect(run.preview(1, { x: 7, y: 0 })).toBeNull();
    expect(run.preview(5, { x: 0, y: 0 })).toBeNull();
    expect(run.serialize()).toEqual(before);
    const real = run.place(0, { x: 7, y: 0 }, NO_AD);
    expect(real[2]).toMatchObject({ points: p.points, linesCleared: 1 });
  });

  it("events() and state() return copies", () => {
    const run = Run.start(shapes, config, 1);
    const ev = run.events() as unknown[];
    ev.pop();
    expect(run.events()).toHaveLength(2);
    const s = run.state();
    (s.hand as (string | null)[])[0] = null;
    expect(run.state().hand[0]).not.toBeNull();
  });
});
