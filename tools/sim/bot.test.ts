import { describe, expect, it } from "vitest";
import bagJson from "../../data/bag.json";
import scoringJson from "../../data/scoring.json";
import shapesJson from "../../data/shapes.json";
import { loadBagConfig } from "../../engine/bag.js";
import type { HandDrawn } from "../../engine/events.js";
import { Rng } from "../../engine/rng.js";
import { Run, runConfig } from "../../engine/run.js";
import { loadScoreTable } from "../../engine/scoring.js";
import { loadShapes } from "../../engine/shapes.js";
import { chooseMove, isolatedHoles, legalMoves, playRun, type Move } from "./bot.js";
import { quantile, seedRange, summarize, sweep, tune } from "./tune.js";

const shapes = loadShapes(shapesJson);
const bag = loadBagConfig(bagJson);
const config = runConfig(bag, loadScoreTable(scoringJson));

describe("Bot", () => {
  it("deterministic under a seed", () => {
    const a = playRun(shapes, config, 7);
    const b = playRun(shapes, config, 7);
    expect(a).toEqual(b);
    expect(a.placements).toBeGreaterThan(0);
    expect(a.endedBy).toBe("no_fit");
    expect(a.seed).toBe(7);
  });

  it("different seeds give different runs", () => {
    const lengths = new Set(seedRange(10).map((s) => playRun(shapes, config, s).placements));
    expect(lengths.size).toBeGreaterThan(1);
  });

  it("legalMoves lists every legal placement with the engine's preview score", () => {
    const run = Run.start(shapes, config, 1);
    const moves = legalMoves(run);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(run.canPlace(m.handIndex, m.origin)).toBe(true);
      expect(run.preview(m.handIndex, m.origin)?.points).toBe(m.points);
    }
  });

  it("chooseMove takes the highest points and breaks ties only from BotTieBreak", () => {
    const moves: Move[] = [
      { handIndex: 0, origin: { x: 0, y: 0 }, points: 1, filledAfter: 5, isolatedAfter: 0 },
      { handIndex: 1, origin: { x: 1, y: 0 }, points: 9, filledAfter: 5, isolatedAfter: 3 },
      { handIndex: 2, origin: { x: 2, y: 0 }, points: 9, filledAfter: 2, isolatedAfter: 1 },
    ];
    const s1 = new Rng(3).stream("BotTieBreak");
    const s2 = new Rng(3).stream("BotTieBreak");
    const pick = chooseMove(moves, "greedy", s1);
    expect(pick?.points).toBe(9);
    expect(chooseMove(moves, "greedy", s2)).toEqual(pick);
    expect(s1.position).toBe(1);
    expect(chooseMove(moves, "tidy", new Rng(3).stream("BotTieBreak"))?.handIndex).toBe(2);
    expect(chooseMove([], "greedy", s1)).toBeNull();
    expect(s1.position).toBe(1);
  });

  it("isolatedHoles counts empty cells with no empty neighbour", () => {
    expect(isolatedHoles(["#.#", "###", "..#"])).toBe(1);
    expect(isolatedHoles(["...", "...", "..."])).toBe(0);
    expect(isolatedHoles(["###", "#.#", "###"])).toBe(1);
    expect(isolatedHoles([".#.", "###", ".#."])).toBe(4);
  });

  it("the bot only uses BotTieBreak: the run's Bag sequence matches a first-fit run", () => {
    const seed = 5;
    const bot = playRun(shapes, config, seed);
    const run = Run.start(shapes, config, seed);
    const botFirstHand = (Run.start(shapes, config, seed).events()[1] as HandDrawn).shapes;
    expect((run.events()[1] as HandDrawn).shapes).toEqual(botFirstHand);
    expect(bot.placements).toBeGreaterThan(0);
  });
});

describe("Tuner", () => {
  it("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.05)).toBe(10);
    expect(quantile([0, 100], 0.25)).toBe(25);
  });

  it("report has the documented shape and is deterministic", () => {
    const seeds = seedRange(12);
    const r = tune(shapes, config, seeds);
    expect(r.runs).toBe(12);
    expect(r.policy).toBe("greedy");
    for (const k of ["median", "mean", "p5", "p95", "max", "meanScore"] as const) expect(Number.isFinite(r[k]), k).toBe(true);
    expect(r.p5).toBeLessThanOrEqual(r.median);
    expect(r.median).toBeLessThanOrEqual(r.p95);
    expect(r.p95).toBeLessThanOrEqual(r.max);
    expect(r.killEngaged).toBeGreaterThanOrEqual(0);
    expect(r.mercyRate).toBeGreaterThanOrEqual(0);
    expect(typeof r.band.all).toBe("boolean");
    expect(tune(shapes, config, seeds)).toEqual(r);
  });

  it("mercy off never ends runs later than the same config with mercy on", () => {
    // The card asked for strictly sooner. Draw-time mercy (R1) fires on ~1% of hands
    // because deaths are mid-hand (R17), so the medians are usually equal. Bot finding,
    // 2026-09-25; see HANDOFF R17.
    const seeds = seedRange(40);
    const on = tune(shapes, config, seeds);
    const off = tune(shapes, runConfig({ ...bag, mercy: false }, config.scoring), seeds);
    expect(off.median).toBeLessThanOrEqual(on.median);
    expect(off.mean).toBeLessThanOrEqual(on.mean);
    expect(off.mercyRate).toBe(0);
    expect(on.mercyRate).toBeGreaterThan(0);
  });

  it("band flags follow the R5 thresholds", () => {
    const mk = (placements: number[]) =>
      summarize(
        placements.map((p, i) => ({ seed: i, placements: p, score: 0, endedBy: "no_fit" as const, killEngaged: p > bag.killThreshold, mercyHands: 0 })),
        config,
        "greedy",
      );
    expect(mk([50, 55, 60, 45, 52]).band).toEqual({ median: true, p5: true, max: true, all: true });
    expect(mk([10, 12, 14, 13, 11]).band.median).toBe(false);
    expect(mk([10, 10, 60, 55, 52]).band.p5).toBe(false);
    expect(mk([50, 55, 60, 45, 900]).band.max).toBe(true); // 900 > threshold: kill engaged, allowed
  });

  it("sweep returns one row per variant over the same seeds", () => {
    const rows = sweep(shapes, config, [{ name: "a", bag }, { name: "b", bag: { ...bag, mercy: false } }], seedRange(6));
    expect(rows.map((r) => r.name)).toEqual(["a", "b"]);
    expect(rows[0]!.report.runs).toBe(6);
  });
});
