# AGENTS.md — for any agent working in this repo (Cursor, Claude Code, anyone)

Runestone is a drag-and-place block puzzle (Block Blast / Woodoku family) in pixel art, TypeScript, PixiJS view, Capacitor for phone, plain web build for portals. It ships first in a series so the store pipeline gets built once. **Nothing here is clever; the value is in the process and the feel.**

## Read in this order

1. `files/HANDOFF.md` — goal, document precedence, layers, build order with gates, the rulings table (R1–Rn), division of labor. **Owns scope and rules.**
2. `files/MODULES.md` — one contract card per module (purpose, API, reads/writes, must-nots, invariants, tests, context to load) and the dependency order. **The unit of work: one module per session.**
3. `files/EVENTS.md` — the event-log vocabulary the view animates and tests assert on.
4. `files/GLOSSARY.md` when a word looks ambiguous.

Precedence when two documents disagree: **rules and scope → HANDOFF; module boundaries → MODULES; event names and fields → EVENTS.**

## How to work: one module at a time

Open its contract card, the HANDOFF sections the card names, and the glossary — nothing else. Build it to the tests the card lists. If the job seems to need another module's internals, the boundary is wrong: stop and say so instead of reaching across.

## Hard constraints (CI enforces the first three; you enforce the rest)

- `engine/` imports **nothing** outside `engine/` (no `pixi.js`, no `@capacitor/*`, no `game/`, no `ops/`, no packages). `scripts/check-engine-imports.mjs` fails CI otherwise.
- `npm run typecheck` is clean under `strict` and `noUncheckedIndexedAccess`.
- `npm test` passes with no renderer and no Android SDK installed.
- **No rule that isn't in HANDOFF's Core mechanic or its rulings table.** If the doc is silent, add a rulings row with a best guess and a `// UNVERIFIED — see HANDOFF Rn` comment. Don't invent silently.
- **Adding or reweighting a shape is a JSON edit** (`data/shapes.json`). If it needs a `.ts` change, stop and say why.
- Every random draw uses a named stream from `engine/rng.ts` (`Bag`, `Mercy`, `BotTieBreak`). No `Math.random` anywhere in `engine/` or `tools/sim/`.
- Every state change emits exactly one event from `EVENTS.md`. The view (`game/`) never computes a rule; it asks the engine.
- `ops/` code is only ever called through its interfaces; tests use the fakes in `ops/fake/`. No SDK import outside `ops/`.
- `Grid`, `Rng` and run state are copied with `clone()` only; never share a `Uint8Array` or a stream between two states.

## Pins

Node 22 · TypeScript 5.6 · Vitest 2 · PixiJS 8 (when `game/` starts) · Capacitor 6 (when step 1's export starts). Change a pin only after `npm run check` and the step-1 export gate are re-run.

## Cursor rules

`.cursor/rules/*.mdc` carry these same rules scoped by folder so the right ones attach to whatever file is open. AGENTS.md is the portable summary.

## When you're unsure

Say so in the commit message and in a `// UNVERIFIED` comment, add a rulings row, and continue. Do not re-open a `SETTLED` ruling.
