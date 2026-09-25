/**
 * Tuner: play many seeded runs with the bot and report the run-length distribution
 * against the R5 band. Sweeps are just many reports over config variants; the
 * numbers that pass go into data/bag.json by hand, as a JSON edit.
 */

import type { BagConfig } from "../../engine/bag.js";
import { runConfig, type RunConfig } from "../../engine/run.js";
import type { ShapeSet } from "../../engine/shapes.js";
import { playRun, type Policy, type RunResult } from "./bot.js";

/** R5: median 40–70, p5 ≥ 15, nothing past 400 without the kill rule. UNVERIFIED. */
export const BAND = Object.freeze({ medianMin: 40, medianMax: 70, p5Min: 15, maxWithoutKill: 400 });

export interface TuneReport {
  readonly runs: number;
  readonly policy: Policy;
  readonly median: number;
  readonly mean: number;
  readonly p5: number;
  readonly p95: number;
  readonly max: number;
  readonly meanScore: number;
  /** Share of runs (0–1) that got past the kill threshold. */
  readonly killEngaged: number;
  /** Share of hands that needed mercy, over all runs. */
  readonly mercyRate: number;
  readonly band: {
    readonly median: boolean;
    readonly p5: boolean;
    readonly max: boolean;
    readonly all: boolean;
  };
}

export function seedRange(count: number, start = 1): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

/** Sorted-array quantile with linear interpolation. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function summarize(results: readonly RunResult[], config: RunConfig, policy: Policy): TuneReport {
  const lengths = results.map((r) => r.placements).sort((a, b) => a - b);
  const median = quantile(lengths, 0.5);
  const p5 = quantile(lengths, 0.05);
  const p95 = quantile(lengths, 0.95);
  const max = lengths.at(-1) ?? 0;
  const mean = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const meanScore = results.reduce((a, r) => a + r.score, 0) / Math.max(1, results.length);
  const killEngaged = results.filter((r) => r.killEngaged).length / Math.max(1, results.length);
  const hands = results.reduce((a, r) => a + Math.ceil((r.placements + 1) / 3), 0);
  const mercyHands = results.reduce((a, r) => a + r.mercyHands, 0);
  const longestWithoutKill = Math.max(0, ...results.filter((r) => !r.killEngaged).map((r) => r.placements));
  const band = {
    median: median >= BAND.medianMin && median <= BAND.medianMax,
    p5: p5 >= BAND.p5Min,
    max: longestWithoutKill <= BAND.maxWithoutKill && config.bag.killThreshold <= BAND.maxWithoutKill,
  };
  return {
    runs: results.length,
    policy,
    median,
    mean,
    p5,
    p95,
    max,
    meanScore,
    killEngaged,
    mercyRate: hands === 0 ? 0 : mercyHands / hands,
    band: { ...band, all: band.median && band.p5 && band.max },
  };
}

/** Play every seed and summarize. Deterministic for a given (config, seeds, policy). */
export function tune(shapes: ShapeSet, config: RunConfig, seeds: readonly number[], policy: Policy = "greedy"): TuneReport {
  const results = seeds.map((seed) => playRun(shapes, config, seed, policy));
  return summarize(results, config, policy);
}

export interface Variant {
  readonly name: string;
  readonly bag: BagConfig;
}

export interface SweepRow {
  readonly name: string;
  readonly report: TuneReport;
}

/** Same seeds, same scoring, one report per bag variant. */
export function sweep(shapes: ShapeSet, base: RunConfig, variants: readonly Variant[], seeds: readonly number[], policy: Policy = "greedy"): SweepRow[] {
  return variants.map((v) => ({
    name: v.name,
    report: tune(shapes, runConfig(v.bag, base.scoring, base.gridSize, base.mode), seeds, policy),
  }));
}

/** Weight presets to compare. "lineHeavy" is the reviewer's suggestion; both UNVERIFIED (R5). */
export const WEIGHT_PRESETS: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  current: {},
  lineHeavy: {
    line2_h: 9, line2_v: 9, line3_h: 9, line3_v: 9, line4_h: 7, line4_v: 7, line5_h: 4, line5_v: 4,
    square2: 9, square3: 3, single: 8,
    smallL_0: 3, smallL_1: 3, smallL_2: 3, smallL_3: 3,
    largeL_0: 2, largeL_1: 2, largeL_2: 2, largeL_3: 2,
    T_0: 3, T_1: 3, T_2: 3, T_3: 3,
    S: 2, Z: 2,
  },
});

export function formatReport(name: string, r: TuneReport): string {
  const flag = (ok: boolean): string => (ok ? "ok " : "BAD");
  return [
    name.padEnd(34),
    `n=${r.runs}`.padEnd(7),
    `med ${r.median.toFixed(0).padStart(3)} ${flag(r.band.median)}`,
    `p5 ${r.p5.toFixed(0).padStart(3)} ${flag(r.band.p5)}`,
    `p95 ${r.p95.toFixed(0).padStart(4)}`,
    `max ${String(r.max).padStart(4)} ${flag(r.band.max)}`,
    `kill ${(r.killEngaged * 100).toFixed(0).padStart(3)}%`,
    `mercy ${(r.mercyRate * 100).toFixed(0).padStart(3)}%`,
    `score ${r.meanScore.toFixed(0).padStart(6)}`,
    r.band.all ? "IN BAND" : "",
  ].join("  ");
}
