import { describe, expect, it } from "vitest";
import bagJson from "../data/bag.json";
import shapesJson from "../data/shapes.json";
import {
  BagDataError,
  drawHand,
  effectiveWeight,
  handPasses,
  isSolvable,
  loadBagConfig,
  mercyChance,
  type BagConfig,
} from "../engine/bag.js";
import { Grid } from "../engine/grid.js";
import { Rng } from "../engine/rng.js";
import { loadShapes } from "../engine/shapes.js";

const shapes = loadShapes(shapesJson);
const base = loadBagConfig(bagJson);

function cfg(patch: Partial<BagConfig>): BagConfig {
  return { ...base, ...patch };
}
/** R1 behaviour: the original draw-scope mercy. */
const draw = cfg({ mercyScope: "draw" });

const EMPTY = () => Grid.empty(8);
/** Only `single` fits: one empty cell. */
const ONE_CELL = () =>
  Grid.fromRows(["########", "########", "########", "###.####", "########", "########", "########", "########"]);
const FULL = () => Grid.fromRows(Array(8).fill("########"));
const stats = { placements: 0 };

describe("Bag config", () => {
  it("loadBagConfig: real data loads with mercy on and is frozen", () => {
    expect(base.mercy).toBe(true);
    expect(base.mercyScope).toBe("solvable");
    expect(base.mercyAttempts).toBeGreaterThanOrEqual(1);
    expect(base.killThreshold).toBeGreaterThan(0);
    expect(base.killHalfLife).toBeGreaterThan(0);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.weights)).toBe(true);
  });

  it("loadBagConfig: rejects broken fields", () => {
    expect(() => loadBagConfig(null)).toThrow(BagDataError);
    expect(() => loadBagConfig({ ...bagJson, mercy: "yes" })).toThrow(/mercy must be/);
    expect(() => loadBagConfig({ ...bagJson, mercyScope: "row" })).toThrow(/mercyScope/);
    expect(() => loadBagConfig({ ...bagJson, mercyAttempts: 0 })).toThrow(/mercyAttempts/);
    expect(() => loadBagConfig({ ...bagJson, killThreshold: -1 })).toThrow(/killThreshold/);
    expect(() => loadBagConfig({ ...bagJson, killHalfLife: 0 })).toThrow(/killHalfLife/);
    expect(() => loadBagConfig({ ...bagJson, weights: { single: -2 } })).toThrow(/weights\["single"\]/);
  });

  it("loadBagConfig: mercyScope hand is reserved and rejected (R17)", () => {
    expect(() => loadBagConfig({ ...bagJson, mercyScope: "hand" })).toThrow(/R17/);
  });

  it("effectiveWeight: config override replaces the shape's own weight", () => {
    const s = shapes.get("single");
    expect(effectiveWeight(s, base)).toBe(s.weight);
    expect(effectiveWeight(s, cfg({ weights: { single: 0 } }))).toBe(0);
    expect(effectiveWeight(s, cfg({ weights: { single: 99 } }))).toBe(99);
  });
});

describe("Bag draw", () => {
  it("same seed gives the same hand", () => {
    const a = drawHand(shapes, EMPTY(), new Rng(7), base, stats);
    const b = drawHand(shapes, EMPTY(), new Rng(7), base, stats);
    expect(a.shapes.map((s) => s.id)).toEqual(b.shapes.map((s) => s.id));
  });

  it("weights honored over 10k hands (chi-square-ish tolerance)", () => {
    const rng = new Rng(1);
    const config = cfg({ mercy: false });
    const counts = new Map<string, number>();
    const hands = 10_000;
    for (let i = 0; i < hands; i++) {
      for (const s of drawHand(shapes, EMPTY(), rng, config, stats).shapes) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
    const total = shapes.all().reduce((a, s) => a + s.weight, 0);
    const draws = hands * 3;
    for (const s of shapes.all()) {
      const expected = (s.weight / total) * draws;
      const observed = counts.get(s.id) ?? 0;
      // 5 sigma on a binomial; loose enough that modulo/float bias never trips it.
      expect(Math.abs(observed - expected), s.id).toBeLessThan(5 * Math.sqrt(expected));
    }
  });

  it("zero-weight shapes are never drawn", () => {
    const rng = new Rng(2);
    const config = cfg({ mercy: false, weights: { single: 0, square3: 0 } });
    for (let i = 0; i < 2000; i++) {
      for (const s of drawHand(shapes, EMPTY(), rng, config, stats).shapes) expect(["single", "square3"]).not.toContain(s.id);
    }
  });

  it("a weight override can dominate the bag", () => {
    const rng = new Rng(3);
    const config = cfg({ mercy: false, weights: { square3: 100_000 } });
    let square3 = 0;
    for (let i = 0; i < 1000; i++) for (const s of drawHand(shapes, EMPTY(), rng, config, stats).shapes) if (s.id === "square3") square3++;
    expect(square3).toBeGreaterThan(2900);
  });

  it("throws when every effective weight is 0", () => {
    const zero: Record<string, number> = {};
    for (const s of shapes.all()) zero[s.id] = 0;
    expect(() => drawHand(shapes, EMPTY(), new Rng(1), cfg({ weights: zero }), stats)).toThrow(/every effective weight is 0/);
  });
});

describe("Bag mercy, draw scope (R1)", () => {
  it("mercy fires only when no drawn shape fits, and then every shape fits", () => {
    let fired = 0;
    let skipped = 0;
    for (let seed = 0; seed < 300; seed++) {
      const off = drawHand(shapes, ONE_CELL(), new Rng(seed), cfg({ mercy: false }), stats);
      const on = drawHand(shapes, ONE_CELL(), new Rng(seed), draw, stats);
      const originalFits = off.shapes.some((s) => s.id === "single");
      if (originalFits) {
        expect(on.mercy).toBe(false);
        expect(on.shapes.map((s) => s.id)).toEqual(off.shapes.map((s) => s.id));
        skipped++;
      } else {
        expect(on.mercy).toBe(true);
        expect(on.shapes.every((s) => s.id === "single")).toBe(true);
        fired++;
      }
    }
    expect(fired).toBeGreaterThan(0);
    expect(skipped).toBeGreaterThan(0);
  });

  it("mercy never fires when off", () => {
    for (let seed = 0; seed < 300; seed++) {
      const hand = drawHand(shapes, ONE_CELL(), new Rng(seed), cfg({ mercy: false }), stats);
      expect(hand.mercy).toBe(false);
    }
  });

  it("Bag positions identical with and without mercy for the same seed", () => {
    for (let seed = 0; seed < 100; seed++) {
      const a = new Rng(seed);
      const b = new Rng(seed);
      const on = drawHand(shapes, ONE_CELL(), a, draw, stats);
      drawHand(shapes, ONE_CELL(), b, cfg({ mercy: false }), stats);
      expect(a.stream("Bag").position).toBe(b.stream("Bag").position);
      expect(b.stream("Mercy").position).toBe(0);
      if (on.mercy) expect(a.stream("Mercy").position).toBeGreaterThan(1);
    }
  });

  it("mercy draws honor weights among the fitting shapes only", () => {
    // Two rows free: singles and horizontal lines fit; verticals of 3+ and 3x3 do not.
    const grid = Grid.fromRows(["........", "........", "########", "########", "########", "########", "########", "########"]);
    const rng = new Rng(11);
    let mercyHands = 0;
    for (let i = 0; i < 500; i++) {
      const hand = drawHand(shapes, grid, rng, draw, stats);
      if (!hand.mercy) continue;
      mercyHands++;
      for (const s of hand.shapes) expect(["line3_v", "line4_v", "line5_v", "square3"]).not.toContain(s.id);
    }
    expect(mercyHands).toBeGreaterThan(0);
  });

  it("returns the original draw with mercy false when nothing fits anywhere", () => {
    const a = new Rng(5);
    const hand = drawHand(shapes, FULL(), a, draw, stats);
    expect(hand.mercy).toBe(false);
    expect(hand.shapes).toHaveLength(3);
  });

  it("does not mutate the grid", () => {
    const g = ONE_CELL();
    const before = g.toRows();
    for (let seed = 0; seed < 50; seed++) drawHand(shapes, g, new Rng(seed), draw, stats);
    expect(g.toRows()).toEqual(before);
  });
});

describe("Bag mercy, solvable scope (R18)", () => {
  const S = (...ids: string[]) => ids.map((id) => shapes.get(id));
  // A 2x2 pocket at (0,0) plus one isolated extra hole in every row and column, placed so
  // no line ever completes. A full board with a pocket would clear on the first placement.
  const POCKET = () =>
    Grid.fromRows(["..#.####", "..##.###", "#####.##", "######.#", "#######.", ".#######", "#.######", "##.#####"]);
  // Two pockets, same idea.
  const TWO_POCKETS = () =>
    Grid.fromRows(["..#.##..", "..##.#..", "#####.##", "######.#", "#######.", ".#######", "#.######", "##.#####"]);

  it("isSolvable: anything on an empty grid", () => {
    expect(isSolvable(S("square3", "line5_h", "largeL_0"), EMPTY())).toBe(true);
    expect(isSolvable([], EMPTY())).toBe(true);
  });

  it("isSolvable: each fits alone but not together is false", () => {
    expect(handPasses(S("square2", "square2", "single"), POCKET(), "draw")).toBe(true);
    // Not square2+square2+single: the single can complete row 0 and column 3 and the cleared cross seats a square.
    expect(isSolvable(S("square2", "square2", "square2"), POCKET())).toBe(false);
    expect(isSolvable(S("square2", "single", "single"), POCKET())).toBe(true); // the extras take the singles
    expect(isSolvable(S("square2", "square2"), POCKET())).toBe(false);
    expect(isSolvable(S("square2"), POCKET())).toBe(true);
  });

  it("isSolvable: order and clears matter", () => {
    // Row 0 needs one cell; after it clears, the freed row takes a line5_h.
    const grid = Grid.fromRows(["#######.", "########", "########", "########", "########", "########", "########", "########"]);
    expect(isSolvable(S("single", "line5_h"), grid)).toBe(true);
    expect(isSolvable(S("line5_h"), grid)).toBe(false);
  });

  it("isSolvable never mutates the grid", () => {
    const g = POCKET();
    const before = g.toRows();
    isSolvable(S("square2", "single", "single"), g);
    expect(g.toRows()).toEqual(before);
  });

  it("every dealt hand is solvable when mercy fires, and it fires only on unsolvable draws", () => {
    let fired = 0;
    let kept = 0;
    for (let seed = 0; seed < 300; seed++) {
      const off = drawHand(shapes, TWO_POCKETS(), new Rng(seed), cfg({ mercy: false }), stats);
      const on = drawHand(shapes, TWO_POCKETS(), new Rng(seed), base, stats);
      if (isSolvable(off.shapes, TWO_POCKETS())) {
        expect(on.mercy).toBe(false);
        expect(on.shapes.map((s) => s.id)).toEqual(off.shapes.map((s) => s.id));
        kept++;
      } else if (on.mercy) {
        expect(isSolvable(on.shapes, TWO_POCKETS())).toBe(true);
        fired++;
      } else {
        expect(on.shapes.map((s) => s.id)).toEqual(off.shapes.map((s) => s.id)); // gave up
      }
    }
    expect(fired).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it("solvable scope leaves the Bag stream where mercy off does", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = new Rng(seed);
      const b = new Rng(seed);
      drawHand(shapes, TWO_POCKETS(), a, base, stats);
      drawHand(shapes, TWO_POCKETS(), b, cfg({ mercy: false }), stats);
      expect(a.stream("Bag").position).toBe(b.stream("Bag").position);
    }
  });

  it("gives up after mercyAttempts and deals the original", () => {
    // Only square2 is drawable, the pocket takes one, so no three-shape hand is ever solvable.
    const onlySquare2: Record<string, number> = {};
    for (const s of shapes.all()) onlySquare2[s.id] = s.id === "square2" ? 1 : 0;
    const few = cfg({ mercyAttempts: 3, weights: onlySquare2 });
    for (let seed = 0; seed < 100; seed++) {
      const a = new Rng(seed);
      const hand = drawHand(shapes, POCKET(), a, few, stats);
      expect(hand.mercy).toBe(false);
      expect(a.stream("Mercy").position).toBeLessThanOrEqual(1 + 3 * 3);
    }
  });
});

describe("Bag kill rule (R2)", () => {
  it("kill curve: 1 at threshold-1, threshold and 0; halves every half-life after", () => {
    const c = cfg({ killThreshold: 150, killHalfLife: 100 });
    expect(mercyChance(0, c)).toBe(1);
    expect(mercyChance(149, c)).toBe(1);
    expect(mercyChance(150, c)).toBe(1);
    expect(mercyChance(151, c)).toBeCloseTo(Math.pow(0.5, 1 / 100), 12);
    expect(mercyChance(250, c)).toBeCloseTo(0.5, 12);
    expect(mercyChance(350, c)).toBeCloseTo(0.25, 12);
  });

  it("after the kill threshold, mercy fires less often", () => {
    const count = (placements: number): number => {
      let fired = 0;
      for (let seed = 0; seed < 400; seed++) {
        if (drawHand(shapes, ONE_CELL(), new Rng(seed), draw, { placements }).mercy) fired++;
      }
      return fired;
    };
    const before = count(0);
    const late = count(base.killThreshold + 2 * base.killHalfLife);
    const dead = count(base.killThreshold + 40 * base.killHalfLife);
    expect(before).toBeGreaterThan(0);
    expect(late).toBeLessThan(before);
    expect(late).toBeGreaterThan(0);
    expect(dead).toBe(0);
  });

  it("the kill roll consumes exactly one Mercy value when it declines", () => {
    const a = new Rng(9);
    const dead = { placements: base.killThreshold + 40 * base.killHalfLife };
    const hand = drawHand(shapes, ONE_CELL(), a, draw, dead);
    const originalFits = hand.shapes.some((s) => s.id === "single");
    if (originalFits) expect(a.stream("Mercy").position).toBe(0);
    else expect(a.stream("Mercy").position).toBe(1);
    expect(hand.mercy).toBe(false);
  });
});
