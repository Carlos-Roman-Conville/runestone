import { Container, Sprite, Texture } from "pixi.js";
import type { Pos } from "../../engine/grid.js";
import type { Shape } from "../../engine/shapes.js";
import { BOARD_CELLS, BOARD_PX, BOARD_X, BOARD_Y, CELL_PX } from "../layout.js";
import type { TileState } from "../assets/tile.js";
import { PALETTE } from "../assets/tile.js";

export class BoardView {
  readonly root = new Container();
  private readonly tiles = new Container();
  private readonly ghostLayer = new Container();
  private readonly cellSprites = new Map<string, Sprite>();
  private ghostSprites: Sprite[] = [];

  constructor(private readonly textures: Record<TileState, Texture>) {
    this.root.position.set(BOARD_X, BOARD_Y);
    const bg = new Sprite(Texture.WHITE);
    bg.width = BOARD_PX;
    bg.height = BOARD_PX;
    bg.tint = PALETTE.board;
    this.root.addChild(bg, this.tiles, this.ghostLayer);
  }

  syncGrid(rows: readonly string[]): void {
    for (let y = 0; y < BOARD_CELLS; y++) {
      const row = rows[y] ?? "";
      for (let x = 0; x < BOARD_CELLS; x++) {
        if (row[x] === "#") this.reveal(x, y);
        else this.hide(x, y);
      }
    }
  }

  /** Reveal resting tiles at these cells (a placement, before its snap cue). */
  showCells(cells: readonly Pos[]): void {
    for (const c of cells) this.reveal(c.x, c.y);
  }

  /** Hide tiles at these cells (after the clear cue has popped them). */
  hideCells(cells: readonly Pos[]): void {
    for (const c of cells) this.hide(c.x, c.y);
  }

  /** Sprites are centre-anchored so scale cues grow and shrink about the cell centre. */
  private reveal(x: number, y: number): void {
    const key = `${x},${y}`;
    let sp = this.cellSprites.get(key);
    if (!sp) {
      sp = new Sprite(this.textures.resting);
      sp.roundPixels = true;
      sp.anchor.set(0.5);
      sp.position.set(x * CELL_PX + CELL_PX / 2, y * CELL_PX + CELL_PX / 2);
      this.tiles.addChild(sp);
      this.cellSprites.set(key, sp);
    }
    sp.texture = this.textures.resting;
    sp.scale.set(1);
    sp.visible = true;
  }

  private hide(x: number, y: number): void {
    const sp = this.cellSprites.get(`${x},${y}`);
    if (sp) sp.visible = false;
  }

  setGhost(shape: Shape | null, origin: Pos | null): void {
    for (const s of this.ghostSprites) s.destroy();
    this.ghostSprites = [];
    if (!shape || !origin) return;
    for (const c of shape.cells) {
      const sp = new Sprite(this.textures.ghost);
      sp.roundPixels = true;
      sp.position.set((origin.x + c.x) * CELL_PX, (origin.y + c.y) * CELL_PX);
      this.ghostLayer.addChild(sp);
      this.ghostSprites.push(sp);
    }
  }

  /** Grid origin from a point in stage (logical) coordinates. */
  originFromStage(stageX: number, stageY: number): Pos {
    const localX = stageX - BOARD_X;
    const localY = stageY - BOARD_Y;
    return {
      x: Math.round(localX / CELL_PX),
      y: Math.round(localY / CELL_PX),
    };
  }

  cellCenterStage(origin: Pos, cell: Pos): { x: number; y: number } {
    return {
      x: BOARD_X + (origin.x + cell.x) * CELL_PX + CELL_PX / 2,
      y: BOARD_Y + (origin.y + cell.y) * CELL_PX + CELL_PX / 2,
    };
  }

  getSpriteAtCell(x: number, y: number): Sprite | undefined {
    return this.cellSprites.get(`${x},${y}`);
  }

  setCellsState(cells: readonly Pos[], state: TileState): void {
    for (const c of cells) {
      const sp = this.cellSprites.get(`${c.x},${c.y}`);
      if (sp) sp.texture = this.textures[state];
    }
  }
}
