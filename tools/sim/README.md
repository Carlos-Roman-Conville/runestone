# tools/sim — bot and bag tuner (step 4)

- `bot.ts`: greedy player. Previews every legal move through `Run.preview`, keeps the best immediate score, breaks ties from the `BotTieBreak` stream. Never sees the bag's next draw. Never takes the continue.
- `tune.ts`: plays seeded runs and reports the run-length distribution against the R5 band (median 40–70, p5 ≥ 15, nothing past 400 without the kill rule). `sweep` runs the same seeds over bag variants.
- `cli.ts`: `npm run sim -- [--runs N] [--seed S] [--policy greedy|tidy] [--sweep]`. Prints; never writes. A winning variant becomes a JSON edit to `data/bag.json`.

Tests: `bot.test.ts` (determinism, report shape, mercy off shorter than on, band flags).
