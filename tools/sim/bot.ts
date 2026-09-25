/**
 * Bot: a greedy player for tuning the bag. For each hand it previews every legal
 * (shape, origin), keeps the best immediate score, and breaks ties from the
 * `BotTieBreak` stream. It sees only what a player sees: the hand, the grid, the
 * score. It never looks at the bag's next draw. No Math.random.
 *
 * It is deliberately not clever. The bag is tuned for a middling player; a strong
 * bot would hide bad luck the real audience feels.
 */

import type { GameEvent, RunEnded } from "../../engine/events.js";
import type { Pos } from "../../engine/grid.js";
import { Rng, type Stream } from "../../engine/rng.js";
import { Run, type RunConfig } from "../../engine/run.js";
import type { ShapeSet } from "../../engine/shapes.js";

export interface Move {
  readonly handIndex: number;
  readonly origin: Pos;
  readonly points: number;
  readonly filledAfter: number;
  /** Empty cells with no empty orthogonal neighbour after the move (tidy policy only). */
  readonly isolatedAfter: number;
}

export interface RunResult {
  readonly seed: number;
  readonly placements: number;
  readonly score: number;
  readonly endedBy: RunEnded["endedBy"];
  /** Placements past the kill threshold, so the R2 curve was active at the end. */
  readonly killEngaged: boolean;
  /** Hands the R1 mercy redraw replaced. */
  readonly mercyHands: number;
}

/**
 * Policy for choosing among the legal moves.
 * - "greedy": highest immediate points, ties broken at random (the MODULES card).
 * - "tidy": highest immediate points, then fewest isolated empty cells left, then random.
 *   Reserved for comparing what a slightly careful player experiences. UNVERIFIED —
 *   see HANDOFF R5; the card only names greedy.
 */
export type Policy = "greedy" | "tidy";

/** Every legal move for the current hand, with what it would score. */
export function legalMoves(run: Run): Move[] {
  const size = run.state().grid.length;
  const moves: Move[] = [];
  for (let handIndex = 0; handIndex < 3; handIndex++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = run.preview(handIndex, { x, y });
        if (p) moves.push({ handIndex, origin: { x, y }, points: p.points, filledAfter: p.filledAfter, isolatedAfter: isolatedHoles(p.gridAfter) });
      }
    }
  }
  return moves;
}

/** Pick one move by policy; ties resolved from `tieBreak`. Null when nothing is legal. */
export function chooseMove(moves: readonly Move[], policy: Policy, tieBreak: Stream): Move | null {
  if (moves.length === 0) return null;
  let best: Move[] = [];
  for (const m of moves) {
    const top = best[0];
    const cmp = top ? compare(m, top, policy) : 1;
    if (cmp > 0) best = [m];
    else if (cmp === 0) best.push(m);
  }
  return best.length === 1 ? (best[0] as Move) : (best[tieBreak.next(best.length)] as Move);
}

function compare(a: Move, b: Move, policy: Policy): number {
  if (a.points !== b.points) return a.points - b.points;
  if (policy === "tidy" && a.isolatedAfter !== b.isolatedAfter) return b.isolatedAfter - a.isolatedAfter;
  return 0;
}

/** Empty cells whose four neighbours are all filled or off-grid: the cells only a single can ever use. */
export function isolatedHoles(rows: readonly string[]): number {
  const empty = (x: number, y: number): boolean => rows[y]?.[x] === ".";
  let n = 0;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows.length; x++) {
      if (empty(x, y) && !empty(x - 1, y) && !empty(x + 1, y) && !empty(x, y - 1) && !empty(x, y + 1)) n++;
    }
  }
  return n;
}

/** Play one run to the end. The bot never takes the continue; it measures the base game. */
export function playRun(shapes: ShapeSet, config: RunConfig, seed: number, policy: Policy = "greedy"): RunResult {
  const run = Run.start(shapes, config, seed);
  const tieBreak = new Rng(seed).stream("BotTieBreak");
  let mercyHands = 0;
  const countMercy = (events: readonly GameEvent[]): void => {
    for (const e of events) if (e.type === "HandDrawn" && e.mercy) mercyHands++;
  };
  countMercy(run.events());

  while (run.state().phase === "playing") {
    const move = chooseMove(legalMoves(run), policy, tieBreak);
    if (!move) throw new Error("bot: phase is playing but no legal move; Run should have ended");
    countMercy(run.place(move.handIndex, move.origin, { continueAvailable: false }));
  }

  const end = run.events().at(-1) as RunEnded;
  const placements = run.state().placements;
  return {
    seed,
    placements,
    score: run.state().score,
    endedBy: end.endedBy,
    killEngaged: placements > config.bag.killThreshold,
    mercyHands,
  };
}
