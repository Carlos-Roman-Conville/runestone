import { describe, expect, it } from "vitest";
import { dailyKey, dailySeed, dailySeedForKey, daysInMonth, daysOfMonth, monthKey } from "../engine/daily.js";

describe("Daily (R7)", () => {
  it("key is the UTC calendar day, boundary at 23:59:59Z vs 00:00:00Z", () => {
    expect(dailyKey(new Date("2026-09-25T23:59:59.999Z"))).toBe("2026-09-25");
    expect(dailyKey(new Date("2026-09-26T00:00:00.000Z"))).toBe("2026-09-26");
  });

  it("key ignores local timezone: the same instant gives the same key everywhere", () => {
    // 2026-09-25T22:00-05:00 is 2026-09-26T03:00Z. A local-time key would say the 25th.
    expect(dailyKey(new Date("2026-09-25T22:00:00-05:00"))).toBe("2026-09-26");
  });

  it("two dates, two seeds; the same date, the same seed", () => {
    const a = dailySeed(new Date("2026-09-25T10:00:00Z"));
    const b = dailySeed(new Date("2026-09-26T10:00:00Z"));
    const a2 = dailySeed(new Date("2026-09-25T20:30:00Z"));
    expect(a).not.toBe(b);
    expect(a).toBe(a2);
  });

  it("seed is a pinned function of the key (changing it would change every daily board)", () => {
    // If this value moves, every player's daily board moves with it. Do not update casually.
    expect(dailySeedForKey("2026-09-25")).toBe(dailySeedForKey("2026-09-25"));
    expect(dailySeedForKey("2026-09-25")).toBe(2443419444);
    expect(Number.isInteger(dailySeedForKey("2000-01-01"))).toBe(true);
    expect(() => dailySeedForKey("2026-9-25")).toThrow(RangeError);
  });

  it("month helpers", () => {
    expect(monthKey(new Date("2026-02-10T00:00:00Z"))).toBe("2026-02");
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysOfMonth("2026-02")[0]).toBe("2026-02-01");
    expect(daysOfMonth("2026-02").at(-1)).toBe("2026-02-28");
    expect(() => daysInMonth("2026")).toThrow(RangeError);
  });
});
