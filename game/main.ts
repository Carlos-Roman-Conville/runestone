import { Capacitor } from "@capacitor/core";
import { Application, Container, TextureSource } from "pixi.js";
import bagJson from "../data/bag.json";
import scoringJson from "../data/scoring.json";
import shapesJson from "../data/shapes.json";
import { loadBagConfig, loadScoreTable, loadShapes, runConfig, type GameEvent } from "../engine/index.js";
import type { Pos } from "../engine/grid.js";
import type { Ops } from "../ops/index.js";
import { fakeOps } from "../ops/fake/index.js";
import { AdMobAds } from "../ops/real/admob.js";
import { LocalStorageSave } from "../ops/real/localSave.js";
import { replayEvents } from "./anim/index.js";
import { createTileTextures } from "./assets/tile.js";
import { DragController } from "./input/drag.js";
import { LOGICAL_H, LOGICAL_W } from "./layout.js";
import { BoardView } from "./scene/board.js";
import { HandView } from "./scene/hand.js";
import { HudView } from "./scene/hud.js";
import type { GameContext } from "./scene/types.js";
import { Session, type SessionStatus, type SessionView } from "./session.js";
import { noopSfx } from "./sfx.js";
import { reduce, type ViewState } from "./view-model.js";

TextureSource.defaultOptions.scaleMode = "nearest";

/**
 * Ops (R16): save is real on both platforms from step 6; ads are real on the phone.
 * IAP and analytics stay on fakes until step 7 (UMP consent, real analytics).
 */
function createOps(): Ops {
  const ops: Ops = { ...fakeOps(), save: new LocalStorageSave() };
  if (Capacitor.isNativePlatform()) return { ...ops, ads: new AdMobAds() };
  return ops;
}

async function main(): Promise<void> {
  const mount = document.getElementById("game");
  if (!mount) throw new Error("Runestone: missing #game mount");

  const ops = createOps();
  const shapes = loadShapes(shapesJson);
  const config = runConfig(loadBagConfig(bagJson), loadScoreTable(scoringJson));

  const app = new Application();
  await app.init({
    width: LOGICAL_W,
    height: LOGICAL_H,
    background: "#1a1816",
    antialias: false,
    resolution: 1,
    autoDensity: true,
  });
  mount.appendChild(app.canvas);

  const textures = createTileTextures(app);
  const world = new Container();
  app.stage.addChild(world);

  const board = new BoardView(textures);
  const hud = new HudView(app);
  world.addChild(board.root, hud.root);

  // The session is the scene's only way to change the run. It calls back through SessionView.
  const sessionView: SessionView = {
    async replay(events: readonly GameEvent[], view: ViewState) {
      ctx.setInputLocked(true);
      try {
        await replayEvents(ctx, events, view);
      } finally {
        ctx.setInputLocked(false);
      }
    },
    offerContinue: () => hud.offerContinue(),
    async pickContinueCell(): Promise<Pos> {
      hud.showHint("Tap a cell to clear its row and column");
      try {
        return await board.pickCell(() => hud.showHint("Tap it again to clear"));
      } finally {
        hud.showHint(null);
      }
    },
    setStatus: (status: SessionStatus) => hud.setStatus(status),
  };

  const session = new Session({
    shapes,
    config,
    ops,
    view: sessionView,
    now: () => new Date(),
    randomSeed: () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, // view-side seed choice only; the engine never calls Math.random
  });

  const ctx: GameContext = {
    app,
    session,
    shapes,
    board,
    hand: null as unknown as HandView,
    hud,
    sfx: noopSfx(),
    viewState: reduce(session.run.state(), []),
    inputLocked: false,
    stageScale: 1,
    applyViewState(next) {
      ctx.viewState = next;
      board.syncGrid(next.grid);
      ctx.hand.syncHand(next.hand);
      ctx.hand.setPlaceable(next.hand.map((_, i) => session.run.canPlaceAnywhere(i)));
      hud.setScore(next.score, next.streak, false);
      if (next.phase === "ended") {
        board.root.alpha = 0.4;
        hud.showGameOver(next.score, () => void startEndless());
      } else {
        board.root.alpha = 1;
        hud.hideGameOver();
      }
    },
    setInputLocked(locked) {
      ctx.inputLocked = locked;
    },
  };

  let drag!: DragController;
  const hand = new HandView(shapes, textures.resting, (idx, e) => drag.bindHandPick(idx, e));
  ctx.hand = hand;
  world.addChild(hand.root);
  drag = new DragController(ctx);

  async function startEndless(): Promise<void> {
    if (ctx.inputLocked) return;
    await session.startEndless();
  }

  hud.onDaily = async () => {
    if (ctx.inputLocked) return;
    if (session.status().dailyDone && session.mode !== "daily") {
      hud.showHint("Today's daily is done. New board at 00:00 UTC.");
      setTimeout(() => hud.showHint(null), 2000);
      return;
    }
    await session.startDaily();
  };

  applyLetterbox(app, ctx);
  window.addEventListener("resize", () => applyLetterbox(app, ctx));
  window.visualViewport?.addEventListener("resize", () => applyLetterbox(app, ctx));

  // Dev-only: lets the scripted playtest compare the scene to the engine state. Vite strips this from builds.
  if (import.meta.env.DEV) Object.assign(globalThis, { __runestone: { ctx, session, drag } });

  await session.boot();

  // Step 1 debug corner: fire the rewarded ad by hand. Phone and dev only; removed in step 7.
  if (!import.meta.env.DEV && !Capacitor.isNativePlatform()) {
    document.getElementById("test-ad")?.remove();
    document.getElementById("ad-result")?.remove();
  }
  document.getElementById("test-ad")?.addEventListener("click", async () => {
    const el = document.getElementById("ad-result");
    if (el) el.textContent = "…";
    try {
      const ok = await ops.ads.showRewarded("continue");
      if (el) el.textContent = String(ok);
    } catch (err) {
      if (el) el.textContent = err instanceof Error ? err.message : String(err);
    }
  });
}

/**
 * Whole-number scale in device pixels (R13): the canvas is 216x384 and each logical
 * pixel becomes exactly `scale` physical pixels, so nearest-neighbor stays crisp at
 * any devicePixelRatio. Pixi maps pointer positions through the canvas rect, so
 * events still arrive in logical units.
 */
function applyLetterbox(app: Application, ctx: GameContext): void {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / LOGICAL_W, (window.innerHeight * dpr) / LOGICAL_H)));
  app.canvas.style.width = `${(LOGICAL_W * scale) / dpr}px`;
  app.canvas.style.height = `${(LOGICAL_H * scale) / dpr}px`;
  ctx.stageScale = 1;
}

main().catch(console.error);
