/**
 * Shapes: load the bag's shape list from data/shapes.json into immutable records and
 * validate it. Knows nothing about the grid or the bag rules.
 *
 * Adding or reweighting a shape is a JSON edit; this module only checks that the JSON
 * says something coherent (HANDOFF "Shape set", MODULES "Shapes").
 */

import type { Pos } from "./grid.js";

export interface Shape {
  readonly id: string;
  readonly silhouette: string;
  readonly cells: readonly Pos[];
  readonly weight: number;
}

/**
 * The silhouettes HANDOFF's shape set names. S and Z are mirror images and share "S",
 * which is what makes the count 11. A JSON file missing any of these is rejected.
 */
export const REQUIRED_SILHOUETTES = [
  "single",
  "line2",
  "line3",
  "line4",
  "line5",
  "square2",
  "square3",
  "smallL",
  "largeL",
  "T",
  "S",
] as const;

export class ShapeSet {
  private readonly byId: ReadonlyMap<string, Shape>;
  private readonly list: readonly Shape[];

  constructor(shapes: readonly Shape[]) {
    this.list = Object.freeze([...shapes]);
    this.byId = new Map(shapes.map((s) => [s.id, s]));
  }

  /** Every shape, in file order. */
  all(): readonly Shape[] {
    return this.list;
  }

  /** Throws on an unknown id; a typo in a fixture should fail loudly. */
  get(id: string): Shape {
    const s = this.byId.get(id);
    if (!s) throw new Error(`Shapes: unknown shape id "${id}"`);
    return s;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Distinct silhouettes present, in first-seen order. */
  silhouettes(): readonly string[] {
    const seen: string[] = [];
    for (const s of this.list) if (!seen.includes(s.silhouette)) seen.push(s.silhouette);
    return seen;
  }
}

export class ShapeDataError extends Error {
  constructor(message: string) {
    super(`Shapes: ${message}`);
    this.name = "ShapeDataError";
  }
}

/**
 * Parse and validate the contents of data/shapes.json. Accepts `unknown` so callers
 * can hand it a JSON import or a parsed string without a cast.
 */
export function loadShapes(json: unknown): ShapeSet {
  if (!isRecord(json) || !Array.isArray(json["shapes"])) throw new ShapeDataError("expected { shapes: [...] }");
  const raw = json["shapes"] as unknown[];
  if (raw.length === 0) throw new ShapeDataError("shapes list is empty");

  const shapes: Shape[] = [];
  const ids = new Set<string>();
  let anyPositiveWeight = false;

  raw.forEach((entry, i) => {
    const shape = parseShape(entry, i);
    if (ids.has(shape.id)) throw new ShapeDataError(`duplicate id "${shape.id}"`);
    ids.add(shape.id);
    if (shape.weight > 0) anyPositiveWeight = true;
    shapes.push(shape);
  });

  if (!anyPositiveWeight) throw new ShapeDataError("every weight is 0; the bag could never draw");

  const present = new Set(shapes.map((s) => s.silhouette));
  const missing = REQUIRED_SILHOUETTES.filter((s) => !present.has(s));
  if (missing.length) throw new ShapeDataError(`missing silhouette(s) from HANDOFF's shape set: ${missing.join(", ")}`);

  return new ShapeSet(shapes);
}

function parseShape(entry: unknown, index: number): Shape {
  const where = `shapes[${index}]`;
  if (!isRecord(entry)) throw new ShapeDataError(`${where} is not an object`);

  const id = entry["id"];
  if (typeof id !== "string" || id.length === 0) throw new ShapeDataError(`${where}: id must be a non-empty string`);

  const silhouette = entry["silhouette"];
  if (typeof silhouette !== "string" || silhouette.length === 0)
    throw new ShapeDataError(`"${id}": silhouette must be a non-empty string`);

  const weight = entry["weight"];
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0)
    throw new ShapeDataError(`"${id}": weight must be a finite number >= 0, got ${String(weight)}`);

  const cells = parseCells(entry["cells"], id);

  return Object.freeze({ id, silhouette, cells, weight });
}

function parseCells(raw: unknown, id: string): readonly Pos[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ShapeDataError(`"${id}": cells must be a non-empty array`);

  const cells: Pos[] = raw.map((c, i) => {
    if (!Array.isArray(c) || c.length !== 2 || !Number.isInteger(c[0]) || !Number.isInteger(c[1]))
      throw new ShapeDataError(`"${id}": cells[${i}] must be [x, y] with integer coordinates`);
    return Object.freeze({ x: c[0] as number, y: c[1] as number });
  });

  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  if (minX !== 0 || minY !== 0)
    throw new ShapeDataError(`"${id}": cells are not normalized (min x = ${minX}, min y = ${minY}; both must be 0)`);

  const keys = new Set<string>();
  for (const c of cells) {
    const k = `${c.x},${c.y}`;
    if (keys.has(k)) throw new ShapeDataError(`"${id}": duplicate cell (${c.x}, ${c.y})`);
    keys.add(k);
  }

  if (!isConnected(cells, keys)) throw new ShapeDataError(`"${id}": cells are not connected`);

  return Object.freeze(cells);
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Four-neighbour connectivity: every cell reachable from the first by orthogonal steps. */
function isConnected(cells: readonly Pos[], keys: ReadonlySet<string>): boolean {
  const first = cells[0];
  if (!first) return false;
  const seen = new Set<string>([`${first.x},${first.y}`]);
  const stack: Pos[] = [first];
  while (stack.length) {
    const c = stack.pop() as Pos;
    for (const [dx, dy] of STEPS) {
      const k = `${c.x + dx},${c.y + dy}`;
      if (keys.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  return seen.size === cells.length;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
