/**
 * Grid: cell occupancy and bounds for a square board. Knows no rules.
 *
 * Placement (does a shape fit), Clearing (what happens to a full line) and Scoring live
 * elsewhere. Grid only answers "is this cell empty", "is this line full" and mutates
 * single cells.
 */

export interface Pos {
  x: number;
  y: number;
}

export class Grid {
  private readonly cells: Uint8Array;

  private constructor(
    readonly size: number,
    cells?: Uint8Array,
  ) {
    if (!Number.isInteger(size) || size <= 0) throw new RangeError(`Grid: size must be a positive integer, got ${size}`);
    this.cells = cells ?? new Uint8Array(size * size);
  }

  static empty(size = 8): Grid {
    return new Grid(size);
  }

  /** Build from rows of '.' (empty) and '#' (filled). Every row must have `size` chars. */
  static fromRows(rows: readonly string[]): Grid {
    const size = rows.length;
    const g = new Grid(size);
    rows.forEach((row, y) => {
      if (row.length !== size) throw new RangeError(`Grid.fromRows: row ${y} has ${row.length} cells, expected ${size}`);
      for (let x = 0; x < size; x++) if (row[x] === "#") g.set(x, y);
    });
    return g;
  }

  private index(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  /** False when out of bounds, so callers can test fit without a separate bounds check. */
  isEmpty(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.cells[this.index(x, y)] === 0;
  }

  isFilled(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.cells[this.index(x, y)] === 1;
  }

  set(x: number, y: number): void {
    this.assertInBounds(x, y);
    this.cells[this.index(x, y)] = 1;
  }

  clear(x: number, y: number): void {
    this.assertInBounds(x, y);
    this.cells[this.index(x, y)] = 0;
  }

  rowFull(y: number): boolean {
    this.assertInBounds(0, y);
    for (let x = 0; x < this.size; x++) if (this.cells[this.index(x, y)] === 0) return false;
    return true;
  }

  colFull(x: number): boolean {
    this.assertInBounds(x, 0);
    for (let y = 0; y < this.size; y++) if (this.cells[this.index(x, y)] === 0) return false;
    return true;
  }

  fullRows(): number[] {
    const out: number[] = [];
    for (let y = 0; y < this.size; y++) if (this.rowFull(y)) out.push(y);
    return out;
  }

  fullCols(): number[] {
    const out: number[] = [];
    for (let x = 0; x < this.size; x++) if (this.colFull(x)) out.push(x);
    return out;
  }

  /** Number of filled cells. */
  count(): number {
    let n = 0;
    for (const c of this.cells) n += c;
    return n;
  }

  /** Deep copy; shares no storage with the original. */
  clone(): Grid {
    return new Grid(this.size, new Uint8Array(this.cells));
  }

  /** Rows of '.' and '#', top to bottom. Inverse of fromRows. */
  toRows(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.size; y++) {
      let row = "";
      for (let x = 0; x < this.size; x++) row += this.cells[this.index(x, y)] ? "#" : ".";
      rows.push(row);
    }
    return rows;
  }

  private assertInBounds(x: number, y: number): void {
    if (!this.inBounds(x, y)) throw new RangeError(`Grid: (${x}, ${y}) is outside a ${this.size}x${this.size} grid`);
  }
}
