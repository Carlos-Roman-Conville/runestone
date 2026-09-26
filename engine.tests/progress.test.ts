import { describe, expect, it } from "vitest";
import { daysOfMonth } from "../engine/daily.js";
import { Progress } from "../engine/progress.js";

describe("Progress", () => {
  it("high score only rises; runs count every run", () => {
    const p = new Progress();
    p.record({ mode: "endless", score: 120, placements: 30, endedBy: "no_fit" });
    p.record({ mode: "endless", score: 80, placements: 20, endedBy: "declined_continue" });
    expect(p.highScore).toBe(120);
    expect(p.runsPlayed).toBe(2);
    p.record({ mode: "endless", score: 121, placements: 31, endedBy: "no_fit" });
    expect(p.highScore).toBe(121);
    expect(() => p.record({ mode: "endless", score: -1, placements: 0, endedBy: "no_fit" })).toThrow(RangeError);
  });

  it("a daily run marks its day and keeps the best score for it", () => {
    const p = new Progress();
    expect(p.dailyDone("2026-09-25")).toBe(false);
    p.record({ mode: "daily", dailyKey: "2026-09-25", score: 50, placements: 10, endedBy: "no_fit" });
    expect(p.dailyDone("2026-09-25")).toBe(true);
    expect(p.dailyBest("2026-09-25")).toBe(50);
    p.markDaily("2026-09-25", 40);
    expect(p.dailyBest("2026-09-25")).toBe(50);
    p.markDaily("2026-09-25", 70);
    expect(p.dailyBest("2026-09-25")).toBe(70);
  });

  it("a month is complete only when every day is marked", () => {
    const p = new Progress();
    const days = daysOfMonth("2026-02");
    for (const d of days.slice(0, -1)) p.markDaily(d);
    expect(p.monthComplete("2026-02")).toBe(false);
    expect(p.daysDone("2026-02")).toHaveLength(27);
    p.markDaily(days.at(-1) as string);
    expect(p.monthComplete("2026-02")).toBe(true);
    expect(p.monthComplete("2026-03")).toBe(false);
  });

  it("round trip through serialize/deserialize (JSON) preserves everything", () => {
    const p = new Progress();
    p.record({ mode: "endless", score: 300, placements: 60, endedBy: "no_fit" });
    p.record({ mode: "daily", dailyKey: "2026-09-25", score: 90, placements: 20, endedBy: "no_fit" });
    p.markDaily("2026-09-24", 10);
    p.setAdsRemoved(true);
    const back = Progress.deserialize(JSON.parse(JSON.stringify(p.serialize())));
    expect(back.serialize()).toEqual(p.serialize());
    expect(back.highScore).toBe(300);
    expect(back.runsPlayed).toBe(2);
    expect(back.dailyBest("2026-09-25")).toBe(90);
    expect(back.dailyDone("2026-09-24")).toBe(true);
    expect(back.adsRemoved).toBe(true);
  });

  it("merge keeps everything either copy earned", () => {
    const a = new Progress();
    a.record({ mode: "endless", score: 100, placements: 20, endedBy: "no_fit" });
    a.markDaily("2026-09-25", 40);
    const b = new Progress();
    b.record({ mode: "endless", score: 60, placements: 10, endedBy: "no_fit" });
    b.record({ mode: "endless", score: 70, placements: 10, endedBy: "no_fit" });
    b.markDaily("2026-09-25", 55);
    b.markDaily("2026-09-26", 10);
    b.setAdsRemoved(true);
    a.merge(b);
    expect(a.highScore).toBe(100);
    expect(a.runsPlayed).toBe(2);
    expect(a.dailyBest("2026-09-25")).toBe(55);
    expect(a.dailyDone("2026-09-26")).toBe(true);
    expect(a.adsRemoved).toBe(true);
  });

  it("deserialize tolerates garbage and partial saves", () => {
    expect(Progress.deserialize(null).highScore).toBe(0);
    expect(Progress.deserialize("nope").runsPlayed).toBe(0);
    const partial = Progress.deserialize({ highScore: 5, dailyDone: ["2026-01-01", 7], adsRemoved: "yes" });
    expect(partial.highScore).toBe(5);
    expect(partial.dailyDone("2026-01-01")).toBe(true);
    expect(partial.adsRemoved).toBe(false);
    expect(Progress.deserialize({ highScore: -3 }).highScore).toBe(0);
  });
});
