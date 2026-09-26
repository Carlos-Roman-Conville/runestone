import { Container, type FederatedPointerEvent, Rectangle } from "pixi.js";
import type { Pos } from "../../engine/grid.js";
import type { Shape } from "../../engine/shapes.js";
import { playLift, playReturnToSlot, playSnapSlide } from "../anim/index.js";
import { BOARD_X, BOARD_Y, CELL_PX, DRAG_LIFT_PX, LOGICAL_H, LOGICAL_W } from "../layout.js";
import type { GameContext } from "../scene/types.js";

interface ActiveDrag {
  handIndex: number;
  shape: Shape;
  /** Shape size in cells. */
  w: number;
  h: number;
  graphic: Container;
  pointerId: number;
  /** Pointer in stage units, updated every move. */
  pointer: { x: number; y: number };
  /** 0 at pick-up, 1 once fully lifted; the lift tween drives it. */
  lift: number;
  lastOrigin: Pos | null;
  legal: boolean;
}

/**
 * Lift a shape from the tray, carry it centered above the finger, show the ghost and
 * the lines it would complete, and hand a legal drop to the session after sliding the
 * shape into its cells. Legality and the line preview both come from run.preview();
 * this file decides nothing.
 */
export class DragController {
  private readonly dragLayer = new Container();
  private active: ActiveDrag | null = null;
  /** A shape touched while a clear was animating; lifted when the lock ends if still held. */
  private pending: { handIndex: number; pointerId: number; global: { x: number; y: number } } | null = null;

  constructor(private readonly ctx: GameContext) {
    ctx.app.stage.addChild(this.dragLayer);
    ctx.app.stage.eventMode = "static";
    ctx.app.stage.hitArea = new Rectangle(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.app.stage.on("pointermove", (e) => this.onMove(e));
    ctx.app.stage.on("pointerup", (e) => void this.onUp(e));
    ctx.app.stage.on("pointerupoutside", (e) => void this.onUp(e));
    const cancel = (): void => void this.cancel();
    globalThis.addEventListener("pointercancel", cancel);
    globalThis.addEventListener("blur", cancel);
    globalThis.document?.addEventListener("visibilitychange", () => {
      if (globalThis.document.visibilityState === "hidden") cancel();
    });
  }

  /** Abandon the drag: nothing is placed, the shape goes back to its slot. */
  private async cancel(): Promise<void> {
    this.pending = null;
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.ctx.board.setGhost(null, null);
    this.ctx.board.setLinePreview([], []);
    const slot = this.ctx.hand.slotCenter(a.handIndex);
    await playReturnToSlot(this.ctx, a.graphic, slot.x - (a.w * CELL_PX) / 4, slot.y - (a.h * CELL_PX) / 4);
    a.graphic.destroy();
    this.ctx.hand.setLifted(a.handIndex, false);
  }

  bindHandPick(handIndex: number, e: FederatedPointerEvent): void {
    if (this.active) return;
    if (this.ctx.inputLocked) {
      this.pending = { handIndex, pointerId: e.pointerId, global: { x: e.global.x, y: e.global.y } };
      return;
    }
    this.startDrag(handIndex, e.pointerId, e.global);
  }

  /** Called when the input lock lifts: a grab made during the animation starts now. */
  resumePending(): void {
    const p = this.pending;
    this.pending = null;
    if (p && !this.active && !this.ctx.inputLocked) this.startDrag(p.handIndex, p.pointerId, p.global);
  }

  private startDrag(handIndex: number, pointerId: number, global: { x: number; y: number }): void {
    const run = this.ctx.session.run;
    if (run.state().phase !== "playing") return;
    const id = run.state().hand[handIndex];
    if (!id) return;
    const shape = this.ctx.shapes.get(id);
    const graphic = this.ctx.hand.makeDragShape(shape, 1);
    const bounds = shapeSize(shape);
    const slot = this.ctx.hand.slotCenter(handIndex);
    const pointer = this.toStage(global);
    const active: ActiveDrag = {
      handIndex,
      shape,
      w: bounds.w,
      h: bounds.h,
      graphic,
      pointerId,
      pointer,
      lift: 0,
      lastOrigin: null,
      legal: false,
    };
    this.active = active;
    this.ctx.hand.setLifted(handIndex, true);
    this.dragLayer.addChild(graphic);
    // Start where the shape sits in the tray so the lift is continuous, not a jump.
    graphic.position.set(Math.round(slot.x - (bounds.w * CELL_PX) / 4), Math.round(slot.y - (bounds.h * CELL_PX) / 4));
    void playLift(this.ctx, graphic, 0.5, 1, (t) => {
      if (this.active !== active) return;
      active.lift = t;
      this.placeGraphic(active);
    });
  }

  private onMove(e: FederatedPointerEvent): void {
    if (this.pending && e.pointerId === this.pending.pointerId) this.pending.global = { x: e.global.x, y: e.global.y };
    const a = this.active;
    if (!a || this.ctx.inputLocked) return;
    if (a.pointerId >= 0 && e.pointerId !== a.pointerId) return;
    a.pointer = this.toStage(e.global);
    this.placeGraphic(a);
    this.updatePreview(a);
  }

  /** The shape's top-left, in stage units, for the current pointer at the given lift (default: current). */
  private shapeTopLeft(a: ActiveDrag, lift = a.lift): { x: number; y: number } {
    return {
      x: a.pointer.x - (a.w * CELL_PX) / 2,
      y: a.pointer.y - (a.h * CELL_PX) / 2 - DRAG_LIFT_PX * lift,
    };
  }

  private placeGraphic(a: ActiveDrag): void {
    const tl = this.shapeTopLeft(a);
    a.graphic.position.set(Math.round(tl.x), Math.round(tl.y));
  }

  /** The landing spot is always judged at full carry height, so a flick faster than the lift still lands. */
  private updatePreview(a: ActiveDrag): void {
    const tl = this.shapeTopLeft(a, 1);
    const origin = this.ctx.board.originFromStage(tl.x, tl.y);
    const preview = this.ctx.session.run.preview(a.handIndex, origin);
    a.lastOrigin = origin;
    a.legal = preview !== null;
    this.ctx.board.setGhost(preview ? a.shape : null, preview ? origin : null, preview !== null && preview.linesCleared > 0);
    this.ctx.board.setLinePreview(preview ? preview.rows : [], preview ? preview.cols : []);
  }

  private async onUp(e: FederatedPointerEvent): Promise<void> {
    if (this.pending && e.pointerId === this.pending.pointerId) this.pending = null; // released before the lock lifted
    const a = this.active;
    if (!a) return;
    if (a.pointerId >= 0 && e.pointerId !== a.pointerId) return;
    a.pointer = this.toStage(e.global);
    this.updatePreview(a);
    this.active = null;
    this.ctx.board.setGhost(null, null);
    this.ctx.board.setLinePreview([], []);

    if (a.legal && a.lastOrigin && !this.ctx.inputLocked) {
      const target = { x: BOARD_X + a.lastOrigin.x * CELL_PX, y: BOARD_Y + a.lastOrigin.y * CELL_PX };
      this.ctx.setInputLocked(true);
      await playSnapSlide(this.ctx, a.graphic, target.x, target.y);
      this.ctx.setInputLocked(false);
      a.graphic.destroy();
      await this.ctx.session.drop(a.handIndex, a.lastOrigin);
      return;
    }

    const slot = this.ctx.hand.slotCenter(a.handIndex);
    await playReturnToSlot(this.ctx, a.graphic, slot.x - (a.w * CELL_PX) / 4, slot.y - (a.h * CELL_PX) / 4);
    a.graphic.destroy();
    this.ctx.hand.setLifted(a.handIndex, false);
  }

  private toStage(global: { x: number; y: number }): { x: number; y: number } {
    const s = this.ctx.stageScale;
    return { x: global.x / s, y: global.y / s };
  }
}

function shapeSize(shape: Shape): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const c of shape.cells) {
    if (c.x + 1 > w) w = c.x + 1;
    if (c.y + 1 > h) h = c.y + 1;
  }
  return { w, h };
}
