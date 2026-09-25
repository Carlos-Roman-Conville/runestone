# Composer prompt — Clearing module

Paste everything below the line into a fresh Composer chat with `engine/clearing.ts` (new), `engine/grid.ts` and `files/MODULES.md` attached. One module, one chat. Does not depend on Placement; can run in parallel with it.

---

You are building one module in the Runestone repo: **Clearing**, `engine/clearing.ts` plus `engine.tests/clearing.test.ts`. Read `AGENTS.md`, then the Clearing card in `files/MODULES.md`, then rulings R6 and R8 in `files/HANDOFF.md`, then this prompt. Nothing else is in scope.

## Files

- Create `engine/clearing.ts`.
- Create `engine.tests/clearing.test.ts`.
- Append the exports to `engine/index.ts`.
- Touch nothing else.

## Constraints

- `engine/clearing.ts` imports only from `./grid.js`. No packages, no `ops/`, no `game/`.
- `npm run check` must pass (layer guard, strict typecheck, vitest).
- No `Math.random`. No scoring. No knowledge of the hand or the shapes.
- Rules come from HANDOFF Core mechanic 4 and R6, R8 only:
  - Core 4: on placement, every full row and every full column clears at once.
  - R8 (SETTLED): a placement that completes a row and a column sharing a cell clears both; the shared cell is cleared once and counts toward both lines.
  - R6 (SETTLED): box clears are off at launch, behind a data flag.

## Public API (exact)

```ts
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
export function clearLines(grid: Grid, mode: ClearMode = DEFAULT_CLEAR_MODE): ClearResult;
```

Implementation notes:

- Phase 1: `rows = grid.fullRows()`, `cols = grid.fullCols()`. Do not call `grid.clear` until both are collected.
- Phase 2: build the set of cells to clear from every cell of every full row and every cell of every full column, deduplicated (a `Set` of `"x,y"` keys works). Then clear each once. `cells` must list each position once even when it sits on both a full row and a full column.
- Order `cells` row-major: sort by y then x. Tests compare arrays, so the order must be deterministic.
- `mode.boxes === true` is not implemented at launch. When it is passed, throw `new Error("Clearing: box mode is not implemented at launch (HANDOFF R6)")` before touching the grid. Add `// UNVERIFIED — see HANDOFF R6` above that line. Do not implement box detection.
- Return fresh arrays; do not cache.

## Tests (`engine.tests/clearing.test.ts`)

Boards via `Grid.fromRows`. Fixed inputs. One `it` per rule:

1. `nothing full: returns empty arrays and leaves the grid unchanged` (a board with a few scattered `#`; assert `toRows()` before equals after).
2. `row only: clears the row, cells has 8 entries in x order` (row 3 full, nothing else; `rows` is `[3]`, `cols` is `[]`, `cells` is `(0,3)..(7,3)`, row 3 now empty, other cells untouched).
3. `column only: clears the column` (column 5 full; `cols` is `[5]`, 8 cells).
4. `row + column sharing a cell: both cleared, shared cell listed once (R8)` (row 2 and column 6 full; `rows` `[2]`, `cols` `[6]`, `cells.length` is 15, `(6,2)` appears exactly once, grid has those 15 cells empty).
5. `two rows at once` (rows 0 and 7 full; `rows` `[0, 7]`, 16 cells).
6. `two rows and two columns: 4 shared cells, 28 cleared` (rows 1 and 4, columns 2 and 5 full; `cells.length` is 28).
7. `full grid: every row and column, 64 cells, grid ends empty` (`rows` and `cols` are both `[0..7]`, `grid.count()` is 0 after).
8. `all lines found before any cell is cleared` (this is what test 4 proves: if clearing row 2 happened before scanning columns, column 6 would no longer be full. Add a comment saying so; no separate test needed, but keep the name as a second `it` that re-asserts `cols` is `[6]` on that board).
9. `box mode off: boxes is always empty` (on the full-grid board, `boxes` is `[]`).
10. `box mode on: throws and does not touch the grid (R6)` (`expect(() => clearLines(g, { boxes: true })).toThrow(/R6/)`; `toRows()` unchanged).
11. `DEFAULT_CLEAR_MODE has boxes off`.

## Done condition

- `npm run check` is green.
- `engine/index.ts` exports `clearLines`, `DEFAULT_CLEAR_MODE` and the types `ClearMode`, `ClearResult`.
- One commit, message starting `Clearing module:` and listing the test count. Anything the card does not say goes in the commit message and a `// UNVERIFIED` comment; do not change the card.
