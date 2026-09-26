/**
 * Run: the turn. Validate a placement, place, clear, score, redraw when the hand is
 * empty, detect game over, offer and apply the one continue (R3). Every state change
 * emits exactly one event from files/EVENTS.md; the view replays them and computes
 * nothing.
 *
 * Rules implemented here: HANDOFF Core mechanic 1-7, R3, R10. Everything else is
 * delegated: fit to Placement, lines to Clearing, points to Scoring, the hand to Bag.
 */

import { drawHand, HAND_SIZE, type BagConfig } from "./bag.js";
import { clearLines, DEFAULT_CLEAR_MODE, type ClearMode } from "./clearing.js";
import type { GameEvent, RejectReason } from "./events.js";
import { Grid, type Pos } from "./grid.js";
import { anyFit, fits, place } from "./placement.js";
import { Rng, type RngState } from "./rng.js";
import { comboMultiplierAt, scorePlacement, type ScoreTable } from "./scoring.js";
import type { Shape, ShapeSet } from "./shapes.js";

export interface RunConfig {
  readonly gridSize: number;
  readonly mode: ClearMode;
  readonly bag: BagConfig;
  readonly scoring: ScoreTable;
}

export function runConfig(bag: BagConfig, scoring: ScoreTable, gridSize = 8, mode: ClearMode = DEFAULT_CLEAR_MODE): RunConfig {
  return Object.freeze({ gridSize, mode, bag, scoring });
}

export type RunPhase = "playing" | "continue_offered" | "ended";

export interface PlaceOptions {
  /** Whether a rewarded ad could be shown right now. The view asks ops/ads; the engine never does. */
  readonly continueAvailable: boolean;
}

/** Result of Run.preview: what one legal placement would do. */
export interface PlacementPreview {
  readonly points: number;
  readonly linesCleared: number;
  /** The rows and columns that would clear. */
  readonly rows: readonly number[];
  readonly cols: readonly number[];
  readonly streakAfter: number;
  /** Filled cells on the grid after placing and clearing. */
  readonly filledAfter: number;
  /** The grid after placing and clearing, as rows of '.' and '#'. */
  readonly gridAfter: readonly string[];
}

/** Read-only snapshot for the view. Arrays and the grid are copies. */
export interface RunState {
  readonly seed: number;
  readonly phase: RunPhase;
  readonly grid: readonly string[];
  readonly hand: readonly (string | null)[];
  readonly score: number;
  readonly placements: number;
  readonly streak: number;
  readonly continueUsed: boolean;
}

/** Everything needed to rebuild a Run except the shape set and config, which are data. */
export interface RunSave {
  readonly version: 1;
  readonly seed: number;
  readonly phase: RunPhase;
  readonly grid: readonly string[];
  readonly hand: readonly (string | null)[];
  readonly score: number;
  readonly placements: number;
  readonly streak: number;
  readonly continueUsed: boolean;
  readonly rng: RngState;
  readonly events: readonly GameEvent[];
}

/** Events are plain JSON; a round trip is a deep copy with no DOM or Node dependency. */
function copyEvent(e: GameEvent): GameEvent {
  return JSON.parse(JSON.stringify(e)) as GameEvent;
}

export class Run {
  private grid: Grid;
  private rng: Rng;
  private hand: (Shape | null)[];
  private score = 0;
  private placements = 0;
  private streak = 0;
  private continueUsed = false;
  private phase: RunPhase = "playing";
  private log: GameEvent[] = [];

  private constructor(
    private readonly shapes: ShapeSet,
    private readonly config: RunConfig,
    readonly seed: number,
    grid: Grid,
    rng: Rng,
    hand: (Shape | null)[],
  ) {
    this.grid = grid;
    this.rng = rng;
    this.hand = hand;
  }

  /** A fresh run: empty grid, first hand drawn. Emits RunStarted then HandDrawn. */
  static start(shapes: ShapeSet, config: RunConfig, seed: number): Run {
    const run = new Run(shapes, config, seed, Grid.empty(config.gridSize), new Rng(seed), [null, null, null]);
    run.emit({ type: "RunStarted", turn: 0, seed, gridSize: config.gridSize, mode: { boxes: config.mode.boxes } });
    run.drawNewHand();
    return run;
  }

  // ---- queries ----------------------------------------------------------------

  state(): RunState {
    return {
      seed: this.seed,
      phase: this.phase,
      grid: this.grid.toRows(),
      hand: this.hand.map((s) => (s ? s.id : null)),
      score: this.score,
      placements: this.placements,
      streak: this.streak,
      continueUsed: this.continueUsed,
    };
  }

  /** The whole log, in order. A copy. */
  events(): readonly GameEvent[] {
    return [...this.log];
  }

  /** For the ghost preview: would this placement be legal? Never mutates. */
  canPlace(handIndex: number, origin: Pos): boolean {
    if (this.phase !== "playing") return false;
    const shape = this.hand[handIndex];
    return shape !== null && shape !== undefined && fits(shape, origin, this.grid);
  }

  /**
   * What a legal placement would score, without doing it. For the bot and for any UI
   * hint. Null when the placement is illegal. Never mutates; the grid is cloned.
   */
  preview(handIndex: number, origin: Pos): PlacementPreview | null {
    if (!this.canPlace(handIndex, origin)) return null;
    const shape = this.hand[handIndex] as Shape;
    const grid = this.grid.clone();
    const cells = place(shape, origin, grid);
    const cleared = clearLines(grid, this.config.mode);
    const linesCleared = cleared.rows.length + cleared.cols.length;
    const scored = scorePlacement(cells.length, linesCleared, this.streak, this.config.scoring);
    return { points: Math.round(scored.points), linesCleared, rows: cleared.rows, cols: cleared.cols, streakAfter: scored.streakAfter, filledAfter: grid.count(), gridAfter: grid.toRows() };
  }

  /** Does hand[handIndex] fit somewhere on the board right now? For the tray to dim dead shapes. Never mutates. */
  canPlaceAnywhere(handIndex: number): boolean {
    if (this.phase !== "playing") return false;
    const shape = this.hand[handIndex];
    return shape !== null && shape !== undefined && anyFit(shape, this.grid);
  }

  /**
   * What continueRun(row, col) would do, without doing it: how many cells it would clear
   * and whether any shape left in hand would then fit somewhere. Null unless a continue
   * is on offer. The view uses it to refuse a pick that clears nothing and to warn before
   * one that frees too little, so a watched ad is not wasted by a careless tap.
   */
  previewContinue(row: number, col: number): { cleared: number; handFitsAfter: boolean } | null {
    if (this.phase !== "continue_offered" || !this.grid.inBounds(col, row)) return null;
    const grid = this.grid.clone();
    let cleared = 0;
    for (let x = 0; x < grid.size; x++) if (grid.isFilled(x, row)) { grid.clear(x, row); cleared++; }
    for (let y = 0; y < grid.size; y++) if (grid.isFilled(col, y)) { grid.clear(col, y); cleared++; }
    const handFitsAfter = this.hand.some((s) => s !== null && anyFit(s, grid));
    return { cleared, handFitsAfter };
  }

  /** True only while a ContinueOffered is pending and no continue has been used (R3). */
  canContinue(): boolean {
    return this.phase === "continue_offered" && !this.continueUsed;
  }

  // ---- actions ----------------------------------------------------------------

  /**
   * Place hand[handIndex] at origin. Returns the events of this action in the order
   * EVENTS.md guarantees. An illegal placement emits PlacementRejected and changes nothing.
   */
  place(handIndex: number, origin: Pos, options: PlaceOptions): GameEvent[] {
    if (this.phase !== "playing") throw new Error(`Run.place: run is ${this.phase}`);
    const start = this.log.length;

    const shape = this.hand[handIndex];
    const reason = this.rejectReason(shape, origin);
    if (reason || !shape) {
      this.emit({ type: "PlacementRejected", turn: this.placements, handIndex, origin, reason: reason ?? "no_such_shape" });
      return this.log.slice(start);
    }

    // Placed
    this.placements += 1;
    const turn = this.placements;
    const cells = place(shape, origin, this.grid);
    this.hand[handIndex] = null;
    this.emit({ type: "Placed", turn, handIndex, shapeId: shape.id, origin: { ...origin }, cells });

    // LinesCleared (always, even when empty)
    const cleared = clearLines(this.grid, this.config.mode);
    this.emit({ type: "LinesCleared", turn, rows: cleared.rows, cols: cleared.cols, boxes: cleared.boxes, cells: cleared.cells });

    // ComboScored (always)
    const linesCleared = cleared.rows.length + cleared.cols.length;
    const streakBefore = this.streak;
    const scored = scorePlacement(cells.length, linesCleared, streakBefore, this.config.scoring);
    // R15: points are whole numbers. The table's multipliers (1.5, 2.5) can produce halves
    // once perLine is retuned; the score, Progress and the HUD all expect integers.
    const points = Math.round(scored.points);
    this.score += points;
    this.streak = scored.streakAfter;
    const combo = linesCleared === 0 ? 0 : comboMultiplierAt(this.config.scoring, linesCleared);
    this.emit({ type: "ComboScored", turn, points, linesCleared, combo, streak: this.streak, total: this.score });

    // StreakChanged (only on change)
    if (this.streak !== streakBefore) this.emit({ type: "StreakChanged", turn, from: streakBefore, to: this.streak });

    // HandEmpty -> HandDrawn (R10: only when all three are placed)
    if (this.hand.every((s) => s === null)) {
      this.emit({ type: "HandEmpty", turn });
      this.drawNewHand();
    }

    // NoFitDetected -> ContinueOffered | RunEnded
    this.checkNoFit(options.continueAvailable);

    return this.log.slice(start);
  }

  /**
   * R3: the one rewarded-ad rescue. Clears the chosen row and column, then the same
   * hand is offered again. Only legal while a ContinueOffered is pending.
   */
  continueRun(row: number, col: number): GameEvent[] {
    if (!this.canContinue()) throw new Error(`Run.continueRun: no continue is available (phase ${this.phase}, used ${this.continueUsed})`);
    if (!this.grid.inBounds(col, row)) throw new RangeError(`Run.continueRun: row ${row}, col ${col} is outside the grid`);
    const start = this.log.length;
    const turn = this.placements;

    const cells: Pos[] = [];
    for (let x = 0; x < this.grid.size; x++) if (this.grid.isFilled(x, row)) cells.push({ x, y: row });
    for (let y = 0; y < this.grid.size; y++) if (y !== row && this.grid.isFilled(col, y)) cells.push({ x: col, y });
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const c of cells) this.grid.clear(c.x, c.y);

    this.continueUsed = true;
    this.phase = "playing";
    this.emit({ type: "ContinueUsed", turn, row, col, cells });

    // The same hand is offered again; if it still cannot fit, the run ends (no second continue).
    this.checkNoFit(false);
    return this.log.slice(start);
  }

  /** The player declined the offered continue (or the ad failed). Ends the run. */
  declineContinue(): GameEvent[] {
    if (this.phase !== "continue_offered") throw new Error(`Run.declineContinue: no continue is offered (phase ${this.phase})`);
    const start = this.log.length;
    this.end("declined_continue");
    return this.log.slice(start);
  }

  // ---- copies -----------------------------------------------------------------

  /** Deep copy. Shares no grid storage, no stream, no arrays with the original. */
  clone(): Run {
    return Run.deserialize(this.shapes, this.config, this.serialize());
  }

  serialize(): RunSave {
    return {
      version: 1,
      seed: this.seed,
      phase: this.phase,
      grid: this.grid.toRows(),
      hand: this.hand.map((s) => (s ? s.id : null)),
      score: this.score,
      placements: this.placements,
      streak: this.streak,
      continueUsed: this.continueUsed,
      rng: this.rng.serialize(),
      events: this.log.map(copyEvent),
    };
  }

  static deserialize(shapes: ShapeSet, config: RunConfig, save: RunSave): Run {
    if (save.version !== 1) throw new Error(`Run.deserialize: unsupported save version ${String(save.version)}`);
    if (save.hand.length !== HAND_SIZE) throw new Error(`Run.deserialize: hand must have ${HAND_SIZE} slots`);
    const hand = save.hand.map((id) => (id === null ? null : shapes.get(id)));
    const run = new Run(shapes, config, save.seed, Grid.fromRows(save.grid), Rng.deserialize(save.rng), hand);
    run.score = save.score;
    run.placements = save.placements;
    run.streak = save.streak;
    run.continueUsed = save.continueUsed;
    run.phase = save.phase;
    run.log = save.events.map(copyEvent);
    return run;
  }

  // ---- internals --------------------------------------------------------------

  private emit(e: GameEvent): void {
    this.log.push(e);
  }

  private rejectReason(shape: Shape | null | undefined, origin: Pos): RejectReason | null {
    if (!shape) return "no_such_shape";
    for (const c of shape.cells) if (!this.grid.inBounds(origin.x + c.x, origin.y + c.y)) return "out_of_bounds";
    return fits(shape, origin, this.grid) ? null : "occupied";
  }

  private drawNewHand(): void {
    const draw = drawHand(this.shapes, this.grid, this.rng, this.config.bag, { placements: this.placements });
    this.hand = [...draw.shapes];
    this.emit({
      type: "HandDrawn",
      turn: this.placements,
      shapes: [draw.shapes[0].id, draw.shapes[1].id, draw.shapes[2].id],
      mercy: draw.mercy,
    });
  }

  private checkNoFit(continueAvailable: boolean): void {
    const remaining = this.hand.filter((s): s is Shape => s !== null);
    if (remaining.some((s) => anyFit(s, this.grid))) return;
    this.emit({ type: "NoFitDetected", turn: this.placements, hand: remaining.map((s) => s.id) });
    if (!this.continueUsed && continueAvailable) {
      this.phase = "continue_offered";
      this.emit({ type: "ContinueOffered", turn: this.placements });
    } else {
      this.end("no_fit");
    }
  }

  private end(endedBy: "no_fit" | "declined_continue"): void {
    this.phase = "ended";
    this.emit({ type: "RunEnded", turn: this.placements, score: this.score, placements: this.placements, endedBy });
  }
}
