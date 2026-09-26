/**
 * An independent checker for a run's event log. It does not trust Run: it rebuilds
 * the grid, hand, score and streak from the events alone and checks every rule in
 * HANDOFF Core mechanic and EVENTS.md ordering. The fuzz tests feed it thousands of
 * logs; any mismatch between what the log says and what Run's state says is a bug.
 */

import type { GameEvent } from "../../engine/events.js";
import type { RunState } from "../../engine/run.js";
import type { ShapeSet } from "../../engine/shapes.js";

export function checkLog(events: readonly GameEvent[], final: RunState, shapes: ShapeSet, size = 8): void {
  const fail = (i: number, msg: string): never => {
    throw new Error(`event ${i} (${events[i]?.type ?? "end"}): ${msg}`);
  };
  const grid: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  let hand: (string | null)[] = [null, null, null];
  let placements = 0;
  let score = 0;
  let streak = 0;
  let continueUsed = false;
  let offered = false;
  let ended = false;
  let i = 0;
  const at = (k: number): GameEvent | undefined => events[k];
  const expectType = (k: number, type: GameEvent["type"]): GameEvent => {
    const e = at(k);
    if (!e || e.type !== type) fail(k, `expected ${type}`);
    return e as GameEvent;
  };
  const full = (): { rows: number[]; cols: number[] } => {
    const rows: number[] = [];
    const cols: number[] = [];
    for (let y = 0; y < size; y++) if (grid[y]!.every(Boolean)) rows.push(y);
    for (let x = 0; x < size; x++) if (grid.every((r) => r[x])) cols.push(x);
    return { rows, cols };
  };
  const drawn = (k: number): void => {
    const e = expectType(k, "HandDrawn") as Extract<GameEvent, { type: "HandDrawn" }>;
    if (hand.some((h) => h !== null)) fail(k, "hand drawn while shapes remain (R10)");
    for (const id of e.shapes) if (!shapes.has(id)) fail(k, `unknown shape ${id}`);
    hand = [...e.shapes];
    if (e.turn !== placements) fail(k, "turn");
  };
  /** NoFitDetected must be true and complete; returns index after the no-fit tail. */
  const noFitTail = (k: number): number => {
    const e = at(k);
    if (!e || e.type !== "NoFitDetected") {
      // No no-fit event: then something in hand must fit.
      if (!ended && hand.some((h) => h !== null) && !anyFits()) fail(k, "nothing fits but no NoFitDetected");
      return k;
    }
    if (anyFits()) fail(k, "NoFitDetected while a shape fits");
    const listed = [...e.hand].sort().join();
    const remaining = hand.filter((h): h is string => h !== null).sort().join();
    if (listed !== remaining) fail(k, `NoFitDetected hand ${listed} != remaining ${remaining}`);
    const next = at(k + 1);
    if (next?.type === "ContinueOffered") {
      if (continueUsed || offered) fail(k + 1, "second continue offered (R3)");
      offered = true;
      return k + 2;
    }
    const end = expectType(k + 1, "RunEnded") as Extract<GameEvent, { type: "RunEnded" }>;
    if (end.endedBy !== "no_fit") fail(k + 1, "endedBy");
    ended = true;
    return k + 2;
  };
  const fitsAt = (id: string, ox: number, oy: number): boolean =>
    shapes.get(id).cells.every((c) => {
      const x = ox + c.x;
      const y = oy + c.y;
      return x >= 0 && y >= 0 && x < size && y < size && !grid[y]![x];
    });
  const anyFits = (): boolean =>
    hand.some((id) => {
      if (!id) return false;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fitsAt(id, x, y)) return true;
      return false;
    });

  expectType(0, "RunStarted");
  drawn(1);
  i = noFitTail(2);

  while (i < events.length) {
    if (ended) fail(i, "event after RunEnded");
    const e = events[i]!;
    if (e.type === "PlacementRejected") {
      if (e.turn !== placements) fail(i, "turn");
      i++;
      continue;
    }
    if (e.type === "ContinueUsed") {
      if (!offered || continueUsed) fail(i, "ContinueUsed without a pending offer");
      continueUsed = true;
      offered = false;
      const expected: string[] = [];
      for (let x = 0; x < size; x++) if (grid[e.row]![x]) expected.push(`${x},${e.row}`);
      for (let y = 0; y < size; y++) if (y !== e.row && grid[y]![e.col]) expected.push(`${e.col},${y}`);
      const got = e.cells.map((c) => `${c.x},${c.y}`);
      if (got.sort().join() !== expected.sort().join()) fail(i, "ContinueUsed cells are not exactly the filled cells of that row and column");
      for (const c of e.cells) grid[c.y]![c.x] = false;
      i = noFitTail(i + 1);
      continue;
    }
    if (e.type === "RunEnded") {
      if (!offered) fail(i, "RunEnded outside a placement or offer");
      if (e.endedBy !== "declined_continue") fail(i, "endedBy");
      ended = true;
      i++;
      continue;
    }
    if (offered) fail(i, "placement while a continue is pending");

    // Placed -> LinesCleared -> ComboScored -> StreakChanged? -> (HandEmpty -> HandDrawn)? -> no-fit tail
    const p = expectType(i, "Placed") as Extract<GameEvent, { type: "Placed" }>;
    placements++;
    if (p.turn !== placements) fail(i, "Placed turn");
    if (hand[p.handIndex] !== p.shapeId) fail(i, `shape ${p.shapeId} is not in hand slot ${p.handIndex}`);
    if (!fitsAt(p.shapeId, p.origin.x, p.origin.y)) fail(i, "Placed where it does not fit");
    const cells = shapes.get(p.shapeId).cells.map((c) => `${p.origin.x + c.x},${p.origin.y + c.y}`);
    if (p.cells.map((c) => `${c.x},${c.y}`).join() !== cells.join()) fail(i, "Placed cells");
    for (const c of p.cells) grid[c.y]![c.x] = true;
    hand[p.handIndex] = null;

    const lc = expectType(i + 1, "LinesCleared") as Extract<GameEvent, { type: "LinesCleared" }>;
    const f = full();
    if (lc.rows.join() !== f.rows.join() || lc.cols.join() !== f.cols.join()) fail(i + 1, "cleared lines are not exactly the full lines (R8)");
    const clearSet = new Set<string>();
    for (const y of f.rows) for (let x = 0; x < size; x++) clearSet.add(`${x},${y}`);
    for (const x of f.cols) for (let y = 0; y < size; y++) clearSet.add(`${x},${y}`);
    if (lc.cells.length !== clearSet.size) fail(i + 1, "cleared cells not deduplicated or incomplete (R8)");
    for (const c of lc.cells) grid[c.y]![c.x] = false;
    if (lc.boxes.length) fail(i + 1, "boxes at launch (R6)");

    const cs = expectType(i + 2, "ComboScored") as Extract<GameEvent, { type: "ComboScored" }>;
    const lines = f.rows.length + f.cols.length;
    if (cs.linesCleared !== lines) fail(i + 2, "linesCleared");
    const streakAfter = lines > 0 ? streak + 1 : 0;
    if (cs.streak !== streakAfter) fail(i + 2, "streak (R9)");
    if (cs.points < p.cells.length) fail(i + 2, "points below cells placed");
    score += cs.points;
    if (cs.total !== score) fail(i + 2, "total");
    let k = i + 3;
    const sc = at(k);
    if (streakAfter !== streak) {
      if (sc?.type !== "StreakChanged" || sc.from !== streak || sc.to !== streakAfter) fail(k, "StreakChanged missing or wrong");
      k++;
    } else if (sc?.type === "StreakChanged") fail(k, "StreakChanged without a change");
    streak = streakAfter;

    if (hand.every((h) => h === null)) {
      expectType(k, "HandEmpty");
      drawn(k + 1);
      k += 2;
    } else if (at(k)?.type === "HandEmpty") fail(k, "HandEmpty with shapes left");
    for (let j = i; j < k; j++) if (events[j]!.turn !== placements) fail(j, "turn within a placement");
    i = noFitTail(k);
  }

  // The log must explain the final state exactly.
  const rows = grid.map((r) => r.map((v) => (v ? "#" : ".")).join(""));
  if (rows.join("/") !== final.grid.join("/")) fail(events.length, `grid mismatch\n${rows.join("\n")}\nvs\n${final.grid.join("\n")}`);
  if (hand.join() !== final.hand.join()) fail(events.length, "hand mismatch");
  if (score !== final.score) fail(events.length, "score mismatch");
  if (placements !== final.placements) fail(events.length, "placements mismatch");
  if (streak !== final.streak) fail(events.length, "streak mismatch");
  if (continueUsed !== final.continueUsed) fail(events.length, "continueUsed mismatch");
  const phase = ended ? "ended" : offered ? "continue_offered" : "playing";
  if (phase !== final.phase) fail(events.length, `phase ${phase} vs ${final.phase}`);
}

/** Tiny seeded PRNG for tests that must not use Math.random. */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
