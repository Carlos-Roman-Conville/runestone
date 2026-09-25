import { Container, FederatedPointerEvent, Rectangle, Sprite, Texture } from "pixi.js";
import type { Pos } from "../../engine/grid.js";
import type { Shape, ShapeSet } from "../../engine/shapes.js";
import { CELL_PX, HAND_X0, HAND_Y, SLOT_GAP, SLOT_W } from "../layout.js";

export type HandPickHandler = (handIndex: number, e: FederatedPointerEvent) => void;

export class HandView {
  readonly root = new Container();
  private readonly slots: Container[] = [];
  private handIds: (string | null)[] = [null, null, null];

  constructor(
    private readonly shapes: ShapeSet,
    private readonly restingTexture: Texture,
    private readonly onPick: HandPickHandler,
  ) {
    this.root.position.set(0, HAND_Y);
    for (let i = 0; i < 3; i++) {
      const slot = new Container();
      slot.position.set(HAND_X0 + i * (SLOT_W + SLOT_GAP), 0);
      slot.eventMode = "static";
      slot.cursor = "pointer";
      slot.hitArea = new Rectangle(0, 0, SLOT_W, SLOT_W);
      const idx = i;
      slot.on("pointerdown", (e: FederatedPointerEvent) => {
        if (!this.handIds[idx]) return;
        this.onPick(idx, e);
      });
      this.root.addChild(slot);
      this.slots.push(slot);
    }
  }

  syncHand(hand: readonly (string | null)[]): void {
    this.handIds = [...hand];
    this.slots.forEach((slot, i) => {
      slot.removeChildren();
      const id = hand[i];
      if (!id) return;
      const shape = this.shapes.get(id);
      const g = this.makeShapeGraphic(shape, 0.5);
      const bounds = shapeBounds(shape);
      g.position.set(Math.round((SLOT_W - bounds.w * 12) / 2), Math.round((SLOT_W - bounds.h * 12) / 2));
      slot.addChild(g);
    });
  }

  /** Dim slots whose shape cannot be placed anywhere (the session asks run.canPlaceAnywhere). */
  setPlaceable(flags: readonly boolean[]): void {
    this.slots.forEach((slot, i) => {
      slot.alpha = this.handIds[i] && flags[i] === false ? 0.35 : 1;
    });
  }

  slotCenter(handIndex: number): { x: number; y: number } {
    const slot = this.slots[handIndex];
    if (!slot) return { x: HAND_X0, y: HAND_Y };
    return {
      x: this.root.x + slot.x + SLOT_W / 2,
      y: this.root.y + slot.y + SLOT_W / 2,
    };
  }

  makeDragShape(shape: Shape, scale: number): Container {
    return this.makeShapeGraphic(shape, scale);
  }

  private makeShapeGraphic(shape: Shape, scale: number): Container {
    const c = new Container();
    const px = CELL_PX * scale;
    for (const cell of shape.cells) {
      const sp = new Sprite(this.restingTexture);
      sp.roundPixels = true;
      sp.scale.set(scale);
      sp.position.set(cell.x * px, cell.y * px);
      c.addChild(sp);
    }
    return c;
  }
}

function shapeBounds(shape: Shape): { w: number; h: number } {
  let maxX = 0;
  let maxY = 0;
  for (const c of shape.cells) {
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  return { w: maxX + 1, h: maxY + 1 };
}
