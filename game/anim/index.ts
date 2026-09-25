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
  for (const event of events) {
    switch (event.type) {
      case "Placed":
        ctx.board.showCells(event.cells);
        hand[event.handIndex] = null;
        ctx.hand.syncHand(hand);
        await snapPlaced(ctx, event);
        break;
      case "LinesCleared":
        if (event.cells.length > 0) await clearCue(ctx, event);
        break;
      case "ComboScored":
        ctx.hud.setScore(event.total, event.streak);
        if (event.linesCleared >= 2) await comboPop(ctx, event.combo);
        break;
      case "HandDrawn":
        hand.splice(0, hand.length, ...event.shapes);
        ctx.hand.syncHand(hand);
        await dealHand(ctx);
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

export async function playLift(ctx: GameContext, dragLayer: Container, fromScale: number, toScale: number): Promise<void> {
  ctx.sfx.play("pickup");
  dragLayer.scale.set(fromScale);
  await tween(ctx.app, 80, (t) => {
    if (dragLayer.destroyed) return; // dropped before the lift finished
    dragLayer.scale.set(fromScale + (toScale - fromScale) * t);
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

async function clearCue(ctx: GameContext, event: Pick<Ev<"LinesCleared">, "rows" | "cols" | "cells">): Promise<void> {
  ctx.sfx.play("clear", event.rows.length + event.cols.length);
  ctx.board.setCellsState(event.cells, "lit");
  await tween(ctx.app, 120, () => {});
  const sprites = event.cells.map((c) => ctx.board.getSpriteAtCell(c.x, c.y)).filter((s) => s !== undefined);
  await tween(ctx.app, 100, (t) => {
    for (const sp of sprites) sp.scale.set(1 - t);
  });
  ctx.board.hideCells(event.cells);
}

async function comboPop(ctx: GameContext, combo: number): Promise<void> {
  ctx.sfx.play("combo");
  const label = new Text({ text: `x${combo}`, style: { fill: PALETTE.text, fontSize: 20 } });
  label.anchor.set(0.5);
  label.position.set(LOGICAL_W / 2, 140);
  label.scale.set(0);
  ctx.app.stage.addChild(label);
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
  const bases = slots.map((s) => s.y);
  slots.forEach((s, i) => {
    s.y = (bases[i] ?? 0) + 24;
  });
  // 40 ms stagger: slot i starts at i * 40 ms, each slides for 120 ms.
  const total = 120 + 40 * (slots.length - 1);
  await tween(ctx.app, total, (t) => {
    const now = t * total;
    slots.forEach((s, i) => {
      const local = Math.min(1, Math.max(0, (now - i * 40) / 120));
      s.y = (bases[i] ?? 0) + 24 * (1 - local);
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
