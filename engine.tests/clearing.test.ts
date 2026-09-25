import { describe, expect, it } from "vitest";
import { clearLines, DEFAULT_CLEAR_MODE } from "../engine/clearing.js";
import { Grid } from "../engine/grid.js";

function rowFullBoard(rowY: number): string[] {
  return Array.from({ length: 8 }, (_, y) => (y === rowY ? "########" : "........"));
}

function colFullBoard(colX: number): string[] {
  return Array.from({ length: 8 }, () => {
    let row = "";
    for (let x = 0; x < 8; x++) row += x === colX ? "#" : ".";
    return row;
  });
}

function countCell(cells: readonly { x: number; y: number }[], x: number, y: number): number {
  return cells.filter((c) => c.x === x && c.y === y).length;
}

describe("Clearing", () => {
  it("nothing full: returns empty arrays and leaves the grid unchanged", () => {
    const grid = Grid.fromRows([
      "........",
      "..#.....",
      "........",
      ".....#..",
      "........",
      "........",
      "........",
      "........",
    ]);
    const before = grid.toRows();
    const result = clearLines(grid);
    expect(result.rows).toEqual([]);
    expect(result.cols).toEqual([]);
    expect(result.cells).toEqual([]);
    expect(grid.toRows()).toEqual(before);
  });

  it("row only: clears the row, cells has 8 entries in x order", () => {
    const grid = Grid.fromRows(rowFullBoard(3));
    const result = clearLines(grid);
    expect(result.rows).toEqual([3]);
    expect(result.cols).toEqual([]);
    expect(result.cells).toEqual([
      { x: 0, y: 3 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 6, y: 3 },
      { x: 7, y: 3 },
    ]);
    for (let x = 0; x < 8; x++) expect(grid.isEmpty(x, 3)).toBe(true);
    expect(grid.isFilled(0, 0)).toBe(false);
  });

  it("column only: clears the column", () => {
    const grid = Grid.fromRows(colFullBoard(5));
    const result = clearLines(grid);
    expect(result.cols).toEqual([5]);
    expect(result.rows).toEqual([]);
    expect(result.cells).toHaveLength(8);
    for (let y = 0; y < 8; y++) expect(grid.isEmpty(5, y)).toBe(true);
  });

  it("row + column sharing a cell: both cleared, shared cell listed once (R8)", () => {
    const rows = Array.from({ length: 8 }, (_, y) => (y === 2 ? "########" : "........"));
    for (let y = 0; y < 8; y++) {
      const chars = rows[y]!.split("");
      chars[6] = "#";
      rows[y] = chars.join("");
    }
    const grid = Grid.fromRows(rows);
    const result = clearLines(grid);
    expect(result.rows).toEqual([2]);
    expect(result.cols).toEqual([6]);
    expect(result.cells).toHaveLength(15);
    expect(countCell(result.cells, 6, 2)).toBe(1);
    for (const p of result.cells) expect(grid.isEmpty(p.x, p.y)).toBe(true);
  });

  it("two rows at once", () => {
    const grid = Grid.fromRows([
      "########",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "########",
    ]);
    const result = clearLines(grid);
    expect(result.rows).toEqual([0, 7]);
    expect(result.cells).toHaveLength(16);
  });

  it("two rows and two columns: 4 shared cells, 28 cleared", () => {
    const rows = Array.from({ length: 8 }, (_, y) => {
      if (y === 1 || y === 4) return "########";
      let row = "........";
      const chars = row.split("");
      chars[2] = "#";
      chars[5] = "#";
      return chars.join("");
    });
    const grid = Grid.fromRows(rows);
    const result = clearLines(grid);
    expect(result.rows).toEqual([1, 4]);
    expect(result.cols).toEqual([2, 5]);
    expect(result.cells).toHaveLength(28);
  });

  it("full grid: every row and column, 64 cells, grid ends empty", () => {
    const grid = Grid.fromRows(Array.from({ length: 8 }, () => "########"));
    const result = clearLines(grid);
    expect(result.rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.cols).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.cells).toHaveLength(64);
    expect(grid.count()).toBe(0);
  });

  it("all lines found before any cell is cleared", () => {
    // If row 2 were cleared before columns were scanned, column 6 would no longer read as full.
    const rows = Array.from({ length: 8 }, (_, y) => (y === 2 ? "########" : "........"));
    for (let y = 0; y < 8; y++) {
      const chars = rows[y]!.split("");
      chars[6] = "#";
      rows[y] = chars.join("");
    }
    const grid = Grid.fromRows(rows);
    const result = clearLines(grid);
    expect(result.cols).toEqual([6]);
  });

  it("box mode off: boxes is always empty", () => {
    const grid = Grid.fromRows(Array.from({ length: 8 }, () => "########"));
    const result = clearLines(grid);
    expect(result.boxes).toEqual([]);
  });

  it("box mode on: throws and does not touch the grid (R6)", () => {
    const grid = Grid.fromRows(Array.from({ length: 8 }, () => "########"));
    const before = grid.toRows();
    expect(() => clearLines(grid, { boxes: true })).toThrow(/R6/);
    expect(grid.toRows()).toEqual(before);
  });

  it("DEFAULT_CLEAR_MODE has boxes off", () => {
    expect(DEFAULT_CLEAR_MODE.boxes).toBe(false);
  });
});
