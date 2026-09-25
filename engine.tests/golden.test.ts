/**
 * Golden fixtures (EVENTS.md): whole event logs compared to engine.tests/golden/*.json.
 * Regenerate only with `npm run golden:update` (sets UPDATE_GOLDEN=1) and say so in the
 * commit. A diff here means a rule changed; that is the point.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GameEvent, HandDrawn, LinesCleared } from "../engine/events.js";
import { Run } from "../engine/run.js";
import { config, craft, playOut, shapes, singlesOnlyBoard, types } from "./helpers/play.js";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "golden");
const UPDATE = process.env["UPDATE_GOLDEN"] === "1";

function golden(name: string, events: readonly GameEvent[]): void {
  const file = join(GOLDEN_DIR, `${name}.json`);
  const text = JSON.stringify(events, null, 2) + "\n";
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  if (!existsSync(file)) throw new Error(`missing golden fixture ${file}; run npm run golden:update`);
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(JSON.parse(text));
}

describe("golden fixtures", () => {
  it("run_seed_1: a full run to game over under seed 1 (the step 3 gate)", () => {
    const run = Run.start(shapes, config, 1);
    playOut(run);
    const events = run.events();
    const t = types(events);
    expect(t[0]).toBe("RunStarted");
    expect(t[t.length - 1]).toBe("RunEnded");
    expect(events[events.length - 1]).toMatchObject({ endedBy: "no_fit" });
    expect(run.state().placements).toBeGreaterThan(3);
    golden("run_seed_1", events);
  });

  it("run_shared_cell: row + column completed by one placement (R8)", () => {
    // Row 2 and column 6 each missing only (6,2).
    const rows = Array.from({ length: 8 }, (_, y) => {
      const r = (y === 2 ? "######.#" : "........").split("");
      if (y !== 2) r[6] = "#";
      return r.join("");
    });
    const run = craft({ rows, hand: ["single", "line2_h", "square2"], seed: 2 });
    const first = run.place(0, { x: 6, y: 2 }, { continueAvailable: false });
    const cleared = first[1] as LinesCleared;
    expect(cleared.rows).toEqual([2]);
    expect(cleared.cols).toEqual([6]);
    expect(cleared.cells).toHaveLength(15);
    playOut(run);
    golden("run_shared_cell", run.events());
  });

  it("run_continue: continue used then refused (R3)", () => {
    const run = craft({ rows: singlesOnlyBoard(), hand: ["single", "line2_h", "line3_v"], seed: 3 });
    run.place(0, { x: 3, y: 3 }, { continueAvailable: true });
    run.continueRun(3, 3);
    playOut(run, true);
    const t = types(run.events());
    expect(t.filter((x) => x === "ContinueOffered")).toHaveLength(1);
    expect(t.filter((x) => x === "ContinueUsed")).toHaveLength(1);
    expect(t[t.length - 1]).toBe("RunEnded");
    golden("run_continue", run.events());
  });

  it("run_mercy: a hand that needed mercy (R1)", () => {
    // Only singles fit this board. Place the one in hand, then the redraw must be all singles
    // unless the Bag draw happened to contain one; pick the first seed where it did not.
    const rows = singlesOnlyBoard();
    let run: Run | null = null;
    for (let seed = 0; seed < 100 && !run; seed++) {
      const candidate = craft({ rows, hand: ["single", null, null], seed });
      const events = candidate.place(0, { x: 3, y: 3 }, { continueAvailable: false });
      const drawn = events.find((e): e is HandDrawn => e.type === "HandDrawn");
      if (drawn?.mercy) run = candidate;
    }
    if (!run) throw new Error("no seed under 100 forced mercy; the bag weights changed a lot");
    const drawn = run.events().find((e): e is HandDrawn => e.type === "HandDrawn")!;
    expect(drawn.mercy).toBe(true);
    expect(drawn.shapes).toEqual(["single", "single", "single"]);
    playOut(run);
    golden("run_mercy", run.events());
  });
});
