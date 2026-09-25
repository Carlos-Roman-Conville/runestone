import { describe, expect, it } from "vitest";
import scoringJson from "../data/scoring.json";
import { loadScoreTable, scorePlacement, ScoreDataError, type ScoreTable } from "../engine/scoring.js";

const table = loadScoreTable(scoringJson);

function expectedPoints(
  cellsPlaced: number,
  linesCleared: number,
  streakBefore: number,
  t: ScoreTable,
): number {
  const cellPoints = cellsPlaced * t.perCell;
  if (linesCleared === 0) return cellPoints;
  const comboIdx = linesCleared >= t.comboMultiplier.length ? t.comboMultiplier.length - 1 : linesCleared;
  const streakIdx = streakBefore >= t.streakMultiplier.length ? t.streakMultiplier.length - 1 : streakBefore;
  const combo = t.comboMultiplier[comboIdx]!;
  const streak = t.streakMultiplier[streakIdx]!;
  return cellPoints + linesCleared * t.perLine * combo * streak;
}

describe("Scoring", () => {
  it("loadScoreTable: real data loads and is frozen", () => {
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(table.comboMultiplier)).toBe(true);
    expect(Object.isFrozen(table.streakMultiplier)).toBe(true);
    expect(typeof table.perCell).toBe("number");
    expect(typeof table.perLine).toBe("number");
  });

  it("loadScoreTable: rejects a missing or negative field", () => {
    expect(() => loadScoreTable({})).toThrow(ScoreDataError);
    expect(() => loadScoreTable({ perCell: 1, perLine: -1, comboMultiplier: [0, 1], streakMultiplier: [1, 1] })).toThrow(
      ScoreDataError,
    );
    expect(() => loadScoreTable({ perCell: 1, perLine: 1, comboMultiplier: [1], streakMultiplier: [1, 1] })).toThrow(
      ScoreDataError,
    );
  });

  it("cells term: zero lines scores cellsPlaced * perCell and nothing else", () => {
    expect(scorePlacement(4, 0, 0, table).points).toBe(4 * table.perCell);
  });

  it("line term: one line at streak 0", () => {
    const cells = 3;
    const expected = cells * table.perCell + 1 * table.perLine * table.comboMultiplier[1]! * table.streakMultiplier[0]!;
    expect(scorePlacement(cells, 1, 0, table).points).toBe(expected);
  });

  it("combo: 1, 2, 3, 4 lines each match the formula", () => {
    for (let lines = 1; lines <= 4; lines++) {
      const got = scorePlacement(2, lines, 0, table).points;
      expect(got).toBe(expectedPoints(2, lines, 0, table));
    }
  });

  it("points strictly increase with lines cleared", () => {
    let prev = -Infinity;
    for (let lines = 1; lines <= 4; lines++) {
      const { points } = scorePlacement(4, lines, 0, table);
      expect(points).toBeGreaterThan(prev);
      prev = points;
    }
  });

  it("streak multiplier: streakBefore 2 uses streakMultiplier[2]", () => {
    const lines = 1;
    const cells = 1;
    const with2 = scorePlacement(cells, lines, 2, table).points;
    const expected =
      cells * table.perCell +
      lines * table.perLine * table.comboMultiplier[lines]! * table.streakMultiplier[2]!;
    expect(with2).toBe(expected);
  });

  it("streak multiplier clamps to the last entry", () => {
    const last = table.streakMultiplier.length - 1;
    const a = scorePlacement(1, 1, table.streakMultiplier.length + 5, table).points;
    const b = scorePlacement(1, 1, last, table).points;
    expect(a).toBe(b);
  });

  it("streak: increments after a clearing placement", () => {
    expect(scorePlacement(1, 2, 3, table).streakAfter).toBe(4);
  });

  it("streak: resets to 0 after a non-clearing placement (R9)", () => {
    const result = scorePlacement(3, 0, 7, table);
    expect(result.streakAfter).toBe(0);
    expect(result.points).toBe(3 * table.perCell);
  });

  it("combo index beyond the table clamps to the last entry", () => {
    // UNVERIFIED
    const lines = table.comboMultiplier.length + 2;
    const got = scorePlacement(0, lines, 0, table).points;
    const lastCombo = table.comboMultiplier[table.comboMultiplier.length - 1]!;
    const expected = lines * table.perLine * lastCombo * table.streakMultiplier[0]!;
    expect(got).toBe(expected);
  });

  it("rejects negative or non-integer inputs", () => {
    expect(() => scorePlacement(-1, 0, 0, table)).toThrow(RangeError);
    expect(() => scorePlacement(1.5, 0, 0, table)).toThrow(RangeError);
  });

  it("table-driven: a custom table changes the result without code changes", () => {
    const custom: ScoreTable = {
      perCell: 2,
      perLine: 5,
      comboMultiplier: [0, 1, 3],
      streakMultiplier: [1, 2],
    };
    const cells = 4;
    const lines = 2;
    const streak = 1;
    expect(scorePlacement(cells, lines, streak, custom).points).toBe(expectedPoints(cells, lines, streak, custom));
  });
});
