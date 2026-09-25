# Composer prompt — Step 5: the view (grid, hand, drag and snap, clear animation, score)

**Precondition:** step 1 is DONE in `files/HANDOFF.md` (Vite + PixiJS scene in `game/`, Capacitor Android build, `ops/real/admob.ts`, an `Ops` object built in `game/main.ts`). If it is not, stop; this prompt builds on that scaffold.

Paste everything below the line into a fresh Composer chat with `game/main.ts`, `engine/index.ts`, `engine/run.ts`, `engine/events.ts`, `files/EVENTS.md`, `files/MODULES.md` (Run card), `ops/index.ts` and `.cursor/rules/30-game.mdc` attached. One feature per chat: this is the whole playable loop, so expect it to take a few sessions; the file list below is the split.

---

You are building **step 5** of the Runestone repo: a playable view over the finished engine. Read `AGENTS.md`, then `.cursor/rules/30-game.mdc`, then the Run card in `files/MODULES.md`, then `files/EVENTS.md`, then this prompt. The engine is complete and tested (141 tests); you are wiring a screen to it.

**The one rule that matters: the view contains zero game rules.** It never decides whether a drop is legal, what clears, or what scores. It asks `run.canPlace()` for the ghost, calls `run.place()` on drop, and animates the events that come back. If you find yourself writing `if (row is full)` or computing points, stop: that belongs in `engine/` and is already there.

## Files

Create:

- `game/view-model.ts` — **pure, no Pixi import.** Reduces the event log into a plain view state (see below). This is the only file with a unit test.
- `game/view-model.test.ts` — Vitest, runs under plain Node.
- `game/scene/board.ts` — the 8x8 grid: draws board stone, tile sprites per filled cell, the ghost preview.
- `game/scene/hand.ts` — the tray with three shape slots; drag source.
- `game/scene/hud.ts` — score, streak, and the game-over overlay with a "New run" button.
- `game/input/drag.ts` — pointer handling: lift a shape from the tray, follow the pointer, compute the snapped grid origin, drop.
- `game/anim/index.ts` — the animation cues (see budget), each a function `(scene, event) => Promise<void>` so the replay can await them.
- `game/sfx.ts` — sound cues as a typed no-op interface (`play(cue)`), cues named after the budget. Rex supplies audio in step 8; do not add audio files.
- `game/assets/tile.ts` — a **placeholder** 24 px stone tile drawn with `Graphics` in three states: `resting`, `lit`, `ghost`. Flat stone in two shades with a one-pixel darker edge, ghost at 50% alpha, lit a brighter shade. Rex replaces it with a PNG in step 8; keep the three-state API so that swap is one file.

Modify:

- `game/main.ts` — replace the step 1 "one tile + test ad button" scene with the game scene. Keep the `Ops` construction exactly as step 1 left it; the test ad button can move to a debug corner or go.
- `vitest.config.ts` — add `"game/**/*.test.ts"` to `include`.

Touch nothing in `engine/`, `data/`, `ops/`, `files/` (except the HANDOFF line the done condition names). If you think the engine needs a new query, stop and say what and why; do not add it.

## The engine API you use (and nothing else)

```ts
import { Run, runConfig, loadShapes, loadBagConfig, loadScoreTable, type GameEvent, type RunState } from "../engine/index.js";
import shapesJson from "../data/shapes.json";
import bagJson from "../data/bag.json";
import scoringJson from "../data/scoring.json";

const shapes = loadShapes(shapesJson);
const config = runConfig(loadBagConfig(bagJson), loadScoreTable(scoringJson));
let run = Run.start(shapes, config, seed);          // seed: Date.now() for now; step 6 adds daily seeds

run.state()                                          // { phase, grid: string[8], hand: (id|null)[3], score, placements, streak, continueUsed }
run.canPlace(handIndex, origin)                      // ghost: legal or not, never mutates
run.place(handIndex, origin, { continueAvailable: false })   // returns the events of this action, in order
run.events()                                         // the whole log
shapes.get(id).cells                                 // [{x,y}] normalized, for drawing a shape
```

**Step 5 always passes `continueAvailable: false`.** The rewarded-ad continue is step 6; the engine will then end the run with `RunEnded` on the first no-fit, and the view shows game over. Do not call `run.continueRun` or `run.declineContinue` in step 5.

## View model (`game/view-model.ts`)

```ts
export interface ViewState {
  readonly grid: readonly string[];          // from run.state().grid after the action
  readonly hand: readonly (string | null)[]; // ids
  readonly score: number;
  readonly streak: number;
  readonly phase: "playing" | "ended";
  readonly lastPlacement: { cells: Pos[]; cleared: Pos[]; rows: number[]; cols: number[]; points: number; linesCleared: number; combo: number } | null;
}
export function reduce(state: RunState, events: readonly GameEvent[]): ViewState;
```

`reduce` takes the run state *after* the action and the events *of* that action and produces what the scene needs. `lastPlacement` is null when the action was a `PlacementRejected`. This is a pure function; the test feeds it hand-built event arrays (copy real ones from `engine.tests/golden/run_seed_1.json`) and asserts the output. Everything Pixi-facing reads `ViewState`; nothing Pixi-facing reads events directly, so the mapping is testable.

## Layout (portrait, phone first)

- Design at a **logical 216 x 384** (9:16) and scale the whole stage by the largest whole number that fits the window, centered, letterboxed. Nearest-neighbor on every texture (`TextureSource.defaultOptions.scaleMode = "nearest"`, as step 1 set). No fractional positions: round every sprite x/y.
- Board: 8 x 24 px = 192 px square, 12 px margin each side, top at y = 48. Score above it. Hand tray below it: three slots, each shape drawn at **half scale (12 px per cell)** in the tray and at full 24 px while dragged.
- Colors: one placeholder palette constant in `game/assets/tile.ts` (board dark stone, tile stone, tile edge, lit, text). Rex owns the real palette; keep every color in that one file.

## Drag, snap, ghost (`game/input/drag.ts`)

1. Pointer down on a tray slot with a shape: lift it. The dragged shape renders at full scale, offset **upward by 32 px** from the finger so the thumb does not hide it (standard for the genre).
2. On move: convert the dragged shape's top-left to a grid origin by rounding to the nearest cell. Call `run.canPlace(handIndex, origin)`. If legal, draw the ghost tiles at that origin; if not, no ghost.
3. On up: if the last computed origin was legal, call `run.place(handIndex, origin, { continueAvailable: false })`, then `reduce` and hand the result to the replay. If not legal, animate the shape back to its slot (`lift` reversed) and change nothing.
4. Pointer events only (`pointerdown/move/up` on the Pixi stage with `eventMode = "static"`); no mouse/touch duplicates. One drag at a time; ignore a second pointer.

## Replay: events → animations (the feel budget)

After `place()`, run these cues **in event order**, awaiting each, from `game/anim/index.ts`. Six animations exist in the budget; step 5 implements five as placeholders (tweens on sprites, no sprite sheets yet) and leaves the sixth for Rex's art pass:

| Event | Cue | Placeholder animation (durations in ms) | Sound cue |
|---|---|---|---|
| pointer down on a slot | `lift` | scale 0.5 → 1.0 over 80, follows pointer | `pickup` |
| `Placed` | `snap` | tiles appear at the origin, 1.15 → 1.0 scale over 90 | `place` |
| `LinesCleared` with cells | `clear` | cleared tiles switch to `lit` for 120, then pop (scale to 0 over 100), grid then redraws from `ViewState.grid` | `clear` (pitch step per line in `linesCleared`, pass it as a number) |
| `ComboScored` with `linesCleared >= 2` | `combo` | text "x{combo}" pops at board center, 0 → 1.2 → 1.0 over 200, fades over 400 | `combo` |
| `HandDrawn` | `deal` | three slots slide up from below the tray, 40 ms stagger | none |
| `RunEnded` | `gameOver` | board shakes 6 px for 300, fades to 40% alpha, overlay shows score and "New run" | `gameover` |
| `StreakChanged` | — | HUD streak counter updates; no animation (budget is full) | none |
| `PlacementRejected` | — | nothing; drag.ts already animated the shape back | none |

Rules: no animation outside this table (the budget is six; adding one needs a rulings row). Input is **locked** while a replay is running and unlocked after; queue nothing. Every tween is time-based (delta from the ticker), never frame-counted.

## New run

The game-over overlay's "New run" button calls `Run.start(shapes, config, newSeed)`, resets the scene from `run.state()`, and replays the initial `HandDrawn` with the `deal` cue. No save, no daily, no ads in step 5.

## Tests (`game/view-model.test.ts`)

One `it` per line. Build inputs by hand or copy event objects from `engine.tests/golden/run_seed_1.json`.

1. `reduce: a plain placement sets lastPlacement.cells and points, no cleared cells`.
2. `reduce: a clearing placement lists rows, cols, cleared cells and combo`.
3. `reduce: PlacementRejected gives lastPlacement null and leaves grid/hand from state`.
4. `reduce: RunEnded sets phase ended`.
5. `reduce: HandDrawn in the same action shows the new hand`.
6. `reduce: never imports pixi` (assert via a static check: the file's import list contains no `pixi.js`; simplest is `expect(Object.keys(await import("./view-model.js"))).toContain("reduce")` in a test that would fail to load under Node if Pixi were imported).

Playtest checks (Rex, on device, recorded; a recording counts only when the frames were opened):

- A full run from first deal to game over, with at least one line clear and one two-line combo visible.
- The ghost appears only on legal spots and disappears on illegal ones, including half off the board.
- Dropping on an illegal spot returns the shape to the tray and the hand is unchanged.
- No blur on any tile at any window size; letterbox bars, not stretching.

## Done condition

- `npm run check` green (layer guard, typecheck, all tests including `game/view-model.test.ts`).
- `npm run build` produces `dist/`, `npx cap sync` succeeds, the APK runs.
- Rex plays a full run on device and the recording's frames were opened.
- `files/HANDOFF.md` build order row 5: DONE with the date. Nothing else in `files/` changes.
- Commits: one per file group is fine (`View: view-model`, `View: board and hand`, `View: drag and snap`, `View: animations and HUD`); each with `npm run check` green. Anything the prompt does not say goes in the commit message; if it needs an engine change, stop and ask.
