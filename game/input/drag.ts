import { Container, type FederatedPointerEvent, Rectangle } from "pixi.js";
import type { Pos } from "../../engine/grid.js";
import type { Shape } from "../../engine/shapes.js";
import { playLift, playReturnToSlot } from "../anim/index.js";
import { DRAG_LIFT_PX, LOGICAL_H, LOGICAL_W } from "../layout.js";
import type { GameContext } from "../scene/types.js";

interface ActiveDrag {
  handIndex: number;
  shape: Shape;
  graphic: Container;
  pointerId: number;
  lastOrigin: Pos | null;
  legal: boolean;
}

/**
 * Lift a shape from the tray, follow the pointer 32 px above the finger, show the
 * ghost where it would land, and hand a legal drop to the session. Legality is
 * always run.canPlace(); this file decides nothing.
 */
export class DragController {
  private readonly dragLayer = new Container();
  private active: ActiveDrag | null = null;

  constructor(private readonly ctx: GameContext) {
    ctx.app.stage.addChild(this.dragLayer);
    ctx.app.stage.eventMode = "static";
    ctx.app.stage.hitArea = new Rectangle(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.app.stage.on("pointermove", (e) => this.onMove(e));
    ctx.app.stage.on("pointerup", (e) => void this.onUp(e));
    ctx.app.stage.on("pointerupoutside", (e) => void this.onUp(e));
  }

  bindHandPick(handIndex: number, e: FederatedPointerEvent): void {
    if (this.ctx.inputLocked || this.active) return;
    const run = this.ctx.session.run;
    if (run.state().phase !== "playing") return;
    const id = run.state().hand[handIndex];
    if (!id) return;
    const shape = this.ctx.shapes.get(id);
    const graphic = this.ctx.hand.makeDragShape(shape, 1);
    const stage = this.toStage(e.global);
    graphic.position.set(Math.round(stage.x), Math.round(stage.y - DRAG_LIFT_PX));
    this.dragLayer.addChild(graphic);
    this.active = { handIndex, shape, graphic, pointerId: e.pointerId, lastOrigin: null, legal: false };
    void playLift(this.ctx, graphic, 0.5, 1);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.active || this.ctx.inputLocked) return;
    if (this.active.pointerId >= 0 && e.pointerId !== this.active.pointerId) return;
    const stage = this.toStage(e.global);
    this.active.graphic.position.set(Math.round(stage.x), Math.round(stage.y - DRAG_LIFT_PX));
    const origin = this.ctx.board.originFromStage(stage.x, stage.y - DRAG_LIFT_PX);
    const legal = this.ctx.session.run.canPlace(this.active.handIndex, origin);
    this.active.lastOrigin = origin;
    this.active.legal = legal;
    this.ctx.board.setGhost(legal ? this.active.shape : null, legal ? origin : null);
  }

  private async onUp(e: FederatedPointerEvent): Promise<void> {
    if (!this.active) return;
    if (this.active.pointerId >= 0 && e.pointerId !== this.active.pointerId) return;
    const { handIndex, graphic, lastOrigin, legal } = this.active;
    this.active = null;
    this.ctx.board.setGhost(null, null);

    if (legal && lastOrigin && !this.ctx.inputLocked) {
      graphic.destroy();
      await this.ctx.session.drop(handIndex, lastOrigin);
      return;
    }

    const slot = this.ctx.hand.slotCenter(handIndex);
    await playReturnToSlot(this.ctx, graphic, slot.x, slot.y);
    graphic.destroy();
  }

  private toStage(global: { x: number; y: number }): { x: number; y: number } {
    const s = this.ctx.stageScale;
    return { x: global.x / s, y: global.y / s };
  }
}
