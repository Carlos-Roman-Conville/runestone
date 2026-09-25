import { describe, expect, it } from "vitest";
import shapesJson from "../data/shapes.json";
import { loadShapes, REQUIRED_SILHOUETTES, ShapeDataError } from "../engine/shapes.js";

type RawShape = { id: string; silhouette: string; cells: number[][]; weight: number };

/** A minimal valid set covering every required silhouette, for the broken-fixture tests. */
function baseShapes(): RawShape[] {
  return [
    { id: "single", silhouette: "single", cells: [[0, 0]], weight: 1 },
    { id: "line2", silhouette: "line2", cells: [[0, 0], [1, 0]], weight: 1 },
    { id: "line3", silhouette: "line3", cells: [[0, 0], [1, 0], [2, 0]], weight: 1 },
    { id: "line4", silhouette: "line4", cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 1 },
    { id: "line5", silhouette: "line5", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], weight: 1 },
    { id: "square2", silhouette: "square2", cells: [[0, 0], [1, 0], [0, 1], [1, 1]], weight: 1 },
    { id: "square3", silhouette: "square3", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], weight: 1 },
    { id: "smallL", silhouette: "smallL", cells: [[0, 0], [0, 1], [1, 1]], weight: 1 },
    { id: "largeL", silhouette: "largeL", cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], weight: 1 },
    { id: "T", silhouette: "T", cells: [[0, 0], [1, 0], [2, 0], [1, 1]], weight: 1 },
    { id: "S", silhouette: "S", cells: [[1, 0], [2, 0], [0, 1], [1, 1]], weight: 1 },
  ];
}

/** The base set with one shape (default "single") patched, wrapped as a document. */
function withShape(patch: Partial<RawShape>, id = "single"): { shapes: RawShape[] } {
  return { shapes: baseShapes().map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

describe("Shapes", () => {
  it("Shapes_LoadsRealData: data/shapes.json loads with 25 entries over the 11 HANDOFF silhouettes", () => {
    const set = loadShapes(shapesJson);
    expect(set.all()).toHaveLength(25);
    expect([...set.silhouettes()].sort()).toEqual([...REQUIRED_SILHOUETTES].sort());
    expect(set.get("square3").cells).toHaveLength(9);
    expect(set.get("Z").silhouette).toBe("S");
    expect(set.has("nope")).toBe(false);
    expect(() => set.get("nope")).toThrow(/unknown shape id/);
  });

  it("real data: every rotation of a silhouette has the same cell count", () => {
    const set = loadShapes(shapesJson);
    const counts = new Map<string, number>();
    for (const s of set.all()) {
      const prev = counts.get(s.silhouette);
      if (prev === undefined) counts.set(s.silhouette, s.cells.length);
      else expect(s.cells.length, s.id).toBe(prev);
    }
  });

  it("records are immutable after load", () => {
    const set = loadShapes(shapesJson);
    const s = set.get("single");
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.cells)).toBe(true);
    expect(Object.isFrozen(set.all())).toBe(true);
    expect(() => {
      (s as { weight: number }).weight = 99;
    }).toThrow();
  });

  it("rejects a document that is not { shapes: [...] }", () => {
    expect(() => loadShapes(null)).toThrow(ShapeDataError);
    expect(() => loadShapes({ shapes: "x" })).toThrow(ShapeDataError);
    expect(() => loadShapes({ shapes: [] })).toThrow(/empty/);
  });

  it("rejects a duplicate id", () => {
    const dup = { ...baseShapes()[0]!, id: "line2" };
    expect(() => loadShapes({ shapes: [...baseShapes(), dup] })).toThrow(/duplicate id "line2"/);
  });

  it("rejects cells not normalized to min x = min y = 0", () => {
    expect(() => loadShapes(withShape({ cells: [[1, 0], [2, 0]] }))).toThrow(/not normalized/);
    expect(() => loadShapes(withShape({ cells: [[0, 1]] }))).toThrow(/not normalized/);
  });

  it("rejects a duplicate cell", () => {
    expect(() => loadShapes(withShape({ cells: [[0, 0], [1, 0], [0, 0]] }))).toThrow(/duplicate cell \(0, 0\)/);
  });

  it("rejects disconnected cells (diagonal contact does not count)", () => {
    expect(() => loadShapes(withShape({ cells: [[0, 0], [2, 0]] }))).toThrow(/not connected/);
    expect(() => loadShapes(withShape({ cells: [[0, 0], [1, 1]] }))).toThrow(/not connected/);
  });

  it("rejects malformed cells", () => {
    expect(() => loadShapes(withShape({ cells: [] }))).toThrow(/non-empty array/);
    expect(() => loadShapes(withShape({ cells: [[0, 0, 0]] }))).toThrow(/\[x, y\]/);
    expect(() => loadShapes(withShape({ cells: [[0.5, 0]] }))).toThrow(/integer/);
  });

  it("rejects a negative or non-numeric weight", () => {
    expect(() => loadShapes(withShape({ weight: -1 }))).toThrow(/weight/);
    expect(() => loadShapes(withShape({ weight: Number.NaN }))).toThrow(/weight/);
    expect(() => loadShapes(withShape({ weight: "3" as unknown as number }))).toThrow(/weight/);
  });

  it("accepts weight 0 on one shape but rejects all weights 0", () => {
    expect(loadShapes(withShape({ weight: 0 })).get("single").weight).toBe(0);
    const doc = { shapes: baseShapes().map((s) => ({ ...s, weight: 0 })) };
    expect(() => loadShapes(doc)).toThrow(/every weight is 0/);
  });

  it("rejects a missing or empty id / silhouette", () => {
    expect(() => loadShapes(withShape({ id: "" }))).toThrow(/id must be/);
    expect(() => loadShapes(withShape({ silhouette: "" }))).toThrow(/silhouette must be/);
  });

  it("rejects a set missing a HANDOFF silhouette", () => {
    const doc = { shapes: baseShapes().filter((s) => s.silhouette !== "T") };
    expect(() => loadShapes(doc)).toThrow(/missing silhouette\(s\).*T/);
  });
});
