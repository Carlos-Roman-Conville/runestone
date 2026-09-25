/**
 * Rng: named, seeded random streams.
 *
 * Every random consumer in the engine names its stream. Two streams never share a
 * sequence, the same seed always gives the same sequence, and clone() copies stream
 * positions so a cloned state continues identically.
 *
 * Generator: lowbias32 over (streamSeed + position * golden ratio). Stateless by
 * position, so a stream's state is just an integer counter.
 */

export const STREAM_NAMES = ["Bag", "Mercy", "BotTieBreak"] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

const GOLDEN = 0x9e3779b9;

function lowbias32(x: number): number {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Stream {
  constructor(
    readonly name: StreamName,
    private readonly streamSeed: number,
    private pos: number,
  ) {}

  /** Current position; the stream's entire state. */
  get position(): number {
    return this.pos;
  }

  /** Raw 32-bit value for the next position. */
  nextU32(): number {
    this.pos += 1;
    return lowbias32((this.streamSeed + Math.imul(this.pos, GOLDEN)) >>> 0);
  }

  /** Integer in [0, n). n must be a positive integer. */
  next(n: number): number {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`Rng.next: n must be a positive integer, got ${n}`);
    return this.nextU32() % n;
  }

  /** Float in [0, 1). */
  nextFloat(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  /** In-place Fisher-Yates shuffle. */
  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.next(i + 1);
      const a = list[i] as T;
      list[i] = list[j] as T;
      list[j] = a;
    }
    return list;
  }

  clone(): Stream {
    return new Stream(this.name, this.streamSeed, this.pos);
  }
}

export interface RngState {
  seed: number;
  positions: Partial<Record<StreamName, number>>;
}

export class Rng {
  private readonly streams = new Map<StreamName, Stream>();

  constructor(
    readonly seed: number,
    positions: Partial<Record<StreamName, number>> = {},
  ) {
    for (const name of STREAM_NAMES) {
      const streamSeed = lowbias32((seed ^ hashString(name)) >>> 0);
      this.streams.set(name, new Stream(name, streamSeed, positions[name] ?? 0));
    }
  }

  stream(name: StreamName): Stream {
    const s = this.streams.get(name);
    if (!s) throw new Error(`Rng: unknown stream "${name}"`);
    return s;
  }

  /** Deep copy: the clone continues from the same positions, the original is untouched. */
  clone(): Rng {
    return new Rng(this.seed, this.serialize().positions);
  }

  serialize(): RngState {
    const positions: Partial<Record<StreamName, number>> = {};
    for (const [name, s] of this.streams) positions[name] = s.position;
    return { seed: this.seed, positions };
  }

  static deserialize(state: RngState): Rng {
    return new Rng(state.seed, state.positions);
  }
}
