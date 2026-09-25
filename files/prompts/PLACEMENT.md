# Composer prompt — Placement module

Paste everything below the line into a fresh Composer chat with `engine/placement.ts` (new), `engine/grid.ts`, `engine/shapes.ts` and `files/MODULES.md` attached. One module, one chat.

---

You are building one module in the Runestone repo: **Placement**, `engine/placement.ts` plus `engine.tests/placement.test.ts`. Read `AGENTS.md`, then the Placement card in `files/MODULES.md` (section "Placement"), then this prompt. Nothing else is in scope.

## Files

- Create `engine/placement.ts`.
- Create `engine.tests/placement.test.ts`.
- Append the exports to `engine/index.ts` (two lines, same style as the existing ones).
- Touch nothing else. Do not edit `grid.ts`, `shapes.ts`, `data/`, `files/`.

## Constraints (CI enforces the first two)

- `engine/placement.ts` imports only from `./grid.js` and `./shapes.js`. No packages, no `ops/`, no `game/`.
- `npm run check` must pass: layer guard, `tsc --noEmit` under `strict` + `noUncheckedIndexedAccess`, and `vitest run`.
- No `Math.random`. This module does no random draws at all.
- Pure functions except `place`, which is the one call that mutates the grid.
- No rule that is not in HANDOFF Core mechanic 3: a shape may be placed where every one of its cells is empty and inside the grid. No rotation.

## Public API (exact; the card is the authority)

```ts
import type { Grid, Pos } from "./grid.js";
import type { Shape } from "./shapes.js";

/** True when every cell of `shape`, translated by `origin`, is in bounds and empty. */
export function fits(shape: Shape, origin: Pos, grid: Grid): boolean;

/**
 * Fill the shape's cells on `grid`. Throws RangeError if `!fits(shape, origin, grid)`
 * and leaves the grid untouched in that case. Returns the absolute cells filled,
 * in the shape's cell order.
 */
export function place(shape: Shape, origin: Pos, grid: Grid): Pos[];

/** True when `fits` is true for at least one origin. */
export function anyFit(shape: Shape, grid: Grid): boolean;

/** Every origin where `fits` is true, scanned y-major then x (row by row, top-left first). */
export function allOrigins(shape: Shape, grid: Grid): Pos[];
```

Implementation notes:

- A cell's absolute position is `{ x: origin.x + cell.x, y: origin.y + cell.y }`.
- `grid.isEmpty(x, y)` is already false out of bounds, so `fits` needs no separate bounds check.
- `allOrigins` may scan every origin in `[0, size) × [0, size)`; do not try to be clever about the shape's extent. 64 × 25 checks is nothing.
- `place` must call `fits` first, then `grid.set` for each cell. Do not partially fill.
- Return plain `{ x, y }` objects; do not return references to the shape's own cell objects.

## Tests (`engine.tests/placement.test.ts`)

Use Vitest, `Grid.fromRows` for boards, and `loadShapes(shapesJson)` from `../engine/shapes.js` with `import shapesJson from "../data/shapes.json"` for real shapes (see `engine.tests/shapes.test.ts` for the import style). Fixed inputs only; no seeds needed here.

One `it` per line, named after the rule:

1. `fits: single fits at every cell of an empty 8x8` (loop all 64 origins).
2. `fits: line5_h fits at x=3 and not at x=4 on row 0` (right edge).
3. `fits: line5_v fits at y=3 and not at y=4` (bottom edge).
4. `fits: square3 fits at every corner and not one past any corner` (origins (0,0), (5,0), (0,5), (5,5) true; (6,0), (0,6), (-1,0), (0,-1) false).
5. `fits: overlap with a filled cell is rejected` (a board with one `#`, a shape whose cells cover it, `fits` false; shift by one, true).
6. `fits: negative origin is out of bounds` (single at (-1, 0) and (0, -1) both false).
7. `place: fills exactly shape.cells.length cells and returns them` (place `largeL_0` at (2,2), `grid.count()` equals 5, returned cells are the five expected absolute positions, `grid.isFilled` true for each).
8. `place: throws when !fits and leaves the grid untouched` (full grid or overlap; assert `toThrow(RangeError)` and `grid.toRows()` unchanged after).
9. `anyFit: false on a full grid for every shape in the set` (`Grid.fromRows` of eight `########` rows; loop `shapes.all()`).
10. `anyFit: true for single when exactly one cell is empty`.
11. `allOrigins: single on an empty 8x8 has 64 origins` (also assert the first is `{x:0,y:0}` and the last is `{x:7,y:7}` to pin the scan order).
12. `allOrigins: square3 on an empty 8x8 has 36 origins`.
13. `allOrigins: empty when nothing fits`.

## Done condition

- `npm run check` is green.
- `engine/index.ts` exports `fits`, `place`, `anyFit`, `allOrigins`.
- One commit, message starting `Placement module:` and listing the test count. If you had to decide anything the card does not say, put it in the commit message and as a `// UNVERIFIED` comment; do not change the card.
