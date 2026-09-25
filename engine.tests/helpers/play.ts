/**
 * Test helpers for Run: the shared config, a deterministic first-fit player, and a
 * way to start a run from a crafted board. Not a bot; tools/sim owns that.
 */

import bagJson from "../../data/bag.json";
import scoringJson from "../../data/scoring.json";
import shapesJson from "../../data/shapes.json";
import { loadBagConfig } from "../../engine/bag.js";
import type { GameEvent } from "../../engine/events.js";
import { Rng } from "../../engine/rng.js";
import { Run, runConfig, type RunConfig, type RunSave } from "../../engine/run.js";
import { loadScoreTable } from "../../engine/scoring.js";
import { loadShapes } from "../../engine/shapes.js";

export const shapes = loadShapes(shapesJson);
export const config: RunConfig = runConfig(loadBagConfig(bagJson), loadScoreTable(scoringJson));

/** The first (handIndex, origin) that is legal, scanning hand slots in order then the grid top-left first. */
export function firstFit(run: Run): { handIndex: number; origin: { x: number; y: number } } | null {
  const size = run.state().grid.length;
  for (let handIndex = 0; handIndex < 3; handIndex++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (run.canPlace(handIndex, { x, y })) return { handIndex, origin: { x, y } };
  }
  return null;
}

/** Play first-fit until the run ends. Returns every event emitted after `run` was handed in. */
export function playOut(run: Run, continueAvailable = false, maxPlacements = 10_000): GameEvent[] {
  const out: GameEvent[] = [];
  let n = 0;
  while (run.state().phase === "playing") {
    const move = firstFit(run);
    if (!move) throw new Error("playOut: phase is playing but nothing fits; Run should have ended");
    out.push(...run.place(move.handIndex, move.origin, { continueAvailable }));
    if (++n > maxPlacements) throw new Error(`playOut: exceeded ${maxPlacements} placements`);
  }
  return out;
}

/** A run at a chosen board, hand and seed with an empty log, for scenarios Run.start cannot reach directly. */
export function craft(opts: {
  rows: readonly string[];
  hand: readonly [string | null, string | null, string | null];
  seed: number;
  placements?: number;
  continueUsed?: boolean;
}): Run {
  const save: RunSave = {
    version: 1,
    seed: opts.seed,
    phase: "playing",
    grid: opts.rows,
    hand: opts.hand,
    score: 0,
    placements: opts.placements ?? 0,
    streak: 0,
    continueUsed: opts.continueUsed ?? false,
    rng: new Rng(opts.seed).serialize(),
    events: [],
  };
  return Run.deserialize(shapes, config, save);
}

export const FULL_ROW = "########";
export const EMPTY_ROW = "........";

/** Rows of a full board with the given cells empty. */
export function boardWithHoles(holes: readonly { x: number; y: number }[], size = 8): string[] {
  const rows = Array.from({ length: size }, () => "#".repeat(size).split(""));
  for (const h of holes) rows[h.y]![h.x] = ".";
  return rows.map((r) => r.join(""));
}

/**
 * A board where only a single can fit and no line is close to complete: holes at (i, i)
 * and (i, (i + 4) % 8). No two holes touch orthogonally, and every row and column keeps
 * two holes, so filling one hole never completes a line. A full board with a few holes
 * would not do: its other rows are already complete and clear on the first placement.
 */
export function singlesOnlyBoard(): string[] {
  const holes: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) holes.push({ x: i, y: i }, { x: (i + 4) % 8, y: i });
  return boardWithHoles(holes);
}

export function types(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type);
}
