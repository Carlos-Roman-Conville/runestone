import type { Application } from "pixi.js";
import type { Run, ShapeSet } from "../../engine/index.js";
import type { ViewState } from "../view-model.js";
import type { Sfx } from "../sfx.js";
import type { BoardView } from "./board.js";
import type { HandView } from "./hand.js";
import type { HudView } from "./hud.js";

export interface GameContext {
  app: Application;
  run: Run;
  shapes: ShapeSet;
  board: BoardView;
  hand: HandView;
  hud: HudView;
  sfx: Sfx;
  viewState: ViewState;
  inputLocked: boolean;
  stageScale: number;
  applyViewState(next: ViewState): void;
  setInputLocked(locked: boolean): void;
  onNewRun: () => void;
}
