import { Application, Graphics, Texture } from "pixi.js";

export const PALETTE = {
  board: 0x2a2520,
  tile: 0x887266,
  edge: 0x554840,
  lit: 0xa89078,
  text: 0xe8e0d4,
} as const;

export type TileState = "resting" | "lit" | "ghost";

const TILE = 24;

function drawTile(g: Graphics, state: TileState): void {
  const fill = state === "lit" ? PALETTE.lit : PALETTE.tile;
  const alpha = state === "ghost" ? 0.5 : 1;
  g.rect(0, 0, TILE, TILE);
  g.fill({ color: fill, alpha });
  g.stroke({ color: PALETTE.edge, width: 1, alpha });
}

/** Placeholder stone tile; Rex swaps this file for a PNG in step 8. */
export function createTileTextures(app: Application): Record<TileState, Texture> {
  const out = {} as Record<TileState, Texture>;
  for (const state of ["resting", "lit", "ghost"] as const) {
    const g = new Graphics();
    drawTile(g, state);
    out[state] = app.renderer.generateTexture({ target: g, resolution: 1 });
    g.destroy();
  }
  return out;
}
