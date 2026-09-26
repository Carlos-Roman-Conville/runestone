/**
 * Progress: what persists between runs. High score, runs played, which daily days
 * are done, the monthly trophy, the remove-ads flag. No game logic: it never reads a
 * grid or scores anything; Run tells it what happened.
 */

import { daysOfMonth } from "./daily.js";

export interface RunSummary {
  readonly mode: "endless" | "daily";
  readonly score: number;
  readonly placements: number;
  readonly endedBy: "no_fit" | "declined_continue";
  /** Set when mode is "daily": the day this run was for. */
  readonly dailyKey?: string;
}

export interface ProgressSave {
  readonly version: 1;
  readonly highScore: number;
  readonly runsPlayed: number;
  readonly dailyDone: readonly string[];
  readonly dailyBest: Readonly<Record<string, number>>;
  readonly adsRemoved: boolean;
}

export class Progress {
  private high = 0;
  private runs = 0;
  private readonly daily = new Map<string, number>();
  private removed = false;

  get highScore(): number {
    return this.high;
  }

  get runsPlayed(): number {
    return this.runs;
  }

  get adsRemoved(): boolean {
    return this.removed;
  }

  /** Record a finished run. High score only rises. A daily run also marks its day. */
  record(run: RunSummary): void {
    if (!Number.isInteger(run.score) || run.score < 0) throw new RangeError(`Progress.record: bad score ${run.score}`);
    this.runs += 1;
    if (run.score > this.high) this.high = run.score;
    if (run.mode === "daily" && run.dailyKey) this.markDaily(run.dailyKey, run.score);
  }

  /** Mark a day as played, keeping the best score for it. */
  markDaily(key: string, score = 0): void {
    const prev = this.daily.get(key);
    this.daily.set(key, prev === undefined ? score : Math.max(prev, score));
  }

  dailyDone(key: string): boolean {
    return this.daily.has(key);
  }

  dailyBest(key: string): number | undefined {
    return this.daily.get(key);
  }

  /** Days of the month that are done, for the calendar. */
  daysDone(yyyyMm: string): string[] {
    return daysOfMonth(yyyyMm).filter((k) => this.daily.has(k));
  }

  /** The monthly trophy: every day of the month played. */
  monthComplete(yyyyMm: string): boolean {
    return daysOfMonth(yyyyMm).every((k) => this.daily.has(k));
  }

  setAdsRemoved(removed: boolean): void {
    this.removed = removed;
  }

  /**
   * Fold in progress saved by another copy of the game (a second browser tab sharing the
   * same storage). Nothing earned is ever lost: best and run count take the larger,
   * days played are the union with the better score, and a purchase stays purchased.
   */
  merge(other: Progress): void {
    this.high = Math.max(this.high, other.high);
    this.runs = Math.max(this.runs, other.runs);
    for (const [key, best] of other.daily) {
      const mine = this.daily.get(key);
      this.daily.set(key, mine === undefined ? best : Math.max(mine, best));
    }
    this.removed = this.removed || other.removed;
  }

  serialize(): ProgressSave {
    const keys = [...this.daily.keys()].sort();
    const dailyBest: Record<string, number> = {};
    for (const k of keys) dailyBest[k] = this.daily.get(k) as number;
    return { version: 1, highScore: this.high, runsPlayed: this.runs, dailyDone: keys, dailyBest, adsRemoved: this.removed };
  }

  /** Tolerant: a missing or malformed field falls back to empty, so a bad save never bricks the app. */
  static deserialize(raw: unknown): Progress {
    const p = new Progress();
    if (typeof raw !== "object" || raw === null) return p;
    const o = raw as Record<string, unknown>;
    if (Number.isInteger(o["highScore"]) && (o["highScore"] as number) >= 0) p.high = o["highScore"] as number;
    if (Number.isInteger(o["runsPlayed"]) && (o["runsPlayed"] as number) >= 0) p.runs = o["runsPlayed"] as number;
    if (Array.isArray(o["dailyDone"])) for (const k of o["dailyDone"]) if (typeof k === "string") p.daily.set(k, 0);
    const best = o["dailyBest"];
    if (typeof best === "object" && best !== null) {
      for (const [k, v] of Object.entries(best as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) p.daily.set(k, v);
      }
    }
    if (typeof o["adsRemoved"] === "boolean") p.removed = o["adsRemoved"];
    return p;
  }
}
