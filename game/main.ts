import { Capacitor } from "@capacitor/core";
import { Application, Container, TextureSource } from "pixi.js";
import bagJson from "../data/bag.json";
import scoringJson from "../data/scoring.json";
import shapesJson from "../data/shapes.json";
import {
  Run,
  loadBagConfig,
  loadScoreTable,
  loadShapes,
  runConfig,
  type GameEvent,
} from "../engine/index.js";
import type { Ops } from "../ops/index.js";
import { fakeOps } from "../ops/fake/index.js";
import { AdMobAds } from "../ops/real/admob.js";
import { replayEvents } from "./anim/index.js";
import { createTileTextures } from "./assets/tile.js";
import { DragController } from "./input/drag.js";
import { LOGICAL_H, LOGICAL_W } from "./layout.js";
import { BoardView } from "./scene/board.js";
import { HandView } from "./scene/hand.js";
import { HudView } from "./scene/hud.js";
import type { GameContext } from "./scene/types.js";
import { noopSfx } from "./sfx.js";
import { reduce, type ViewState } from "./view-model.js";

TextureSource.defaultOptions.scaleMode = "nearest";

/** Step 1: analytics, IAP and save stay on fakes; UMP + real analytics are step 7 (STEP1_EXPORT §4). */
function createOps(): Ops {
  const ops = fakeOps();
  if (Capacitor.isNativePlatform()) {
    return { ...ops, ads: new AdMobAds() };
  }
  return ops;
}

async function main(): Promise<void> {
  const mount = document.getElementById("game");
  if (!mount) throw new Error("Runestone: missing #game mount");

  createOps();

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
  const hud = new HudView();
  world.addChild(board.root, hud.root);

  let run: Run = Run.start(shapes, config, Date.now());
  let viewState: ViewState = reduce(run.state(), []);
  let inputLocked = false;

  const ctx: GameContext = {
    app,
    run,
    shapes,
    board,
    hand: null as unknown as HandView,
    hud,
    sfx: noopSfx(),
    viewState,
    inputLocked,
    stageScale: 1,
    onNewRun: () => {},
    applyViewState(next) {
      viewState = next;
      ctx.viewState = next;
      board.syncGrid(next.grid);
      hand.syncHand(next.hand);
      hud.setScore(next.score, next.streak);
      if (next.phase === "ended") hud.showGameOver(next.score, ctx.onNewRun);
      else hud.hideGameOver();
    },
    setInputLocked(locked) {
      inputLocked = locked;
      ctx.inputLocked = locked;
    },
  };

  let drag!: DragController;
  const hand = new HandView(shapes, textures.resting, (idx, e) => drag.bindHandPick(idx, e));
  ctx.hand = hand;
  world.addChild(hand.root);

  drag = new DragController(ctx);

  async function beginRun(seed: number): Promise<void> {
    run = Run.start(shapes, config, seed);
    ctx.run = run;
    board.root.alpha = 1;
    hud.hideGameOver();
    const drawn = run.events().filter((e): e is Extract<GameEvent, { type: "HandDrawn" }> => e.type === "HandDrawn");
    const lastDraw = drawn[drawn.length - 1];
    const events = lastDraw ? [lastDraw] : [];
    const vs = reduce(run.state(), events);
    ctx.applyViewState(vs);
    if (events.length) await replayEvents(ctx, events, vs);
  }

  ctx.onNewRun = () => {
    void beginRun(Date.now());
  };

  applyLetterbox(app);
  window.addEventListener("resize", () => applyLetterbox(app));

  await beginRun(run.state().seed);

  document.getElementById("test-ad")?.addEventListener("click", async () => {
    const ops = createOps();
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

function applyLetterbox(app: Application): void {
  const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H)));
  const w = LOGICAL_W * scale;
  const h = LOGICAL_H * scale;
  app.canvas.style.width = `${w}px`;
  app.canvas.style.height = `${h}px`;
}

main().catch(console.error);
