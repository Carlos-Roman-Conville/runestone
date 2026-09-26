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
    autoDensity: false,
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
        const judge = (cell: Pos): "ok" | "weak" | "reject" => {
          const p = session.run.previewContinue(cell.y, cell.x);
          if (!p || p.cleared === 0) return "reject";
          return p.handFitsAfter ? "ok" : "weak";
        };
        return await board.pickCell((cell) => {
          const verdict = judge(cell);
          hud.showHint(
            verdict === "reject"
              ? "Nothing to clear there. Pick a row or column with blocks"
              : verdict === "weak"
                ? "Your shapes still won't fit. Tap again to use it anyway"
                : "Tap it again to clear",
          );
        }, judge);
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
      if (!locked) drag?.resumePending();
    },
  };

  let drag!: DragController;
  const hand = new HandView(shapes, textures, (idx, e) => drag.bindHandPick(idx, e));
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
  // The daily rolls over at 00:00 UTC while the game may be open; keep the Daily label honest.
  const refreshStatus = (): void => hud.setStatus(session.status());
  setInterval(refreshStatus, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshStatus();
  });
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
 * Whole-number scale in device pixels (R13). The renderer draws at that resolution, so
 * the backing store is 216*scale x 384*scale and the CSS size maps it 1:1 onto physical
 * pixels. Tile textures are 1x and nearest-filtered, so each tile pixel becomes an exact
 * scale x scale block (pixel art stays crisp), while text and panels are drawn at full
 * device resolution instead of being upscaled from 216 px (which made text blocky).
 * Pixi maps pointers through the canvas rect and resolution, so events stay logical.
 */
function applyLetterbox(app: Application, ctx: GameContext): void {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min((window.innerWidth * dpr) / LOGICAL_W, (window.innerHeight * dpr) / LOGICAL_H);
  // Whole-number scale when at least 1x fits. Below that (a short portal iframe, a tiny
  // desktop window) shrink to fit instead of cutting the HUD and tray off: less crisp,
  // but playable. Found 2026-09-26: a 330 px tall window lost 27 px at top and bottom.
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const resolution = Math.max(1, Math.floor(fit));
  if (app.renderer.resolution !== resolution || app.renderer.width !== LOGICAL_W * resolution) app.renderer.resize(LOGICAL_W, LOGICAL_H, resolution);
  app.canvas.style.width = `${(LOGICAL_W * scale) / dpr}px`;
  app.canvas.style.height = `${(LOGICAL_H * scale) / dpr}px`;
  app.canvas.style.imageRendering = fit >= 1 ? "pixelated" : "auto";
  ctx.stageScale = 1;
}

main().catch(console.error);
