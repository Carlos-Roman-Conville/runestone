import { Container, Text } from "pixi.js";
import type { GameEvent } from "../../engine/events.js";
import { LOGICAL_W } from "../layout.js";
import { PALETTE } from "../assets/tile.js";
import type { GameContext } from "../scene/types.js";
import type { ViewState } from "../view-model.js";
import { tween } from "./tween.js";

type Ev<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;

/**
 * Replay one action's events as animations, in order, then reconcile the scene with
 * the final view state. The scene is advanced step by step so each cue animates the
 * sprites it is about: placed tiles appear before they snap, cleared tiles light up
 * and pop before they disappear. Syncing the whole grid up front would remove the
 * cleared tiles before the clear cue ran (that was the first bug in this file).
 */
export async function replayEvents(ctx: GameContext, events: readonly GameEvent[], viewState: ViewState): Promise<void> {
  const hand: (string | null)[] = [...ctx.viewState.hand];
  let placedCells: readonly { x: number; y: number }[] = [];
  for (const event of events) {
    switch (event.type) {
      case "Placed":
        ctx.board.showCells(event.cells);
        hand[event.handIndex] = null;
        ctx.hand.syncHand(hand);
        placedCells = event.cells;
        await snapPlaced(ctx, event);
        break;
      case "LinesCleared":
        if (event.cells.length > 0) await clearCue(ctx, event, placedCells);
        break;
      case "ComboScored":
        ctx.hud.setScore(event.total, event.streak);
        if (event.linesCleared >= 2) void comboPop(ctx, event.combo); // decorative: does not hold the input lock
        break;
      case "HandDrawn":
        hand.splice(0, hand.length, ...event.shapes);
        ctx.hand.syncHand(hand);
        void dealHand(ctx); // decorative: the new hand can be grabbed while it slides in
        break;
      case "ContinueUsed":
        // Same cue as a line clear; the budget line is "line clear flash, blocks pop".
        if (event.cells.length > 0) await clearCue(ctx, { rows: [event.row], cols: [event.col], cells: event.cells });
        break;
      case "RunEnded":
        await gameOver(ctx, event.score);
        break;
      default:
        // StreakChanged: the HUD already took the streak from ComboScored. HandEmpty,
        // NoFitDetected, PlacementRejected: nothing to draw. Budget is six cues.
        break;
    }
  }
  ctx.applyViewState(viewState);
}

/** Lift: scale up over 80 ms while the caller moves the shape up to its carry height via onProgress. */
export async function playLift(
  ctx: GameContext,
  dragLayer: Container,
  fromScale: number,
  toScale: number,
  onProgress?: (t: number) => void,
): Promise<void> {
  ctx.sfx.play("pickup");
  dragLayer.scale.set(fromScale);
  await tween(ctx.app, 80, (t) => {
    if (dragLayer.destroyed) return; // dropped before the lift finished
    const eased = 1 - (1 - t) * (1 - t);
    dragLayer.scale.set(fromScale + (toScale - fromScale) * eased);
    onProgress?.(eased);
  });
}

/** Snap: the carried shape slides into its cells over 60 ms before the tiles pop. Part of the snap cue. */
export async function playSnapSlide(ctx: GameContext, dragLayer: Container, targetX: number, targetY: number): Promise<void> {
  const sx = dragLayer.x;
  const sy = dragLayer.y;
  await tween(ctx.app, 60, (t) => {
    if (dragLayer.destroyed) return;
    const eased = 1 - (1 - t) * (1 - t);
    dragLayer.x = Math.round(sx + (targetX - sx) * eased);
    dragLayer.y = Math.round(sy + (targetY - sy) * eased);
  });
}

export async function playReturnToSlot(ctx: GameContext, dragLayer: Container, targetX: number, targetY: number): Promise<void> {
  const sx = dragLayer.x;
  const sy = dragLayer.y;
  await tween(ctx.app, 80, (t) => {
    if (dragLayer.destroyed) return;
    dragLayer.x = sx + (targetX - sx) * t;
    dragLayer.y = sy + (targetY - sy) * t;
    dragLayer.scale.set(0.5 + (1 - 0.5) * (1 - t));
  });
}

async function snapPlaced(ctx: GameContext, event: Ev<"Placed">): Promise<void> {
  ctx.sfx.play("place");
  const sprites = event.cells.map((c) => ctx.board.getSpriteAtCell(c.x, c.y)).filter((s) => s !== undefined);
  for (const sp of sprites) sp.scale.set(1.15);
  await tween(ctx.app, 90, (t) => {
    for (const sp of sprites) sp.scale.set(1.15 + (1 - 1.15) * t);
  });
}

/**
 * Clear: the cleared tiles light for 120 ms, then pop in a ripple that spreads out from
 * the placed shape (15 ms per cell of distance, 100 ms per pop), so the clear reads as
 * caused by the drop. `from` empty means all pop together.
 */
async function clearCue(
  ctx: GameContext,
  event: Pick<Ev<"LinesCleared">, "rows" | "cols" | "cells">,
  from: readonly { x: number; y: number }[] = [],
): Promise<void> {
  ctx.sfx.play("clear", event.rows.length + event.cols.length);
  ctx.board.setCellsState(event.cells, "lit");
  await tween(ctx.app, 120, () => {});
  const dist = (c: { x: number; y: number }): number =>
    from.length === 0 ? 0 : Math.min(...from.map((f) => Math.abs(f.x - c.x) + Math.abs(f.y - c.y)));
  const items = event.cells
    .map((c) => ({ sp: ctx.board.getSpriteAtCell(c.x, c.y), delay: dist(c) * 15 }))
    .filter((i): i is { sp: NonNullable<typeof i.sp>; delay: number } => i.sp !== undefined);
  const total = 100 + Math.max(0, ...items.map((i) => i.delay));
  await tween(ctx.app, total, (t) => {
    const now = t * total;
    for (const i of items) i.sp.scale.set(1 - Math.min(1, Math.max(0, (now - i.delay) / 100)));
  });
  ctx.board.hideCells(event.cells);
}

async function comboPop(ctx: GameContext, combo: number): Promise<void> {
  ctx.sfx.play("combo");
  const label = new Text({ text: `x${combo}`, style: { fill: PALETTE.text, fontSize: 20 } });
  label.anchor.set(0.5);
  label.position.set(LOGICAL_W / 2, 140);
  label.scale.set(0);
  ctx.hud.root.addChild(label);
  await tween(ctx.app, 200, (t) => {
    const s = t < 0.5 ? t * 2 * 1.2 : 1.2 - (t - 0.5) * 2 * 0.2;
    label.scale.set(s);
  });
  await tween(ctx.app, 400, (t) => {
    label.alpha = 1 - t;
  });
  label.destroy();
}

async function dealHand(ctx: GameContext): Promise<void> {
  const slots = ctx.hand.root.children;
  // Slots rest at y = 0. Never read the current y as the base: a deal that starts while another
  // is still sliding would otherwise capture a mid-slide offset and leave the tray low for good.
  slots.forEach((s) => {
    s.y = 24;
  });
  // 40 ms stagger: slot i starts at i * 40 ms, each slides for 120 ms.
  const total = 120 + 40 * (slots.length - 1);
  await tween(ctx.app, total, (t) => {
    const now = t * total;
    slots.forEach((s, i) => {
      const local = Math.min(1, Math.max(0, (now - i * 40) / 120));
      s.y = 24 * (1 - local);
    });
  });
}

async function gameOver(ctx: GameContext, score: number): Promise<void> {
  ctx.sfx.play("gameover");
  const boardRoot = ctx.board.root;
  const startX = boardRoot.x;
  await tween(ctx.app, 300, (t) => {
    const shake = Math.sin(t * Math.PI * 8) * 6 * (1 - t);
    boardRoot.x = startX + shake;
    boardRoot.alpha = 1 - t * 0.6;
  });
  boardRoot.x = startX;
  boardRoot.alpha = 0.4;
  void score; // the overlay is shown by applyViewState from the final ViewState
}
