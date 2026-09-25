# Module contracts — one card per module, so each can be built and debugged alone

To work on a module: open **this card, the HANDOFF sections it names, and `GLOSSARY.md`** — nothing else. If the job seems to need another module's internals, the boundary is wrong; stop and say so.

Dependency rule: arrows point one way, **down** the list. A module may call anything above it and nothing below it. `game/`, `ops/` and `tools/sim/` sit outside and call only the public API.

```
State    Rng ─ Grid
Data     Shapes
Rules    Placement → Clearing → Scoring → Bag → Run
Meta     Daily → Progress
Sim      Bot                                   (calls Run only)
```

Each card: **Purpose · Public API · Reads · Writes · Must not · Invariants · Spec · Tests · Context**.

---

## State

### Rng — `engine/rng.ts` — DONE
- **Purpose** Named, seeded streams: `Bag`, `Mercy`, `BotTieBreak`.
- **Public API** `new Rng(seed, positions?)`, `rng.stream(name).next(n) | nextFloat() | shuffle(list)`, `rng.clone()`, `serialize()/deserialize()`.
- **Reads/Writes** its own stream positions only.
- **Must not** be replaced by `Math.random` anywhere in `engine/` or `tools/sim/`.
- **Invariants** same seed → same sequence; two streams never share a sequence; drawing from one stream never moves another; `clone()` continues identically and shares nothing.
- **Tests** `engine.tests/rng.test.ts` (determinism, independence, clone continuity, round trip, range, fresh-stream coin patterns).

### Grid — `engine/grid.ts` — DONE
- **Purpose** Cell occupancy and bounds for a square board. Knows no rules.
- **Public API** `Grid.empty(size)`, `Grid.fromRows(rows)`, `inBounds`, `isEmpty`, `isFilled`, `set`, `clear`, `rowFull`, `colFull`, `fullRows()`, `fullCols()`, `count()`, `clone()`, `toRows()`.
- **Must not** decide whether a shape fits (Placement), what a full line does (Clearing), or score anything.
- **Invariants** out-of-bounds is never empty and never filled; `clone()` shares no storage; `fromRows`/`toRows` are inverses.
- **Tests** `engine.tests/grid.test.ts`.

## Data

### Shapes — `engine/shapes.ts` + `data/shapes.json`
- **Purpose** Load the bag's shape list once into immutable records; validate it.
- **Public API** `loadShapes(json) → ShapeSet`; `shapes.all()`, `shapes.get(id)`, each `Shape = { id, silhouette, cells: Pos[], weight }`.
- **Reads** `data/shapes.json` per the schema at the top of that file. **Writes** nothing.
- **Must not** be mutated after load; know about the grid or the bag rules.
- **Invariants** every `cells` list is normalized (min x = 0, min y = 0, no duplicates, connected); ids unique; weights ≥ 0 with at least one > 0; every silhouette named in HANDOFF's shape set present.
- **Spec** HANDOFF "Shape set".
- **Tests** `Shapes_LoadsRealData`; one test per validation rule using a deliberately broken fixture each.
- **Context** this card, `data/shapes.json` header.

## Rules

### Bag — `engine/bag.ts`
- **Purpose** Draw a hand of three shapes by weight, with the mercy rule (R18 solvable deal at launch; R1 draw scope as a tuner option) and the kill rule (R2).
- **Public API** `drawHand(shapes, grid, rng, config, runStats) → HandDraw` where `HandDraw = { shapes: [Shape, Shape, Shape], mercy: boolean }` (Run copies `mercy` into `HandDrawn`); `loadBagConfig(json) → BagConfig` from `data/bag.json` (mercy on/off, `mercyScope` reserved per R17, kill threshold and half-life, per-id weight overrides); `mercyChance(placements, config)` exposes the R2 curve for the tuner; `isSolvable(hand, grid)` and `handPasses(hand, grid, scope)` are the deal tests (R18).
- **Reads** `ShapeSet`, `Grid` (through `Placement.fits`/`anyFit`, and for the R18 lookahead `Placement.place` + `Clearing.clearLines` on clones only), `Rng` streams `Bag` and `Mercy`, run placement count. **Writes** stream positions only.
- **Must not** mutate the grid; touch the `BotTieBreak` stream; know about scoring.
- **Invariants** with mercy off the draw is a pure weighted sample from `Bag`; the mercy roll and redraw use only `Mercy` so the `Bag` sequence for a seed never depends on grid state; after the kill threshold the mercy probability follows `0.5 ^ ((placements − threshold) / halfLife)`; if nothing fits anywhere the original draw is returned with `mercy: false` and Run detects game over.
- **Spec** HANDOFF Core mechanic 2 and 6; R1, R2, R18.
- **Tests** weights honored over 10k draws (chi-square-ish tolerance); draw scope: mercy fires only when no drawn shape fits; solvable scope: `isSolvable` cases (together vs alone, order via clears, no mutation), every dealt hand solvable, gives up after `mercyAttempts`; mercy never fires when off; `Bag` positions identical with and without mercy for the same seed; kill curve values at threshold ±1.
- **Context** this card, R1, R2, Placement's `fits` signature.

### Placement — `engine/placement.ts`
- **Purpose** Fit check and placement of a shape at an origin.
- **Public API** `fits(shape, origin, grid) → boolean`; `place(shape, origin, grid) → Pos[]` (cells filled); `anyFit(shape, grid) → boolean`; `allOrigins(shape, grid) → Pos[]`.
- **Reads/Writes** `Grid` cells.
- **Must not** clear lines, score, or draw.
- **Invariants** `fits` is false if any cell is out of bounds or occupied; `place` throws if `!fits`; `place` fills exactly `shape.cells.length` cells.
- **Spec** HANDOFF Core mechanic 3.
- **Tests** fit at every edge and corner; overlap rejected; `anyFit` false on a full grid; `allOrigins` count for a single on an empty 8x8 is 64.
- **Context** this card, Grid's API.

### Clearing — `engine/clearing.ts`
- **Purpose** Find and clear every full row and column after a placement (boxes when the mode flag is on).
- **Public API** `clearLines(grid, mode) → { rows: number[], cols: number[], boxes: Pos[], cells: Pos[] }`.
- **Reads/Writes** `Grid`.
- **Must not** score; know about the hand.
- **Invariants** all full lines found before any cell is cleared; a shared cell is cleared once and appears in `cells` once (R8); with `mode.boxes` off, `boxes` is always empty (R6).
- **Spec** HANDOFF Core mechanic 4; R6, R8.
- **Tests** row only, column only, row+column sharing a cell, two rows at once, full grid, box mode toggle.
- **Context** this card, R6, R8.

### Scoring — `engine/scoring.ts`
- **Purpose** Score a placement from its cells and the lines it cleared, with combo and streak multipliers.
- **Public API** `scorePlacement(cellsPlaced, linesCleared, streakBefore, table) → { points, streakAfter }`; `ScoreTable` loaded from `data/scoring.json` (schema in that file's `_schema`; R15).
- **Reads** nothing but its arguments. **Writes** nothing.
- **Must not** touch the grid or state.
- **Invariants** pure; streak resets to 0 when `linesCleared === 0` (R9); points strictly increase with lines cleared; a `linesCleared` or `streakBefore` past the end of its table clamps to the last entry (UNVERIFIED, R15).
- **Spec** HANDOFF Core mechanic 5; R9.
- **Tests** every term in the formula; streak reset; combo of 1, 2, 3, 4 lines; table-driven so tuning is a JSON edit.
- **Context** this card, R9.

### Run — `engine/run.ts`
- **Purpose** The turn: validate placement, place, clear, score, redraw when the hand is empty, detect game over, offer and apply the one continue.
- **Public API** `runConfig(bag, scoring, gridSize?, mode?) → RunConfig`; `Run.start(shapes, config, seed) → Run`; `run.place(handIndex, origin, { continueAvailable }) → Event[]`; `run.canPlace(handIndex, origin)` (ghost preview, never mutates); `run.preview(handIndex, origin) → { points, linesCleared, streakAfter, filledAfter, gridAfter } | null` (what a legal placement would do, on a cloned grid; for the bot and UI hints); `run.canContinue()`, `run.continueRun(row, col) → Event[]`, `run.declineContinue() → Event[]` (the player refused or the ad failed; emits `RunEnded declined_continue`); `run.state()` (read-only snapshot); `run.events()` (full log copy); `run.clone()`, `serialize() → RunSave`, `Run.deserialize(shapes, config, save)`. `place`/`continueRun`/`declineContinue` throw when called in the wrong phase (`playing` / `continue_offered` / `ended`); an illegal placement in the right phase emits `PlacementRejected` instead.
- **Reads** everything above, plus `continueAvailable: boolean` passed by the caller on each `place()` (the view asks `ops/ads` and passes the answer in; the engine never imports `ops/`). **Writes** its own state and the event log.
- **Must not** be called by the view for anything the view could compute itself... except that the view may compute nothing: the view calls `fits` via `run.canPlace(handIndex, origin)` and animates events.
- **Invariants** every state change emits exactly one event (EVENTS.md); a hand is redrawn only when all three are placed (R10); game over only when no shape in hand fits anywhere; continue at most once per run (R3); same seed + same inputs → identical event log.
- **Spec** HANDOFF Core mechanic 1–7; R3, R10.
- **Tests** `engine.tests/run.test.ts` (24) and `engine.tests/golden.test.ts` (the four fixtures from EVENTS.md, regenerated only by `npm run golden:update`). Scripted run to game over under a fixed seed with the expected event log; illegal placement rejected with `PlacementRejected` and no state change; continue once then refused; clone does not alias. Test helpers in `engine.tests/helpers/play.ts` (first-fit player, crafted boards).
- **Context** this card, EVENTS.md, R3, R10.

## Meta

### Daily — `engine/daily.ts`
- **Purpose** Seed per UTC calendar day; one attempt per day.
- **Public API** `dailySeed(date) → number`; `dailyKey(date) → "YYYY-MM-DD"`.
- **Invariants** stable across timezones (UTC only); the same key on two devices gives the same seed (R7).
- **Tests** boundary at 23:59:59Z vs 00:00:00Z; two dates, two seeds.

### Progress — `engine/progress.ts`
- **Purpose** High score, days played, monthly trophy state, remove-ads flag, serialization. No game logic.
- **Public API** `record(runResult)`, `markDaily(key)`, `monthComplete(yyyyMm)`, `serialize()/deserialize()`.
- **Must not** compute a rule or read the grid.
- **Tests** round trip; a month is complete only when every day is marked; high score only rises.

## Ops (outside the engine; the view's window on the world)

### Ops ports — `ops/*.ts`, fakes in `ops/fake/`, real in `ops/real/`
- **Purpose** Ads, purchases, analytics and save behind four interfaces so the view and tests never touch an SDK (R16).
- **Public API** `Ops { ads: AdsPort, iap: IapPort, analytics: AnalyticsPort, save: SavePort }`; `fakeOps()` in tests. Method lists are in the interface files and are the contract; a real implementation that needs another method changes the interface, its fake and this card in the same commit.
- **Must not** be imported by `engine/` (layer guard); construct a port inside the view; send analytics before `setConsent(true)`.
- **Invariants** `showRewarded` resolves true only on the reward event; interstitials return false once ads are removed; `FakeSave` round-trips through `snapshot()` to simulate a restart.
- **Tests** `ops/fake/fakes.test.ts` (one per invariant). Real implementations are verified on device per `STEP1_EXPORT.md`, never in CI.
- **Context** this card, R3, R4, R16, `ops/*.ts`.

## Sim

### Bot — `tools/sim/bot.ts`
- **Purpose** Greedy player for tuning the bag: for each hand, try every (shape, origin) and pick by immediate score with a tie-break from `BotTieBreak`.
- **Public API** `tools/sim/bot.ts`: `playRun(shapes, config, seed, policy?) → { seed, placements, score, endedBy, killEngaged, mercyHands }`, `legalMoves(run)`, `chooseMove(moves, policy, tieBreak)`; `policy` is `"greedy"` (the card) or `"tidy"` (greedy, then fewest isolated holes; a careful-player comparator, UNVERIFIED). `tools/sim/tune.ts`: `tune(shapes, config, seeds, policy?) → TuneReport` (median, mean, p5, p95, max, meanScore, killEngaged share, mercyRate, R5 band flags), `sweep(shapes, base, variants, seeds)`, `BAND`, `WEIGHT_PRESETS`. CLI: `npm run sim -- [--runs N] [--seed S] [--policy p] [--sweep]`; prints, never writes.
- **Reads** `Run` only: `run.preview()` for every legal move, `run.place()`, `run.state()`, `run.events()`. Never takes the continue.
- **Must not** see the bag's next draw or any state a player cannot see; use `Math.random`.
- **Tests** `tools/sim/bot.test.ts`: deterministic under a seed; legal moves match the engine's preview; ties broken only from `BotTieBreak`; report shape and determinism; mercy off never longer than mercy on (strictly sooner was the card's wording; see the R17 finding); band flags; sweep rows.

---

## Reading a failure

| Failing tests | Look at |
|---|---|
| one shape's fixture | its row in `data/shapes.json` |
| Bag distribution only | `bag.ts` weights or the `Bag` stream |
| mercy or kill | `bag.ts` R1/R2 code, then the config |
| Run golden log | the module named by the first wrong event: `Placed` → Placement, `LinesCleared` → Clearing, `ComboScored` → Scoring, `HandDrawn` → Bag |
| many modules at once | `Grid` or `Rng` |
