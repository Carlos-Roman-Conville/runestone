/**
 * Clearing: find and clear every full row and column after a placement. Knows nothing
 * about scoring or the hand.
 */

import type { Grid, Pos } from "./grid.js";

export interface ClearMode {
  /** Woodoku-style 3x3 box clears. Off at launch (HANDOFF R6). */
  readonly boxes: boolean;
}

export const DEFAULT_CLEAR_MODE: ClearMode = { boxes: false };

export interface ClearResult {
  /** Row indices that were full, ascending. */
  readonly rows: number[];
  /** Column indices that were full, ascending. */
  readonly cols: number[];
  /** Top-left origins of full boxes. Always empty while `mode.boxes` is false. */
  readonly boxes: Pos[];
  /** Every cell actually cleared, each exactly once, in row-major order (y then x). */
  readonly cells: Pos[];
}

/**
 * Find every full line on `grid`, then clear them all. Two-phase: all lines are found
 * before any cell is cleared, so a row and a column that share a cell are both
 * detected (R8). Mutates `grid`. Returns what was cleared.
 */
export function clearLines(grid: Grid, mode: ClearMode = DEFAULT_CLEAR_MODE): ClearResult {
  if (mode.boxes) {
    // UNVERIFIED — see HANDOFF R6
    throw new Error("Clearing: box mode is not implemented at launch (HANDOFF R6)");
  }

  const rows = grid.fullRows();
  const cols = grid.fullCols();

  const keySet = new Set<string>();
  const size = grid.size;
  for (const y of rows) {
    for (let x = 0; x < size; x++) keySet.add(`${x},${y}`);
  }
  for (const x of cols) {
    for (let y = 0; y < size; y++) keySet.add(`${x},${y}`);
  }

  const cells: Pos[] = [...keySet].map((k) => {
    const comma = k.indexOf(",");
    const x = Number(k.slice(0, comma));
    const y = Number(k.slice(comma + 1));
    return { x, y };
  });
  cells.sort((a, b) => a.y - b.y || a.x - b.x);

  for (const p of cells) grid.clear(p.x, p.y);

  return {
    rows: [...rows],
    cols: [...cols],
    boxes: [],
    cells,
  };
}
