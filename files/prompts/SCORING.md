# Composer prompt — Scoring module

Paste everything below the line into a fresh Composer chat with `engine/scoring.ts` (new), `data/scoring.json`, `engine/shapes.ts` (as a loader example) and `files/MODULES.md` attached. One module, one chat. Independent of Placement and Clearing.

---

You are building one module in the Runestone repo: **Scoring**, `engine/scoring.ts` plus `engine.tests/scoring.test.ts`. Read `AGENTS.md`, then the Scoring card in `files/MODULES.md`, then rulings R9 and R15 in `files/HANDOFF.md`, then the `_schema` string at the top of `data/scoring.json`, then this prompt. Nothing else is in scope.

## Files

- Create `engine/scoring.ts`.
- Create `engine.tests/scoring.test.ts`.
- Append the exports to `engine/index.ts`.
- Touch nothing else. **Do not change any number in `data/scoring.json`.**

## Constraints

- `engine/scoring.ts` imports nothing at all (not even `./grid.js`). Pure functions over plain numbers.
- `npm run check` must pass (layer guard, strict typecheck, vitest).
- No `Math.random`. No grid, no state, no hand.
- Rules come from HANDOFF Core mechanic 5, R9 and R15 only, and the formula is the one in `data/scoring.json`'s `_schema`:

  ```
  points = cellsPlaced * perCell
         + linesCleared * perLine * comboMultiplier[linesCleared] * streakMultiplier[min(streakBefore, last)]
  ```

  - `streakBefore` is the number of consecutive placements that each cleared at least one line, counted **before** this placement.
  - R9 (SETTLED): the streak resets on any placement that clears nothing. So `streakAfter = linesCleared > 0 ? streakBefore + 1 : 0`.
  - `comboMultiplier` is indexed by lines cleared on this placement; index 0 is unused (a zero-line placement contributes 0 from the line term regardless).
  - `streakMultiplier` is indexed by `streakBefore` and its last entry repeats for longer streaks.
  - Every number is a tuning value; changing one is a JSON edit (R15). Nothing in `.ts` may hard-code a score number.

## Public API (exact)

```ts
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

export class ScoreDataError extends Error {}

/**
 * Parse and validate the contents of data/scoring.json. Accepts `unknown` so the
 * JSON import needs no cast. Follows the pattern in engine/shapes.ts (loadShapes).
 */
export function loadScoreTable(json: unknown): ScoreTable;

/** Pure. See the formula above. */
export function scorePlacement(
  cellsPlaced: number,
  linesCleared: number,
  streakBefore: number,
  table: ScoreTable,
): PlacementScore;
```

Implementation notes:

- `loadScoreTable` rejects (with `ScoreDataError`): a non-object; `perCell` or `perLine` not a finite number ≥ 0; `comboMultiplier` or `streakMultiplier` not an array of at least two finite numbers ≥ 0. Return a frozen object with frozen arrays. Ignore the `_schema` key.
- `scorePlacement` throws `RangeError` if `cellsPlaced`, `linesCleared` or `streakBefore` is not a non-negative integer.
- If `linesCleared` is beyond the end of `comboMultiplier`, use the last entry, the same way `streakMultiplier` clamps. Mark it `// UNVERIFIED — see HANDOFF R15; a 3x3 can complete up to 6 lines, the table covers 6` and mention it in the commit. Do not add a rulings row; R15 already covers the table.
- Do not round. Multipliers can be non-integers (1.5, 2.5) and `total` accumulates in Run; rounding, if wanted, is Run's decision later.

## Tests (`engine.tests/scoring.test.ts`)

Load the real table once: `const table = loadScoreTable(scoringJson)` with `import scoringJson from "../data/scoring.json"`. Compute expectations **from the table's own numbers** in the test (e.g. `table.perLine * table.comboMultiplier[2]!`), not from literals, so retuning the JSON never breaks a test. The one exception is the strict-increase test, which is about shape not values.

One `it` per rule:

1. `loadScoreTable: real data loads and is frozen` (`Object.isFrozen(table)` and of both arrays; `perCell`, `perLine` are numbers).
2. `loadScoreTable: rejects a missing or negative field` (three broken documents: `{}`; `perLine: -1`; `comboMultiplier: [1]`; each `toThrow(ScoreDataError)`).
3. `cells term: zero lines scores cellsPlaced * perCell and nothing else` (`scorePlacement(4, 0, 0, table).points === 4 * table.perCell`).
4. `line term: one line at streak 0` (`points === cells*perCell + 1*perLine*combo[1]*streak[0]`).
5. `combo: 1, 2, 3, 4 lines each match the formula` (loop, compare to the formula computed inline).
6. `points strictly increase with lines cleared` (for lines 1..4 with the same cells and streak, each `points` is greater than the previous).
7. `streak multiplier: streakBefore 2 uses streakMultiplier[2]`.
8. `streak multiplier clamps to the last entry` (`streakBefore` = `streakMultiplier.length + 5` equals `streakBefore` = `length - 1`).
9. `streak: increments after a clearing placement` (`streakAfter === streakBefore + 1` when `linesCleared > 0`).
10. `streak: resets to 0 after a non-clearing placement (R9)` (`scorePlacement(3, 0, 7, table).streakAfter === 0`, and its `points` has no line term).
11. `combo index beyond the table clamps to the last entry` (`linesCleared = comboMultiplier.length + 2` scores with the last multiplier; mark the test `// UNVERIFIED`).
12. `rejects negative or non-integer inputs` (`RangeError` for `-1`, `1.5`).
13. `table-driven: a custom table changes the result without code changes` (construct a `ScoreTable` literal with different numbers and assert the formula holds; this is the R15 guarantee).

## Done condition

- `npm run check` is green.
- `engine/index.ts` exports `loadScoreTable`, `scorePlacement`, `ScoreDataError` and the types `ScoreTable`, `PlacementScore`.
- `data/scoring.json` is byte-identical to before.
- One commit, message starting `Scoring module:` and listing the test count. Anything the card does not say goes in the commit message and a `// UNVERIFIED` comment; do not change the card.
