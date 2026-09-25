/**
 * Bag: draw a hand of three shapes by weight, with the mercy rule (R1) and the kill
 * rule (R2). "The shape bag is the design" (HANDOFF): pure random kills players to bad
 * luck, so the bag is weighted and quietly redraws a hopeless hand, and after a run
 * gets long that mercy fades so runs end.
 *
 * Streams: the weighted draw uses `Bag`; the mercy roll and redraw use `Mercy`, so the
 * `Bag` sequence for a seed never depends on the grid. Draws are with replacement.
 * The grid is read only through Placement.anyFit and never mutated.
 */

import type { Grid } from "./grid.js";
import { anyFit } from "./placement.js";
import type { Rng, Stream } from "./rng.js";
import type { Shape, ShapeSet } from "./shapes.js";

export const HAND_SIZE = 3;

/** Tuning knobs loaded from data/bag.json. The tuner sweeps these (R2, R5). */
export interface BagConfig {
  /** Whether the hidden redraw is on at all (R1). */
  readonly mercy: boolean;
  /**
   * "draw": redraw a fresh hand of three when none fits (R1, launch rule).
   * "hand": also redraw mid-hand (R17, reserved; not implemented at launch).
   */
  readonly mercyScope: "draw" | "hand";
  /** Placement count after which the mercy chance starts falling (R2). */
  readonly killThreshold: number;
  /** Placements over which the mercy chance halves once past the threshold (R2). */
  readonly killHalfLife: number;
  /** Per-shape-id weight overrides on top of data/shapes.json. */
  readonly weights: Readonly<Record<string, number>>;
}

/** What Run needs to know about the run so far. */
export interface RunStats {
  readonly placements: number;
}

export interface HandDraw {
  readonly shapes: readonly [Shape, Shape, Shape];
  /** True when the R1 redraw replaced the original draw. Never shown to the player. */
  readonly mercy: boolean;
}

export class BagDataError extends Error {
  constructor(message: string) {
    super(`Bag: ${message}`);
    this.name = "BagDataError";
  }
}

/** Parse and validate the contents of data/bag.json. */
export function loadBagConfig(json: unknown): BagConfig {
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new BagDataError("expected an object");
  const o = json as Record<string, unknown>;

  const mercy = o["mercy"];
  if (typeof mercy !== "boolean") throw new BagDataError("mercy must be a boolean");

  const mercyScope = o["mercyScope"];
  if (mercyScope !== "draw" && mercyScope !== "hand") throw new BagDataError(`mercyScope must be "draw" or "hand"`);
  if (mercyScope === "hand") throw new BagDataError(`mercyScope "hand" is reserved and not implemented at launch (HANDOFF R17)`);

  const killThreshold = o["killThreshold"];
  if (!Number.isInteger(killThreshold) || (killThreshold as number) < 0)
    throw new BagDataError("killThreshold must be a non-negative integer");

  const killHalfLife = o["killHalfLife"];
  if (typeof killHalfLife !== "number" || !Number.isFinite(killHalfLife) || killHalfLife <= 0)
    throw new BagDataError("killHalfLife must be a finite number > 0");

  const weightsRaw = o["weights"] ?? {};
  if (typeof weightsRaw !== "object" || weightsRaw === null || Array.isArray(weightsRaw))
    throw new BagDataError("weights must be an object of shape id to weight");
  const weights: Record<string, number> = {};
  for (const [id, w] of Object.entries(weightsRaw as Record<string, unknown>)) {
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0)
      throw new BagDataError(`weights["${id}"] must be a finite number >= 0`);
    weights[id] = w;
  }

  return Object.freeze({
    mercy,
    mercyScope,
    killThreshold: killThreshold as number,
    killHalfLife,
    weights: Object.freeze(weights),
  });
}

/**
 * Probability that mercy fires, given the placements so far (R2). 1 up to and including
 * the threshold, then halving every `killHalfLife` placements. The bot tunes both.
 */
export function mercyChance(placements: number, config: BagConfig): number {
  if (placements <= config.killThreshold) return 1;
  return Math.pow(0.5, (placements - config.killThreshold) / config.killHalfLife);
}

/** The weight the bag uses for a shape: the config override if present, else the shape's own. */
export function effectiveWeight(shape: Shape, config: BagConfig): number {
  const override = config.weights[shape.id];
  return override === undefined ? shape.weight : override;
}

/**
 * Draw a hand of three. With mercy off this is a pure weighted sample from `Bag`.
 * With mercy on and no drawn shape fitting the grid, roll `Mercy` against
 * `mercyChance`; on success, redraw all three from `Mercy` using only shapes that fit.
 * If nothing fits anywhere the original draw is returned and Run detects game over.
 */
export function drawHand(shapes: ShapeSet, grid: Grid, rng: Rng, config: BagConfig, stats: RunStats): HandDraw {
  const pool = shapes.all().filter((s) => effectiveWeight(s, config) > 0);
  if (pool.length === 0) throw new BagDataError("every effective weight is 0; nothing to draw");

  const bag = rng.stream("Bag");
  const drawn = sample(pool, config, bag);

  if (!config.mercy) return { shapes: drawn, mercy: false };
  if (drawn.some((s) => anyFit(s, grid))) return { shapes: drawn, mercy: false };

  const mercyStream = rng.stream("Mercy");
  if (mercyStream.nextFloat() >= mercyChance(stats.placements, config)) return { shapes: drawn, mercy: false };

  const fitting = pool.filter((s) => anyFit(s, grid));
  if (fitting.length === 0) return { shapes: drawn, mercy: false };

  return { shapes: sample(fitting, config, mercyStream), mercy: true };
}

/** Three weighted draws with replacement from `pool` using `stream`. */
function sample(pool: readonly Shape[], config: BagConfig, stream: Stream): [Shape, Shape, Shape] {
  const weights = pool.map((s) => effectiveWeight(s, config));
  const total = weights.reduce((a, b) => a + b, 0);
  const one = (): Shape => {
    let r = stream.nextFloat() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return pool[i] as Shape;
    }
    return pool[pool.length - 1] as Shape; // float rounding at the top edge
  };
  return [one(), one(), one()];
}
