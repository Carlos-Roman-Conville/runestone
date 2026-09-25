import type { Application } from "pixi.js";
import type { ShapeSet } from "../../engine/index.js";
import type { Session } from "../session.js";
import type { ViewState } from "../view-model.js";
import type { Sfx } from "../sfx.js";
import type { BoardView } from "./board.js";
import type { HandView } from "./hand.js";
import type { HudView } from "./hud.js";

export interface GameContext {
  app: Application;
  /** The run lives in the session; `session.run` is replaced on every new run. */
  session: Session;
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
}
