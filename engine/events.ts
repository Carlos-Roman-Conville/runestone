/**
 * The event log: every state change in engine/ emits exactly one of these. The view
 * animates them and the golden fixtures assert on them. Names and fields are owned by
 * files/EVENTS.md; this file only types them.
 */

import type { Pos } from "./grid.js";

export type RejectReason = "out_of_bounds" | "occupied" | "no_such_shape";
export type EndReason = "no_fit" | "declined_continue";

interface Base {
  /** Placement count so far. */
  readonly turn: number;
}

export interface RunStarted extends Base {
  readonly type: "RunStarted";
  readonly seed: number;
  readonly gridSize: number;
  readonly mode: { readonly boxes: boolean };
}

export interface HandDrawn extends Base {
  readonly type: "HandDrawn";
  readonly shapes: readonly [string, string, string];
  readonly mercy: boolean;
}

export interface PlacementRejected extends Base {
  readonly type: "PlacementRejected";
  readonly handIndex: number;
  readonly origin: Pos;
  readonly reason: RejectReason;
}

export interface Placed extends Base {
  readonly type: "Placed";
  readonly handIndex: number;
  readonly shapeId: string;
  readonly origin: Pos;
  readonly cells: readonly Pos[];
}

export interface LinesCleared extends Base {
  readonly type: "LinesCleared";
  readonly rows: readonly number[];
  readonly cols: readonly number[];
  readonly boxes: readonly Pos[];
  readonly cells: readonly Pos[];
}

export interface ComboScored extends Base {
  readonly type: "ComboScored";
  readonly points: number;
  readonly linesCleared: number;
  /** The combo multiplier applied (0 when nothing cleared). */
  readonly combo: number;
  /** The streak after this placement. */
  readonly streak: number;
  readonly total: number;
}

export interface StreakChanged extends Base {
  readonly type: "StreakChanged";
  readonly from: number;
  readonly to: number;
}

export interface HandEmpty extends Base {
  readonly type: "HandEmpty";
}

export interface NoFitDetected extends Base {
  readonly type: "NoFitDetected";
  readonly hand: readonly string[];
}

export interface ContinueOffered extends Base {
  readonly type: "ContinueOffered";
}

export interface ContinueUsed extends Base {
  readonly type: "ContinueUsed";
  readonly row: number;
  readonly col: number;
  readonly cells: readonly Pos[];
}

export interface RunEnded extends Base {
  readonly type: "RunEnded";
  readonly score: number;
  readonly placements: number;
  readonly endedBy: EndReason;
}

export type GameEvent =
  | RunStarted
  | HandDrawn
  | PlacementRejected
  | Placed
  | LinesCleared
  | ComboScored
  | StreakChanged
  | HandEmpty
  | NoFitDetected
  | ContinueOffered
  | ContinueUsed
  | RunEnded;

export type EventType = GameEvent["type"];
