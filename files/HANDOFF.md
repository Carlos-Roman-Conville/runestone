# PROJECT HANDOFF — Read this first

## Goal

Ship a drag-and-place block puzzle in pixel art to web portals and Android with rewarded ads, interstitials and one remove-ads purchase, and in doing so build the store/ads/consent/analytics/save pipeline that the next games in the series reuse. The genre is saturated; the realistic goal is a small steady earner and a working pipeline, not a hit. **Feel is the product**: in this genre every competitor has the same rules, so the difference is the snap, the clear, the sound, and how the bag treats a struggling player.

The living design doc is *Block Puzzle Game* (Claude Docs). This file is the frozen, code-facing copy; when they differ on a rule, this file is what the code implements, and the doc gets updated to match.

## State of play (2026-09-25)

Scaffold plus the ops layer. Rng and Grid built with tests; `ops/` has the four port interfaces (ads, iap, analytics, save) with scriptable fakes and tests; `data/scoring.json` holds UNVERIFIED starting score values. CI runs the layer guard, typecheck and tests on a machine with no renderer. Next: step 1 (`STEP1_EXPORT.md`) in parallel with Shapes → Bag → Placement.

## Document map

| File | What it is | Authority |
|---|---|---|
| `HANDOFF.md` | goal, layers, core mechanic, build order, division of labor, rulings | **scope and rules** |
| `MODULES.md` | one contract card per module, dependency order | **module boundaries** |
| `EVENTS.md` | event-log vocabulary | **event names and fields** |
| `GLOSSARY.md` | the words used precisely | read when a word looks ambiguous |
| `STEP1_EXPORT.md` | the Composer recipe for step 1: Vite + PixiJS scene, Capacitor Android, AdMob test ad | step 1 only |
| `DESIGN.md` | markdown export of the living design doc; the reasoning behind every ruling | context; HANDOFF wins on rules |

## Layers — three, no leakage

```
data/          JSON. shapes.json (bag with weights), palette.json, daily_seeds.json. Never contains logic.
engine/        Pure TypeScript. Rules, state, event log. Imports nothing outside engine/.
engine.tests/  Vitest. One test per rule. Runs with no renderer.
tools/sim/     Bot + bag tuner over data/*.json. Calls engine only.
ops/           Ads, IAP, analytics, save: an interface each (ops/*.ts), a fake each (ops/fake/), a real implementation each (ops/real/, from step 1). The only place an SDK is imported.
game/          PixiJS view + Capacitor shell. Reads the event log. Contains zero rules.
```

Test for the line being in the right place: **adding a shape is a JSON edit with no `.ts` change.** Test for the layers being intact: **`npm run check:layers` passes and `npm test` passes with nothing but Node installed.**

## Core mechanic (the spec)

1. The grid (8x8) starts empty. Nothing falls and nothing moves on its own.
2. The player is handed three shapes drawn from the bag.
3. The player drags a shape onto the grid. It may be placed where every one of its cells is empty and inside the grid. No rotation.
4. On placement, every full row and every full column clears at once. (Box clears are a later mode, R6.)
5. Score = cells placed + line bonus per line cleared × combo multiplier (lines cleared on one placement) × streak multiplier (consecutive placements that each cleared).
6. When all three shapes are placed, three new ones are drawn.
7. Game over when none of the shapes in hand fits anywhere. One continue per run via rewarded ad (R3).

**The shape bag is the design.** Pure random draws kill players to bad luck and they quit. The bag is weighted, has a mercy rule and a kill rule (R1, R2), and the bot tunes the numbers.

**Shape set.** 25 bag entries over 11 silhouettes (1010!'s classic 19 plus T, S and Z, as in Block Blast): single; 2, 3, 4, 5 in a line (each both ways); 2x2; 3x3; small L (4 rotations); large L (4 rotations); T (4 rotations); S and Z. S and Z are mirror images and share the silhouette `S`, which is what makes the count 11. Rotations are separate bag entries since the player cannot rotate. Data: `data/shapes.json`.

## Build order with gates

Nothing in a later step starts until the earlier gate passes.

| Step | Work | Owner | Gate |
|---|---|---|---|
| 1 | Blank PixiJS scene, Capacitor Android export, web build, test rewarded ad (AdMob test unit). Recipe: `STEP1_EXPORT.md` | Composer from the recipe, Rex on device | a build runs on Android and web and shows a test ad |
| 2 | This scaffold: docs, Cursor rules, CI, Rng, Grid | Claude Code | **DONE 2026-09-25** |
| 3 | Shapes → Bag → Placement → Clearing → Scoring → Run, headless | Claude Code, one module per session | a scripted run plays to game over in a test under a fixed seed |
| 4 | Bot and bag tuning | Claude Code | run-length distribution inside the target band (R5) |
| 5 | View: grid, drag and snap, clear animation, hand, score | Composer wiring, Claude Code review | a human plays a full run on device; recording verified by opening frames |
| 6 | Daily, Progress and save, continue via rewarded ad | Claude Code engine, Composer screens | save survives a restart; daily seed matches across two devices |
| 7 | Ads, remove-ads purchase, analytics, consent, privacy policy | Composer plumbing from recipe, Rex accounts | real ads serve, consent passes, purchase completes in sandbox |
| 8 | Pixel art pass, sound, store assets, listing | Rex | listing approved |
| 9 | Soft launch on one portal and Android | Rex | analytics arriving |
| 10 | Live loop: retune the bag from run data; decide on box mode and level mode | all | monthly |

## Division of labor

| Who | Owns | Does not touch |
|---|---|---|
| Rex | P0 decisions, palette, the stone tile and its states, sound, store and ad accounts, playtesting, verifying recordings by opening the frames | engine internals |
| Claude Code | these docs, every engine module and its tests, the bag rules, the bot, CI, the `ops/` interfaces and fakes | sprites, sound |
| Cursor Composer | screen wiring, asset import, ad/IAP plugin plumbing from a written recipe, store listing copy, daily seed table | engine rules; anything without a written prompt and a test list |

Rules of engagement: one module or one feature per chat. Composer prompts name the files, the test list and the done condition. A change to Bag, Placement or Clearing must pass the whole run suite before it is done. A recording counts as verified only when the frames were opened.

## What Claude Code decides vs. what Rex decides

**Claude Code decides:** file layout inside modules, function signatures, test structure, anything the contract cards leave open.

**Claude Code does NOT decide:** the game's name, theme and art, anything that changes what the player sees or pays for, any new rule (goes in the rulings table first), the stack, the platform order.

## Rulings table

Rows are added before the code that relies on them. Tags: **SETTLED** (decided by Rex or by the genre), **UNVERIFIED** (best guess; the bot or live data settles it), **product decision** (Rex's, reserved).

| # | Item | Ruling | Tag | Where |
|---|---|---|---|---|
| R1 | Mercy rule | If none of the three drawn shapes fits, redraw once using only shapes that fit. Never shown to the player. Draws from the `Mercy` stream so the `Bag` stream is unaffected. | UNVERIFIED | `engine/bag.ts` |
| R2 | Kill rule | After a run-length threshold (placements), the mercy chance falls on a curve so runs end; the high score is reachable but not infinite. Threshold and curve from the bot. | UNVERIFIED | `engine/bag.ts` |
| R3 | Continue | One rewarded ad per run clears a chosen row and a chosen column, then the same hand is offered again. Not offered if the ad is unavailable. | UNVERIFIED | `engine/run.ts`, `ops/ads` |
| R4 | Interstitial cap | Not on the first 3 runs of an install, at most one per 2 runs. | UNVERIFIED | `ops/ads` |
| R5 | Run-length band | Target: median run of 40–70 placements, 5th percentile ≥ 15, no run beyond 400 without the kill rule engaging. | UNVERIFIED | `tools/sim` |
| R6 | Box clears | Off at launch. Woodoku-style 3x3 box clears are a second mode after launch, behind a data flag. | SETTLED | `engine/clearing.ts` |
| R7 | Daily seed | UTC calendar day → seed; one attempt per day; the same board for everyone. | UNVERIFIED | `engine/daily.ts` |
| R8 | Shared cell | A placement that completes a row and a column sharing a cell clears both; the shared cell is cleared once and counts toward both lines' bonus. | SETTLED (genre) | `engine/clearing.ts` |
| R9 | Streak | Resets on any placement that clears nothing. | SETTLED (genre) | `engine/scoring.ts` |
| R10 | Hand order | The three shapes may be placed in any order; a new hand is drawn only when all three are placed. | SETTLED (genre) | `engine/run.ts` |
| R11 | Glyphs | Version two. Version one ships plain stone tiles; shapes are read by outline. | product decision (Rex, 2026-09-25) | `game/` |
| R12 | Stack | TypeScript, PixiJS, Vitest, Capacitor; web build for portals; Android first, iOS after revenue. | product decision (Rex, 2026-09-25) | repo |
| R13 | Art | Pixel art, one locked palette, one 24 px stone tile in three states (resting, lit, ghost), whole-number scaling, nearest-neighbor, no mixing with smooth assets. | product decision (Rex, 2026-09-25) | `game/` |
| R15 | Score table | `data/scoring.json`: per-cell, per-line, combo multiplier by lines cleared, streak multiplier by streak length. All values UNVERIFIED starting points; the bot and live data tune them. Changing a number is a JSON edit. | UNVERIFIED | `engine/scoring.ts` |
| R16 | Ops ports | Four interfaces in `ops/` (ads, iap, analytics, save), one fake each in `ops/fake/`, real implementations in `ops/real/` (step 1 and step 7). The view receives an `Ops` object at startup and never constructs a port itself. Analytics sends nothing until consent is granted. | SETTLED | `ops/` |
| R14 | Name | `runestone` is a placeholder; renaming is one pass over `package.json`, this file and the Capacitor app id. | product decision (reserved) | repo |
| R17 | Mid-hand mercy | R1 only guards a fresh draw of three. Launch rule: mercy also does not fire mid-hand; a hand whose remaining shapes no longer fit ends the run (or offers the continue, R3). `BagConfig.mercyScope: "draw" \| "hand"` is reserved so the bot can test the alternative (redraw the remaining shapes when none fits), since most deaths in this genre are mid-hand and R5's 5th-percentile target may need it. | UNVERIFIED | `engine/bag.ts`, `engine/run.ts` |

If Claude Code hits a case not on this list, add a row with a best-guess ruling **before** implementing, and flag it in the commit message.

## Repository hygiene

- Private until the store listing is live.
- No SDK keys, AdMob ids or signing keys in the repo. `ops/` reads them from environment or a gitignored config; `.env*` is ignored.
- `android/` and `ios/` (Capacitor output) are generated and ignored until step 1 decides otherwise.
