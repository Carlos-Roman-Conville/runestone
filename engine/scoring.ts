/**
 * Scoring: points for a placement from cells placed and lines cleared, with combo and
 * streak multipliers. Pure; reads nothing but its arguments.
 */

export interface ScoreTable {
  readonly perCell: number;
  readonly perLine: number;
  /** Indexed by lines cleared on one placement; index 0 unused. */
  readonly comboMultiplier: readonly number[];
  /** Indexed by streak before this placement; last entry repeats. */
  readonly streakMultiplier: readonly number[];
}

export interface PlacementScore {
  readonly points: number;
  readonly streakAfter: number;
}

export class ScoreDataError extends Error {
  constructor(message: string) {
    super(`ScoreTable: ${message}`);
    this.name = "ScoreDataError";
  }
}

/**
 * Parse and validate the contents of data/scoring.json. Accepts `unknown` so the
 * JSON import needs no cast. Follows the pattern in engine/shapes.ts (loadShapes).
 */
export function loadScoreTable(json: unknown): ScoreTable {
  if (!isRecord(json)) throw new ScoreDataError("expected a JSON object");

  const perCell = json["perCell"];
  if (typeof perCell !== "number" || !Number.isFinite(perCell) || perCell < 0)
    throw new ScoreDataError(`perCell must be a finite number >= 0, got ${String(perCell)}`);

  const perLine = json["perLine"];
  if (typeof perLine !== "number" || !Number.isFinite(perLine) || perLine < 0)
    throw new ScoreDataError(`perLine must be a finite number >= 0, got ${String(perLine)}`);

  const comboMultiplier = parseMultiplierArray(json["comboMultiplier"], "comboMultiplier");
  const streakMultiplier = parseMultiplierArray(json["streakMultiplier"], "streakMultiplier");

  return Object.freeze({
    perCell,
    perLine,
    comboMultiplier: Object.freeze(comboMultiplier),
    streakMultiplier: Object.freeze(streakMultiplier),
  });
}

/** Pure. See data/scoring.json _schema and HANDOFF Core mechanic 5. */
export function scorePlacement(
  cellsPlaced: number,
  linesCleared: number,
  streakBefore: number,
  table: ScoreTable,
): PlacementScore {
  assertNonNegativeInteger("cellsPlaced", cellsPlaced);
  assertNonNegativeInteger("linesCleared", linesCleared);
  assertNonNegativeInteger("streakBefore", streakBefore);

  const streakAfter = linesCleared > 0 ? streakBefore + 1 : 0;

  const cellPoints = cellsPlaced * table.perCell;

  let linePoints = 0;
  if (linesCleared > 0) {
    const combo = comboMultiplierAt(table, linesCleared);
    const streak = streakMultiplierAt(table, streakBefore);
    linePoints = linesCleared * table.perLine * combo * streak;
  }

  return { points: cellPoints + linePoints, streakAfter };
}

/** The combo multiplier Scoring applies for this many lines (clamped like the streak). */
export function comboMultiplierAt(table: ScoreTable, linesCleared: number): number {
  const arr = table.comboMultiplier;
  // UNVERIFIED — see HANDOFF R15; a 3x3 can complete up to 6 lines, the table covers 6
  const idx = linesCleared >= arr.length ? arr.length - 1 : linesCleared;
  return arr[idx] as number;
}

function streakMultiplierAt(table: ScoreTable, streakBefore: number): number {
  const arr = table.streakMultiplier;
  const idx = streakBefore >= arr.length ? arr.length - 1 : streakBefore;
  return arr[idx] as number;
}

function parseMultiplierArray(raw: unknown, field: string): number[] {
  if (!Array.isArray(raw) || raw.length < 2)
    throw new ScoreDataError(`${field} must be an array of at least two numbers`);
  const out: number[] = [];
  raw.forEach((v, i) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
      throw new ScoreDataError(`${field}[${i}] must be a finite number >= 0, got ${String(v)}`);
    out.push(v);
  });
  return out;
}

function assertNonNegativeInteger(name: string, n: number): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`scorePlacement: ${name} must be a non-negative integer, got ${n}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
