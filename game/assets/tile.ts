import { Application, Graphics, Rectangle, Texture } from "pixi.js";

export const PALETTE = {
  board: 0x2a2520,
  tile: 0x887266,
  edge: 0x554840,
  lit: 0xa89078,
  text: 0xe8e0d4,
  /** Faint grid on the empty board (DESIGN: "the same stone, darker, with a faint grid"). */
  grid: 0x332d27,
  /** Overlay dimmer and panel. */
  shade: 0x0e0c0b,
  panel: 0x2a2520,
  accent: 0xd8b878,
} as const;

export type TileState = "resting" | "lit" | "ghost";

export interface TileTextures extends Record<TileState, Texture> {
  /** 12 px resting tile for the tray, drawn at its own size so its edge stays one whole pixel. */
  readonly small: Texture;
}

/**
 * One tile, pixel-exact: a size x size square whose outermost ring of pixels is the edge
 * color. Two filled rects, no stroke: a centered 1 px stroke would spill half a pixel
 * outside, make the texture 25 px wide and knock every tile half a pixel off the grid.
 */
function drawTile(g: Graphics, size: number, fill: number, alpha: number): void {
  g.rect(0, 0, size, size).fill({ color: PALETTE.edge, alpha });
  g.rect(1, 1, size - 2, size - 2).fill({ color: fill, alpha });
}

function bake(app: Application, size: number, fill: number, alpha: number): Texture {
  const g = new Graphics();
  drawTile(g, size, fill, alpha);
  const tex = app.renderer.generateTexture({ target: g, resolution: 1, frame: new Rectangle(0, 0, size, size), antialias: false });
  g.destroy();
  return tex;
}

/** Placeholder stone tile; Rex swaps this file for PNGs in step 8 (same keys, same sizes). */
export function createTileTextures(app: Application): TileTextures {
  return {
    resting: bake(app, 24, PALETTE.tile, 1),
    lit: bake(app, 24, PALETTE.lit, 1),
    ghost: bake(app, 24, PALETTE.tile, 0.5),
    small: bake(app, 12, PALETTE.tile, 1),
  };
}
