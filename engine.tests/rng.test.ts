import { describe, expect, it } from "vitest";
import { Rng, STREAM_NAMES } from "../engine/rng.js";

describe("Rng", () => {
  it("same seed gives the same sequence", () => {
    const a = new Rng(42).stream("Bag");
    const b = new Rng(42).stream("Bag");
    const seqA = Array.from({ length: 50 }, () => a.next(1000));
    const seqB = Array.from({ length: 50 }, () => b.next(1000));
    expect(seqA).toEqual(seqB);
  });

  it("different seeds give different sequences", () => {
    const a = new Rng(1).stream("Bag");
    const b = new Rng(2).stream("Bag");
    const seqA = Array.from({ length: 20 }, () => a.next(1000));
    const seqB = Array.from({ length: 20 }, () => b.next(1000));
    expect(seqA).not.toEqual(seqB);
  });

  it("streams never share a sequence", () => {
    const rng = new Rng(7);
    const seqs = STREAM_NAMES.map((name) => Array.from({ length: 20 }, () => rng.stream(name).next(1000)));
    for (let i = 0; i < seqs.length; i++)
      for (let j = i + 1; j < seqs.length; j++) expect(seqs[i]).not.toEqual(seqs[j]);
  });

  it("drawing from one stream does not move another", () => {
    const rng = new Rng(7);
    const before = rng.stream("Mercy").position;
    rng.stream("Bag").next(10);
    rng.stream("Bag").next(10);
    expect(rng.stream("Mercy").position).toBe(before);
  });

  it("clone continues identically and does not alias the original", () => {
    const rng = new Rng(99);
    rng.stream("Bag").next(10);
    rng.stream("Bag").next(10);
    const copy = rng.clone();
    const fromCopy = Array.from({ length: 10 }, () => copy.stream("Bag").next(1000));
    const fromOrig = Array.from({ length: 10 }, () => rng.stream("Bag").next(1000));
    expect(fromCopy).toEqual(fromOrig);
    copy.stream("Bag").next(10);
    expect(copy.stream("Bag").position).toBe(rng.stream("Bag").position + 1);
  });

  it("serialize and deserialize round-trip positions", () => {
    const rng = new Rng(5);
    rng.stream("Bag").next(3);
    rng.stream("BotTieBreak").next(3);
    rng.stream("BotTieBreak").next(3);
    const restored = Rng.deserialize(JSON.parse(JSON.stringify(rng.serialize())));
    expect(restored.serialize()).toEqual(rng.serialize());
    expect(restored.stream("Bag").next(1000)).toBe(rng.stream("Bag").next(1000));
  });

  it("next(n) stays in range and covers every value", () => {
    const s = new Rng(3).stream("Bag");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = s.next(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it("first three coins of a fresh stream reach all eight patterns across seeds", () => {
    // Guards against a linear hash that ties a fresh stream's first outputs together.
    const patterns = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const s = new Rng(seed).stream("Bag");
      patterns.add(`${s.next(2)}${s.next(2)}${s.next(2)}`);
    }
    expect(patterns.size).toBe(8);
  });

  it("rejects a non-positive n", () => {
    const s = new Rng(1).stream("Bag");
    expect(() => s.next(0)).toThrow(RangeError);
    expect(() => s.next(-1)).toThrow(RangeError);
  });

  it("shuffle is a permutation and is deterministic", () => {
    const a = new Rng(11).stream("Bag").shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Rng(11).stream("Bag").shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
