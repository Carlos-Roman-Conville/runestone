import { Container, Text } from "pixi.js";
import type { GameEvent } from "../../engine/events.js";
import { LOGICAL_W } from "../layout.js";
import { PALETTE } from "../assets/tile.js";
import type { GameContext } from "../scene/types.js";
import type { ViewState } from "../view-model.js";
import { tween } from "./tween.js";

export async function replayEvents(ctx: GameContext, events: readonly GameEvent[], viewState: ViewState): Promise<void> {
  ctx.applyViewState(viewState);
  for (const event of events) {
    switch (event.type) {
      case "Placed":
        await snapPlaced(ctx, event);
        break;
      case "LinesCleared":
        if (event.cells.length > 0) await clearLines(ctx, event, viewState);
        break;
      case "ComboScored":
        if (event.linesCleared >= 2) await comboPop(ctx, event.combo);
        break;
      case "StreakChanged":
        ctx.hud.setScore(ctx.viewState.score, event.to);
        break;
      case "HandDrawn":
        await dealHand(ctx);
        break;
      case "RunEnded":
        await gameOver(ctx, event.score);
        break;
      default:
        break;
    }
  }
}

export async function playLift(ctx: GameContext, dragLayer: Container, fromScale: number, toScale: number): Promise<void> {
  ctx.sfx.play("pickup");
  dragLayer.scale.set(fromScale);
  await tween(ctx.app, 80, (t) => dragLayer.scale.set(fromScale + (toScale - fromScale) * t));
}

export async function playReturnToSlot(ctx: GameContext, dragLayer: Container, targetX: number, targetY: number): Promise<void> {
  const sx = dragLayer.x;
  const sy = dragLayer.y;
  await tween(ctx.app, 80, (t) => {
    dragLayer.x = sx + (targetX - sx) * t;
    dragLayer.y = sy + (targetY - sy) * t;
    dragLayer.scale.set(0.5 + (1 - 0.5) * (1 - t));
  });
}

async function snapPlaced(ctx: GameContext, event: Extract<GameEvent, { type: "Placed" }>): Promise<void> {
  ctx.sfx.play("place");
  for (const cell of event.cells) {
    const sp = ctx.board.getSpriteAtCell(cell.x, cell.y);
    if (!sp) continue;
    sp.scale.set(1.15);
    await tween(ctx.app, 90, (t) => sp.scale.set(1.15 + (1 - 1.15) * t));
  }
}

async function clearLines(
  ctx: GameContext,
  event: Extract<GameEvent, { type: "LinesCleared" }>,
  viewState: ViewState,
): Promise<void> {
  ctx.sfx.play("clear", event.rows.length + event.cols.length);
  ctx.board.setCellsState(event.cells, "lit");
  await tween(ctx.app, 120, () => {});
  for (const cell of event.cells) {
    const sp = ctx.board.getSpriteAtCell(cell.x, cell.y);
    if (!sp) continue;
    await tween(ctx.app, 100, (t) => sp.scale.set(1 - t));
  }
  ctx.board.syncGrid(viewState.grid);
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
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) continue;
    const baseY = slot.y;
    slot.y = baseY + 24;
    await tween(ctx.app, 120, (t) => {
      slot.y = baseY + 24 * (1 - t);
    });
    if (i < slots.length - 1) await tween(ctx.app, 40, () => {});
  }
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
  ctx.hud.showGameOver(score, ctx.onNewRun);
}
