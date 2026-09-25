/**
 * Daily: one seed per UTC calendar day, so every player gets the same board (R7).
 * Pure functions over a Date; the view decides what "today" is. No timezone math
 * beyond reading the UTC fields, which is what makes two devices agree.
 */

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" in UTC. */
export function dailyKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM" in UTC, for the monthly trophy. */
export function monthKey(date: Date): string {
  return dailyKey(date).slice(0, 7);
}

/** Days in a "YYYY-MM" month. */
export function daysInMonth(yyyyMm: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) throw new RangeError(`Daily: bad month key "${yyyyMm}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
}

/** Every "YYYY-MM-DD" key in a month, in order. */
export function daysOfMonth(yyyyMm: string): string[] {
  const n = daysInMonth(yyyyMm);
  return Array.from({ length: n }, (_, i) => `${yyyyMm}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * The seed for a day. FNV-1a over a namespaced key, so the mapping is a fixed
 * function of the calendar and nothing else; changing this string changes every
 * daily board and would break "same board for everyone" across app versions.
 */
export function dailySeedForKey(key: string): number {
  if (!KEY_RE.test(key)) throw new RangeError(`Daily: bad day key "${key}"`);
  const s = `runestone-daily:${key}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function dailySeed(date: Date): number {
  return dailySeedForKey(dailyKey(date));
}
