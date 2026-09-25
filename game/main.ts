import { Application, Assets, Sprite, TextureSource } from "pixi.js";
import tileUrl from "./assets/tile.png";

TextureSource.defaultOptions.scaleMode = "nearest";

const TILE_PX = 24;
const TILE_SCALE = 4;

async function main(): Promise<void> {
  const mount = document.getElementById("game");
  if (!mount) throw new Error("Runestone: missing #game mount");

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

  document.getElementById("test-ad")?.addEventListener("click", () => {
    const el = document.getElementById("ad-result");
    if (el) el.textContent = "Ads wired in step 1 recipe step 3.";
  });
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById("ad-result");
  if (el) el.textContent = String(err);
});
