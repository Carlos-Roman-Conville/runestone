/**
 * npm run sim -- [--runs N] [--seed S] [--policy greedy|tidy] [--sweep]
 *
 * Without --sweep: one report for data/bag.json as it stands.
 * With --sweep: the same seeds over mercy on/off × kill threshold × half-life × weight
 * preset, so a JSON edit can be chosen with numbers in hand. Nothing here writes a file.
 */

import process from "node:process";
import bagJson from "../../data/bag.json";
import scoringJson from "../../data/scoring.json";
import shapesJson from "../../data/shapes.json";
import { loadBagConfig, type BagConfig } from "../../engine/bag.js";
import { runConfig } from "../../engine/run.js";
import { loadScoreTable } from "../../engine/scoring.js";
import { loadShapes } from "../../engine/shapes.js";
import type { Policy } from "./bot.js";
import { formatReport, seedRange, sweep, tune, WEIGHT_PRESETS, type Variant } from "./tune.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v === undefined ? fallback : v;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

const runs = Number(arg("runs", "200"));
const seedStart = Number(arg("seed", "1"));
const policy = arg("policy", "greedy") as Policy;
if (policy !== "greedy" && policy !== "tidy") throw new Error(`--policy must be greedy or tidy, got ${policy}`);

const shapes = loadShapes(shapesJson);
const bag = loadBagConfig(bagJson);
const base = runConfig(bag, loadScoreTable(scoringJson));
const seeds = seedRange(runs, seedStart);

console.log(`runestone sim · ${runs} runs from seed ${seedStart} · policy ${policy} · band: median 40–70, p5 ≥ 15, max ≤ 400 without kill\n`);

if (!has("sweep")) {
  const t0 = Date.now();
  console.log(formatReport("data/bag.json", tune(shapes, base, seeds, policy)));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
} else {
  const variants: Variant[] = [];
  for (const [preset, weights] of Object.entries(WEIGHT_PRESETS)) {
    variants.push({ name: `${preset} · mercy off`, bag: { ...bag, mercy: false, weights } });
    for (const killThreshold of [30, 60, 100, 150]) {
      for (const killHalfLife of [20, 50, 100]) {
        const v: BagConfig = { ...bag, mercy: true, killThreshold, killHalfLife, weights };
        variants.push({ name: `${preset} · mercy on · kill ${killThreshold}/${killHalfLife}`, bag: v });
      }
    }
  }
  const t0 = Date.now();
  for (const row of sweep(shapes, base, variants, seeds, policy)) console.log(formatReport(row.name, row.report));
  console.log(`\n${variants.length} variants × ${runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
