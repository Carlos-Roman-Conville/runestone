import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../engine/events.js";
import type { RunState } from "../engine/run.js";
import { reduce } from "./view-model.js";

const here = dirname(fileURLToPath(import.meta.url));

function state(partial: Partial<RunState> & Pick<RunState, "grid" | "hand">): RunState {
  return {
    seed: 1,
    phase: "playing",
    score: 0,
    placements: 0,
    streak: 0,
    continueUsed: false,
    ...partial,
  };
}

describe("view-model", () => {
  it("reduce: a plain placement sets lastPlacement.cells and points, no cleared cells", () => {
    const events: GameEvent[] = [
      {
        type: "Placed",
        turn: 1,
        handIndex: 0,
        shapeId: "square2",
        origin: { x: 0, y: 0 },
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      },
      { type: "LinesCleared", turn: 1, rows: [], cols: [], boxes: [], cells: [] },
      { type: "ComboScored", turn: 1, points: 4, linesCleared: 0, combo: 0, streak: 0, total: 4 },
    ];
    const after = state({
      grid: [
        "##......",
        "##......",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
      ],
      hand: ["line2_v", "square3", null],
      score: 4,
    });
    const v = reduce(after, events);
    expect(v.lastPlacement?.cells).toHaveLength(4);
    expect(v.lastPlacement?.points).toBe(4);
    expect(v.lastPlacement?.cleared).toEqual([]);
    expect(v.lastPlacement?.linesCleared).toBe(0);
  });

  it("reduce: a clearing placement lists rows, cols, cleared cells and combo", () => {
    const events: GameEvent[] = [
      {
        type: "Placed",
        turn: 1,
        handIndex: 0,
        shapeId: "single",
        origin: { x: 6, y: 2 },
        cells: [{ x: 6, y: 2 }],
      },
      {
        type: "LinesCleared",
        turn: 1,
        rows: [2],
        cols: [6],
        boxes: [],
        cells: [
          { x: 6, y: 0 },
          { x: 6, y: 1 },
          { x: 6, y: 2 },
        ],
      },
      { type: "ComboScored", turn: 1, points: 50, linesCleared: 2, combo: 2, streak: 1, total: 50 },
    ];
    const after = state({ grid: Array(8).fill("........"), hand: [null, null, null], score: 50, streak: 1 });
    const v = reduce(after, events);
    expect(v.lastPlacement?.rows).toEqual([2]);
    expect(v.lastPlacement?.cols).toEqual([6]);
    expect(v.lastPlacement?.cleared).toHaveLength(3);
    expect(v.lastPlacement?.combo).toBe(2);
    expect(v.lastPlacement?.linesCleared).toBe(2);
  });

  it("reduce: PlacementRejected gives lastPlacement null and leaves grid/hand from state", () => {
    const grid = ["........", "........", "........", "........", "........", "........", "........", "........"];
    const hand: (string | null)[] = ["single", "line2_h", "line3_v"];
    const after = state({ grid, hand, score: 10, streak: 2 });
    const events: GameEvent[] = [
      { type: "PlacementRejected", turn: 0, handIndex: 0, origin: { x: -1, y: 0 }, reason: "out_of_bounds" },
    ];
    const v = reduce(after, events);
    expect(v.lastPlacement).toBeNull();
    expect(v.grid).toEqual(grid);
    expect(v.hand).toEqual(hand);
    expect(v.score).toBe(10);
    expect(v.streak).toBe(2);
  });

  it("reduce: RunEnded sets phase ended", () => {
    const after = state({
      phase: "ended",
      grid: Array(8).fill("........"),
      hand: ["single", "line2_h", "line3_v"],
      score: 99,
    });
    const events: GameEvent[] = [{ type: "RunEnded", turn: 5, score: 99, placements: 5, endedBy: "no_fit" }];
    expect(reduce(after, events).phase).toBe("ended");
  });

  it("reduce: HandDrawn in the same action shows the new hand", () => {
    const events: GameEvent[] = [
      {
        type: "Placed",
        turn: 3,
        handIndex: 2,
        shapeId: "single",
        origin: { x: 0, y: 0 },
        cells: [{ x: 0, y: 0 }],
      },
      { type: "LinesCleared", turn: 3, rows: [], cols: [], boxes: [], cells: [] },
      { type: "ComboScored", turn: 3, points: 1, linesCleared: 0, combo: 0, streak: 0, total: 3 },
      { type: "HandEmpty", turn: 3 },
      {
        type: "HandDrawn",
        turn: 3,
        shapes: ["line4_h", "T_0", "smallL_1"],
        mercy: false,
      },
    ];
    const after = state({
      grid: Array(8).fill("........"),
      hand: ["line4_h", "T_0", "smallL_1"],
      score: 3,
      placements: 3,
    });
    const v = reduce(after, events);
    expect(v.hand).toEqual(["line4_h", "T_0", "smallL_1"]);
    expect(v.lastPlacement?.cells).toEqual([{ x: 0, y: 0 }]);
  });

  it("reduce: never imports pixi", async () => {
    const src = readFileSync(join(here, "view-model.ts"), "utf8");
    expect(src).not.toMatch(/pixi\.js/);
    const mod = await import("./view-model.js");
    expect(Object.keys(mod)).toContain("reduce");
  });
});
