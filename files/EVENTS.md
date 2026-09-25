# EVENTS — the event log the view animates and the tests assert on

Every state change in `engine/` emits exactly one event. `Run.place()` and `Run.continueRun()` return the events of that action in order; `Run.events()` returns the whole run. The view (`game/`) replays them and never computes a rule. Tests compare logs to golden fixtures.

All events carry `{ type, turn }` where `turn` is the placement count so far. Positions are `{ x, y }`, origin top-left, y down.

| Event | Fields | Emitted by | When |
|---|---|---|---|
| `RunStarted` | `seed`, `gridSize`, `mode` | Run | once, first |
| `HandDrawn` | `shapes: id[3]`, `mercy: boolean` | Bag via Run | at start and whenever the hand empties |
| `PlacementRejected` | `handIndex`, `origin`, `reason: "out_of_bounds" \| "occupied" \| "no_such_shape"` | Run | an illegal `place()`; no state changed |
| `Placed` | `handIndex`, `shapeId`, `origin`, `cells: Pos[]` | Placement via Run | a legal placement |
| `LinesCleared` | `rows: number[]`, `cols: number[]`, `boxes: Pos[]`, `cells: Pos[]` | Clearing via Run | after `Placed`, even when nothing cleared (all arrays empty) |
| `ComboScored` | `points`, `linesCleared`, `combo` (the combo multiplier applied; 0 when nothing cleared), `streak` (after this placement), `total` | Scoring via Run | after `LinesCleared`, always |
| `StreakChanged` | `from`, `to` | Scoring via Run | only when the streak value changed |
| `HandEmpty` | — | Run | the third shape of a hand was placed; a `HandDrawn` follows |
| `NoFitDetected` | `hand: id[]` | Run | no shape in hand fits anywhere |
| `ContinueOffered` | — | Run | after `NoFitDetected` when a continue is still unused this run and the caller passed `continueAvailable: true` to `place()` (the view gets that from `ops/ads`; the engine never asks ads itself) |
| `ContinueUsed` | `row`, `col`, `cells: Pos[]` | Run | `continueRun()` applied |
| `RunEnded` | `score`, `placements`, `endedBy: "no_fit" \| "declined_continue"` | Run | terminal; nothing follows. `declined_continue` comes from `run.declineContinue()`; `no_fit` from a no-fit with no continue available, or after `ContinueUsed` when the hand still cannot fit |

Ordering guarantees per legal placement: `Placed` → `LinesCleared` → `ComboScored` → (`StreakChanged`)? → (`HandEmpty` → `HandDrawn`)? → (`NoFitDetected` → (`ContinueOffered` | `RunEnded`))?

Per `continueRun()`: `ContinueUsed` → (`NoFitDetected` → `RunEnded`)?. Per `declineContinue()`: `RunEnded`. `turn` on events after the hand redraw and on `ContinueUsed` is the placement count at that moment.

Fixture list (`engine.tests/golden/`): `run_seed_1.json` (full run to game over), `run_shared_cell.json` (row + column on one placement), `run_continue.json` (continue used then refused), `run_mercy.json` (a hand that needed mercy).
