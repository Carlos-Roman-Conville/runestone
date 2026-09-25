# Runestone (placeholder name)

A drag-and-place block puzzle on a stone tablet, in pixel art. First title in a series of small retro games; this repo is where the store, ads, consent, analytics and save pipeline gets built and proven for the ones after it.

- Start: `AGENTS.md`, then `files/HANDOFF.md`.
- Rules: `files/HANDOFF.md` (Core mechanic + rulings table). Module contracts: `files/MODULES.md`. Events: `files/EVENTS.md`.
- Build: Node 22. `npm ci`, then `npm run check` (layer guard, typecheck, tests). No renderer, no Android SDK needed for the engine.
- Step 1 (export + test ad) recipe: `files/STEP1_EXPORT.md`.
- Layout: `engine/` pure rules · `engine.tests/` Vitest · `data/` JSON · `ops/` ads, IAP, analytics, save behind interfaces · `game/` PixiJS view · `tools/sim/` bot and bag tuner.

Design doc: `files/DESIGN.md` (exported from the living Claude Docs copy, *Block Puzzle Game*). `files/HANDOFF.md` is the code-facing version with the rulings table. The series roadmap lives one folder up in the games directory, not in any game repo.
