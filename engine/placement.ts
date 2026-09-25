/**
 * Placement: fit check and placement of a shape at an origin. Does not clear lines,
 * score, or draw shapes.
 */

import type { Grid, Pos } from "./grid.js";
import type { Shape } from "./shapes.js";

/** True when every cell of `shape`, translated by `origin`, is in bounds and empty. */
export function fits(shape: Shape, origin: Pos, grid: Grid): boolean {
  for (const cell of shape.cells) {
    const x = origin.x + cell.x;
    const y = origin.y + cell.y;
    if (!grid.isEmpty(x, y)) return false;
  }
  return true;
}

/**
 * Fill the shape's cells on `grid`. Throws RangeError if `!fits(shape, origin, grid)`
 * and leaves the grid untouched in that case. Returns the absolute cells filled,
 * in the shape's cell order.
 */
export function place(shape: Shape, origin: Pos, grid: Grid): Pos[] {
  if (!fits(shape, origin, grid)) {
    throw new RangeError("Placement.place: shape does not fit at this origin");
  }
  const filled: Pos[] = [];
  for (const cell of shape.cells) {
    const x = origin.x + cell.x;
    const y = origin.y + cell.y;
    grid.set(x, y);
    filled.push({ x, y });
  }
  return filled;
}

/** True when `fits` is true for at least one origin. */
export function anyFit(shape: Shape, grid: Grid): boolean {
  const size = grid.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (fits(shape, { x, y }, grid)) return true;
    }
  }
  return false;
}

/** Every origin where `fits` is true, scanned y-major then x (row by row, top-left first). */
export function allOrigins(shape: Shape, grid: Grid): Pos[] {
  const out: Pos[] = [];
  const size = grid.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (fits(shape, { x, y }, grid)) out.push({ x, y });
    }
  }
  return out;
}
