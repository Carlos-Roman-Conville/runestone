import type { GameEvent } from "../engine/events.js";
import type { Pos } from "../engine/grid.js";
import type { RunState } from "../engine/run.js";

export interface LastPlacementView {
  readonly cells: readonly Pos[];
  readonly cleared: readonly Pos[];
  readonly rows: readonly number[];
  readonly cols: readonly number[];
  readonly points: number;
  readonly linesCleared: number;
  readonly combo: number;
}

export interface ViewState {
  readonly grid: readonly string[];
  readonly hand: readonly (string | null)[];
  readonly score: number;
  readonly streak: number;
  readonly phase: "playing" | "ended";
  readonly lastPlacement: LastPlacementView | null;
}

/** Maps post-action run state plus that action's events into drawable view state. */
export function reduce(state: RunState, events: readonly GameEvent[]): ViewState {
  const phase: ViewState["phase"] = state.phase === "ended" ? "ended" : "playing";

  if (events.some((e) => e.type === "PlacementRejected")) {
    return {
      grid: state.grid,
      hand: state.hand,
      score: state.score,
      streak: state.streak,
      phase,
      lastPlacement: null,
    };
  }

  const placed = events.find((e): e is Extract<GameEvent, { type: "Placed" }> => e.type === "Placed");
  const lines = events.find((e): e is Extract<GameEvent, { type: "LinesCleared" }> => e.type === "LinesCleared");
  const scored = events.find((e): e is Extract<GameEvent, { type: "ComboScored" }> => e.type === "ComboScored");

  let lastPlacement: LastPlacementView | null = null;
  if (placed && scored) {
    lastPlacement = {
      cells: placed.cells,
      cleared: lines?.cells ?? [],
      rows: lines?.rows ?? [],
      cols: lines?.cols ?? [],
      points: scored.points,
      linesCleared: scored.linesCleared,
      combo: scored.combo,
    };
  }

  return {
    grid: state.grid,
    hand: state.hand,
    score: state.score,
    streak: state.streak,
    phase,
    lastPlacement,
  };
}
