# GLOSSARY

- **Shape** — a set of cells (a polyomino) the player places. One entry in `data/shapes.json`. Has an `id` (unique per rotation) and a `silhouette` (shared by its rotations).
- **Silhouette** — the shape family ignoring rotation: single, line2..line5, square2, square3, smallL, largeL, T, S. Eleven at launch.
- **Hand** — the three shapes currently offered. Redrawn only when all three are placed (R10).
- **Bag** — the weighted pool the hand is drawn from, plus the mercy and kill rules. Not a physical bag; draws are with replacement.
- **Mercy** — a hidden redraw of a dealt hand. At launch the test is R18, *solvable*: the three shapes can all be placed in some order. R1's weaker test (*any one fits*) remains as a tuner option. Uses the `Mercy` stream.
- **Kill rule** — the mercy chance falling after a run-length threshold so runs end (R2).
- **Placement** — one legal `place()` call. `turn` counts placements.
- **Line** — a full row or column. **Box** — a full 3x3 in box mode (R6, off at launch).
- **Combo** — lines cleared by one placement. **Streak** — consecutive placements that each cleared at least one line (R9).
- **Continue** — the one rewarded-ad rescue per run (R3).
- **Run** — one game from `RunStarted` to `RunEnded`.
- **Daily** — the run whose seed comes from the UTC date (R7).
- **Event** — one entry in the log; see `EVENTS.md`. **Golden fixture** — a recorded event log a test compares against.
- **Stream** — a named RNG sequence (`Bag`, `Mercy`, `BotTieBreak`).
- **Ghost** — the translucent preview of a shape at the pointer before drop (view only).
- **UNVERIFIED / SETTLED** — rulings-table tags; see HANDOFF.
