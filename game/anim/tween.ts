import type { Application } from "pixi.js";

/** Time-based tween using ticker delta (ms). */
export function tween(app: Application, durationMs: number, update: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = (ticker: { deltaMS: number }) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / durationMs);
      update(t);
      if (t >= 1) {
        app.ticker.remove(tick);
        resolve();
      }
    };
    app.ticker.add(tick);
  });
}
