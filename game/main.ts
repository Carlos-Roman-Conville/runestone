import { Capacitor } from "@capacitor/core";
import { Application, Assets, Sprite, TextureSource } from "pixi.js";
import type { Ops } from "../ops/index.js";
import { fakeOps } from "../ops/fake/index.js";
import { AdMobAds } from "../ops/real/admob.js";
import tileUrl from "./assets/tile.png";

TextureSource.defaultOptions.scaleMode = "nearest";

const TILE_PX = 24;
const TILE_SCALE = 4;

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

  const ops = createOps();

  const app = new Application();
  await app.init({
    width: TILE_PX * TILE_SCALE,
    height: TILE_PX * TILE_SCALE,
    background: "#2a2520",
    antialias: false,
    resolution: 1,
    autoDensity: true,
  });
  mount.appendChild(app.canvas);

  const texture = await Assets.load(tileUrl);
  const tile = new Sprite(texture);
  tile.scale.set(TILE_SCALE);
  tile.roundPixels = true;
  app.stage.addChild(tile);

  const resultEl = document.getElementById("ad-result");
  document.getElementById("test-ad")?.addEventListener("click", async () => {
    if (resultEl) resultEl.textContent = "…";
    try {
      const ok = await ops.ads.showRewarded("continue");
      if (resultEl) resultEl.textContent = String(ok);
    } catch (err) {
      if (resultEl) resultEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById("ad-result");
  if (el) el.textContent = err instanceof Error ? err.message : String(err);
});
