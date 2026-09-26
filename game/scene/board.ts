import { Container, type FederatedPointerEvent, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { Pos } from "../../engine/grid.js";
import type { Shape } from "../../engine/shapes.js";
import { BOARD_CELLS, BOARD_PX, BOARD_X, BOARD_Y, CELL_PX } from "../layout.js";
import type { TileState, TileTextures } from "../assets/tile.js";
import { PALETTE } from "../assets/tile.js";

export class BoardView {
  readonly root = new Container();
  private readonly tiles = new Container();
  private readonly ghostLayer = new Container();
  private readonly cellSprites = new Map<string, Sprite>();
  private ghostSprites: Sprite[] = [];
  private previewKeys: string[] = [];

  constructor(private readonly textures: TileTextures) {
    this.root.position.set(BOARD_X, BOARD_Y);
    const bg = new Sprite(Texture.WHITE);
    bg.width = BOARD_PX;
    bg.height = BOARD_PX;
    bg.tint = PALETTE.board;
    // Every empty cell gets a faint 1 px outline on exactly the pixels a tile's edge
    // occupies, so the grid and the tiles share one rhythm (2 px seams inside, 1 px outside).
    const grid = new Graphics();
    for (let i = 0; i < BOARD_CELLS; i++) {
      grid.rect(i * CELL_PX, 0, 1, BOARD_PX);
      grid.rect(i * CELL_PX + CELL_PX - 1, 0, 1, BOARD_PX);
      grid.rect(0, i * CELL_PX, BOARD_PX, 1);
      grid.rect(0, i * CELL_PX + CELL_PX - 1, BOARD_PX, 1);
    }
    grid.fill({ color: PALETTE.grid });
    this.root.addChild(bg, grid, this.tiles, this.ghostLayer);
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

  /** The landing preview. `completes`: the drop finishes a line, so the ghost lights like the line does. */
  setGhost(shape: Shape | null, origin: Pos | null, completes = false): void {
    for (const s of this.ghostSprites) s.destroy();
    this.ghostSprites = [];
    if (!shape || !origin) return;
    for (const c of shape.cells) {
      const sp = new Sprite(completes ? this.textures.lit : this.textures.ghost);
      sp.roundPixels = true;
      if (completes) sp.alpha = 0.75;
      sp.position.set((origin.x + c.x) * CELL_PX, (origin.y + c.y) * CELL_PX);
      this.ghostLayer.addChild(sp);
      this.ghostSprites.push(sp);
    }
  }


  /**
   * Light the filled tiles of the rows and columns a drop would complete, so the
   * player sees the payoff before letting go. Which lines is run.preview()'s answer.
   */
  setLinePreview(rows: readonly number[], cols: readonly number[]): void {
    for (const key of this.previewKeys) {
      const sp = this.cellSprites.get(key);
      if (sp && sp.visible) sp.texture = this.textures.resting;
    }
    this.previewKeys = [];
    const light = (x: number, y: number): void => {
      const key = `${x},${y}`;
      const sp = this.cellSprites.get(key);
      if (!sp || !sp.visible) return;
      sp.texture = this.textures.lit;
      this.previewKeys.push(key);
    };
    for (const y of rows) for (let x = 0; x < BOARD_CELLS; x++) light(x, y);
    for (const x of cols) for (let y = 0; y < BOARD_CELLS; y++) light(x, y);
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

  /**
   * Continue (R3): let the player choose a cell; its row and column will clear. Shows a
   * ghost cross under the pointer, resolves on tap. The board decides nothing about what
   * the choice does; Run does that in continueRun.
   */
  pickCell(onSelect?: (cell: Pos) => void): Promise<Pos> {
    return new Promise((resolve) => {
      this.root.eventMode = "static";
      this.root.hitArea = new Rectangle(0, 0, BOARD_PX, BOARD_PX);
      let selected: Pos | null = null;
      const cellAt = (e: FederatedPointerEvent): Pos | null => {
        const p = e.getLocalPosition(this.root);
        const x = Math.floor(p.x / CELL_PX);
        const y = Math.floor(p.y / CELL_PX);
        return x >= 0 && y >= 0 && x < BOARD_CELLS && y < BOARD_CELLS ? { x, y } : null;
      };
      // Hover (mouse) previews; it never moves the selection.
      const onMove = (e: FederatedPointerEvent): void => {
        if (e.pointerType === "mouse" && !selected) this.setCross(cellAt(e));
      };
      const onTap = (e: FederatedPointerEvent): void => {
        const cell = cellAt(e);
        if (!cell) return;
        if (!selected || selected.x !== cell.x || selected.y !== cell.y) {
          selected = cell;
          this.setCross(cell);
          onSelect?.(cell);
          return;
        }
        this.root.off("pointermove", onMove);
        this.root.off("pointertap", onTap);
        this.root.eventMode = "passive";
        this.setCross(null);
        resolve(cell);
      };
      this.root.on("pointermove", onMove);
      this.root.on("pointertap", onTap);
    });
  }

  /**
   * The continue preview: the filled tiles in the chosen row and column light up (they
   * are what will clear), exactly like a line preview, and empty cells show a ghost.
   */
  private setCross(cell: Pos | null): void {
    for (const s of this.ghostSprites) s.destroy();
    this.ghostSprites = [];
    this.setLinePreview([], []);
    if (!cell) return;
    this.setLinePreview([cell.y], [cell.x]);
    const put = (x: number, y: number): void => {
      const tile = this.cellSprites.get(`${x},${y}`);
      if (tile && tile.visible) return; // lit by the line preview
      const sp = new Sprite(this.textures.ghost);
      sp.roundPixels = true;
      sp.position.set(x * CELL_PX, y * CELL_PX);
      this.ghostLayer.addChild(sp);
      this.ghostSprites.push(sp);
    };
    for (let x = 0; x < BOARD_CELLS; x++) put(x, cell.y);
    for (let y = 0; y < BOARD_CELLS; y++) if (y !== cell.y) put(cell.x, y);
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
