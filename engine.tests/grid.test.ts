import { describe, expect, it } from "vitest";
import { Grid } from "../engine/grid.js";

describe("Grid", () => {
  it("starts empty at the requested size", () => {
    const g = Grid.empty(8);
    expect(g.size).toBe(8);
    expect(g.count()).toBe(0);
    expect(g.isEmpty(0, 0)).toBe(true);
    expect(g.isEmpty(7, 7)).toBe(true);
  });

  it("set and clear round-trip a cell", () => {
    const g = Grid.empty(8);
    g.set(3, 4);
    expect(g.isFilled(3, 4)).toBe(true);
    expect(g.isEmpty(3, 4)).toBe(false);
    expect(g.count()).toBe(1);
    g.clear(3, 4);
    expect(g.isEmpty(3, 4)).toBe(true);
    expect(g.count()).toBe(0);
  });

  it("out of bounds is never empty and never filled", () => {
    const g = Grid.empty(8);
    for (const [x, y] of [[-1, 0], [0, -1], [8, 0], [0, 8], [1.5, 0]] as const) {
      expect(g.inBounds(x, y)).toBe(false);
      expect(g.isEmpty(x, y)).toBe(false);
      expect(g.isFilled(x, y)).toBe(false);
    }
  });

  it("set and clear throw out of bounds", () => {
    const g = Grid.empty(8);
    expect(() => g.set(8, 0)).toThrow(RangeError);
    expect(() => g.clear(0, -1)).toThrow(RangeError);
  });

  it("detects full rows and columns", () => {
    const g = Grid.fromRows([
      "####",
      "#...",
      "#...",
      "#..#",
    ]);
    expect(g.rowFull(0)).toBe(true);
    expect(g.rowFull(1)).toBe(false);
    expect(g.colFull(0)).toBe(true);
    expect(g.colFull(3)).toBe(false);
    expect(g.fullRows()).toEqual([0]);
    expect(g.fullCols()).toEqual([0]);
  });

  it("a row and a column can be full at once and share a cell", () => {
    const g = Grid.fromRows([
      "#...",
      "####",
      "#...",
      "#...",
    ]);
    expect(g.fullRows()).toEqual([1]);
    expect(g.fullCols()).toEqual([0]);
  });

  it("fromRows and toRows are inverses", () => {
    const rows = ["#.#.", ".#.#", "....", "####"];
    expect(Grid.fromRows(rows).toRows()).toEqual(rows);
  });

  it("fromRows rejects a ragged row", () => {
    expect(() => Grid.fromRows(["##", "#"])).toThrow(RangeError);
  });

  it("clone shares no storage", () => {
    const g = Grid.fromRows(["#.", ".."]);
    const c = g.clone();
    c.set(1, 1);
    expect(g.isEmpty(1, 1)).toBe(true);
    expect(c.isFilled(1, 1)).toBe(true);
    g.clear(0, 0);
    expect(c.isFilled(0, 0)).toBe(true);
  });

  it("rejects a non-positive size", () => {
    expect(() => Grid.empty(0)).toThrow(RangeError);
  });
});
