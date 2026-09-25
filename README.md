# Runestone (placeholder name)

A drag-and-place block puzzle on a stone tablet, in pixel art. First title in a series of small retro games; this repo is where the store, ads, consent, analytics and save pipeline gets built and proven for the ones after it.

- Start: `AGENTS.md`, then `files/HANDOFF.md`.
- Rules: `files/HANDOFF.md` (Core mechanic + rulings table). Module contracts: `files/MODULES.md`. Events: `files/EVENTS.md`.
- Build: Node 22. `npm ci`, then `npm run check` (layer guard, typecheck, tests). No renderer, no Android SDK needed for the engine.
- Layout: `engine/` pure rules · `engine.tests/` Vitest · `data/` JSON · `ops/` ads, IAP, analytics, save behind interfaces · `game/` PixiJS view · `tools/sim/` bot and bag tuner.

Design docs (living, Claude Docs): Block Puzzle Game, Candy Crush Game, Retro Game Series Roadmap. `files/` carries the frozen, code-facing copy.
