import { describe, expect, it } from "vitest";
import shapesJson from "../data/shapes.json";
import { Grid } from "../engine/grid.js";
import { allOrigins, anyFit, fits, place } from "../engine/placement.js";
import { loadShapes } from "../engine/shapes.js";

const shapes = loadShapes(shapesJson);

describe("Placement", () => {
  it("fits: single fits at every cell of an empty 8x8", () => {
    const grid = Grid.empty(8);
    const single = shapes.get("single");
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(fits(single, { x, y }, grid)).toBe(true);
      }
    }
  });

  it("fits: line5_h fits at x=3 and not at x=4 on row 0", () => {
    const grid = Grid.empty(8);
    const line5 = shapes.get("line5_h");
    expect(fits(line5, { x: 3, y: 0 }, grid)).toBe(true);
    expect(fits(line5, { x: 4, y: 0 }, grid)).toBe(false);
  });

  it("fits: line5_v fits at y=3 and not at y=4", () => {
    const grid = Grid.empty(8);
    const line5 = shapes.get("line5_v");
    expect(fits(line5, { x: 0, y: 3 }, grid)).toBe(true);
    expect(fits(line5, { x: 0, y: 4 }, grid)).toBe(false);
  });

  it("fits: square3 fits at every corner and not one past any corner", () => {
    const grid = Grid.empty(8);
    const square3 = shapes.get("square3");
    expect(fits(square3, { x: 0, y: 0 }, grid)).toBe(true);
    expect(fits(square3, { x: 5, y: 0 }, grid)).toBe(true);
    expect(fits(square3, { x: 0, y: 5 }, grid)).toBe(true);
    expect(fits(square3, { x: 5, y: 5 }, grid)).toBe(true);
    expect(fits(square3, { x: 6, y: 0 }, grid)).toBe(false);
    expect(fits(square3, { x: 0, y: 6 }, grid)).toBe(false);
    expect(fits(square3, { x: -1, y: 0 }, grid)).toBe(false);
    expect(fits(square3, { x: 0, y: -1 }, grid)).toBe(false);
  });

  it("fits: overlap with a filled cell is rejected", () => {
    const grid = Grid.fromRows([
      "........",
      "........",
      "........",
      "...#....",
      "........",
      "........",
      "........",
      "........",
    ]);
    const square2 = shapes.get("square2");
    expect(fits(square2, { x: 3, y: 3 }, grid)).toBe(false);
    expect(fits(square2, { x: 4, y: 3 }, grid)).toBe(true);
  });

  it("fits: negative origin is out of bounds", () => {
    const grid = Grid.empty(8);
    const single = shapes.get("single");
    expect(fits(single, { x: -1, y: 0 }, grid)).toBe(false);
    expect(fits(single, { x: 0, y: -1 }, grid)).toBe(false);
  });

  it("place: fills exactly shape.cells.length cells and returns them", () => {
    const grid = Grid.empty(8);
    const largeL = shapes.get("largeL_0");
    const filled = place(largeL, { x: 2, y: 2 }, grid);
    expect(filled).toHaveLength(5);
    expect(grid.count()).toBe(5);
    const expected = [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ];
    expect(filled).toEqual(expected);
    for (const p of expected) expect(grid.isFilled(p.x, p.y)).toBe(true);
  });

  it("place: throws when !fits and leaves the grid untouched", () => {
    const full = Grid.fromRows(Array.from({ length: 8 }, () => "########"));
    const single = shapes.get("single");
    const beforeFull = full.toRows();
    expect(() => place(single, { x: 0, y: 0 }, full)).toThrow(RangeError);
    expect(full.toRows()).toEqual(beforeFull);

    const grid = Grid.fromRows([
      "........",
      "........",
      "........",
      "...#....",
      "........",
      "........",
      "........",
      "........",
    ]);
    const square2 = shapes.get("square2");
    const before = grid.toRows();
    expect(() => place(square2, { x: 3, y: 3 }, grid)).toThrow(RangeError);
    expect(grid.toRows()).toEqual(before);
  });

  it("anyFit: false on a full grid for every shape in the set", () => {
    const full = Grid.fromRows(Array.from({ length: 8 }, () => "########"));
    for (const shape of shapes.all()) {
      expect(anyFit(shape, full)).toBe(false);
    }
  });

  it("anyFit: true for single when exactly one cell is empty", () => {
    const rows = Array.from({ length: 8 }, () => "########");
    rows[0] = ".#######";
    const grid = Grid.fromRows(rows);
    expect(anyFit(shapes.get("single"), grid)).toBe(true);
  });

  it("allOrigins: single on an empty 8x8 has 64 origins", () => {
    const grid = Grid.empty(8);
    const origins = allOrigins(shapes.get("single"), grid);
    expect(origins).toHaveLength(64);
    expect(origins[0]).toEqual({ x: 0, y: 0 });
    expect(origins[63]).toEqual({ x: 7, y: 7 });
  });

  it("allOrigins: square3 on an empty 8x8 has 36 origins", () => {
    const grid = Grid.empty(8);
    expect(allOrigins(shapes.get("square3"), grid)).toHaveLength(36);
  });

  it("allOrigins: empty when nothing fits", () => {
    const full = Grid.fromRows(Array.from({ length: 8 }, () => "########"));
    expect(allOrigins(shapes.get("single"), full)).toEqual([]);
  });
});
