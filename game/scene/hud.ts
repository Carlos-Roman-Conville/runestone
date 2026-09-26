import { type Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { tween } from "../anim/tween.js";
import { BOARD_PX, BOARD_X, BOARD_Y, LOGICAL_H, LOGICAL_W } from "../layout.js";
import { PALETTE } from "../assets/tile.js";

const SMALL = { fill: PALETTE.text, fontSize: 10 } as const;

/** Taps on the game-over screen are ignored this long after it appears, so the last drag's stray tap cannot skip it. */
const GAME_OVER_TAP_GUARD_MS = 600;

const PANEL = { x: 20, y: 124, w: LOGICAL_W - 40, h: 124 } as const;

function button(label: string, x: number, y: number, onTap: () => void): Text {
  const t = new Text({ text: label, style: { fill: PALETTE.text, fontSize: 12 } });
  t.position.set(x, y);
  t.eventMode = "static";
  t.cursor = "pointer";
  t.hitArea = new Rectangle(-6, -6, t.width + 12, t.height + 12);
  t.on("pointertap", onTap);
  return t;
}

/** A framed button, centred on (cx, y): 1 px edge, stone fill, whole logical pixels. */
function framedButton(label: string, cx: number, y: number, w: number, onTap: () => void): Container {
  const c = new Container();
  const h = 20;
  const x = Math.round(cx - w / 2);
  const frame = new Graphics().rect(x, y, w, h).fill({ color: PALETTE.edge }).rect(x + 1, y + 1, w - 2, h - 2).fill({ color: PALETTE.tile });
  const t = new Text({ text: label, style: { fill: PALETTE.text, fontSize: 11 } });
  t.anchor.set(0.5);
  t.position.set(Math.round(cx), Math.round(y + h / 2));
  c.addChild(frame, t);
  c.eventMode = "static";
  c.cursor = "pointer";
  c.hitArea = new Rectangle(x - 4, y - 4, w + 8, h + 8);
  c.on("pointertap", onTap);
  return c;
}

/**
 * Score, streak, best, mode, the daily button, and three modal prompts: game over,
 * the continue offer, and "tap a cell". Prompts resolve promises so the session can
 * await the player. Contains no rules.
 */
export class HudView {
  readonly root = new Container();
  private readonly scoreText: Text;
  private readonly streakText: Text;
  private readonly bestText: Text;
  private readonly modeText: Text;
  private readonly dailyButton: Text;
  private readonly overlay = new Container();
  private readonly overlayText: Text;
  private readonly badge: Text;
  private readonly watchButton: Container;
  private readonly declineButton: Container;
  private readonly hint: Text;
  private readonly saveWarning: Text;
  private overlayTap: (() => void) | null = null;
  private overlayShownAt = 0;
  private offerResolve: ((watch: boolean) => void) | null = null;
  private shownScore = 0;
  private scoreTarget = 0;
  private ticking = false;
  private best = 0;
  private mode: "endless" | "daily" = "endless";
  onDaily: () => void = () => {};

  constructor(private readonly app: Application) {
    this.scoreText = new Text({ text: "0", style: { fill: PALETTE.text, fontSize: 16 } });
    this.scoreText.anchor.set(0, 0.5);
    this.scoreText.position.set(12, 20);
    this.bestText = new Text({ text: "Best 0", style: SMALL });
    this.bestText.position.set(12, 32);
    this.streakText = new Text({ text: "Streak 0", style: SMALL });
    this.streakText.position.set(80, 32);
    this.modeText = new Text({ text: "Endless", style: SMALL });
    this.modeText.position.set(80, 16);
    this.dailyButton = button("Daily", 160, 14, () => this.onDaily());
    this.root.addChild(this.scoreText, this.bestText, this.streakText, this.modeText, this.dailyButton);

    // Wraps inside the stage: the longer continue hints are wider than 216 px on one line.
    this.hint = new Text({ text: "", style: { fill: PALETTE.text, fontSize: 11, align: "center", wordWrap: true, wordWrapWidth: LOGICAL_W - 24, lineHeight: 14 } });
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(LOGICAL_W / 2, LOGICAL_H - 48);
    this.hint.visible = false;
    this.root.addChild(this.hint);

    this.saveWarning = new Text({ text: "This browser isn't saving your progress", style: { fill: PALETTE.accent, fontSize: 9, align: "center" } });
    this.saveWarning.anchor.set(0.5, 0);
    this.saveWarning.position.set(LOGICAL_W / 2, LOGICAL_H - 20);
    this.saveWarning.visible = false;
    this.root.addChild(this.saveWarning);

    // Overlay: a dimmer over everything and a stone panel, so prompt text never sits on busy tiles.
    this.overlay.visible = false;
    this.overlay.eventMode = "static";
    this.overlay.hitArea = new Rectangle(0, 0, LOGICAL_W, LOGICAL_H);
    const shade = new Graphics().rect(BOARD_X, BOARD_Y, BOARD_PX, BOARD_PX).fill({ color: PALETTE.shade, alpha: 0.55 });
    const panel = new Graphics()
      .rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h)
      .fill({ color: PALETTE.panel })
      .rect(PANEL.x, PANEL.y, PANEL.w, 1)
      .rect(PANEL.x, PANEL.y + PANEL.h - 1, PANEL.w, 1)
      .rect(PANEL.x, PANEL.y, 1, PANEL.h)
      .rect(PANEL.x + PANEL.w - 1, PANEL.y, 1, PANEL.h)
      .fill({ color: PALETTE.edge });
    this.badge = new Text({ text: "", style: { fill: PALETTE.accent, fontSize: 12 } });
    this.badge.anchor.set(0.5, 0);
    this.badge.position.set(LOGICAL_W / 2, PANEL.y + 8);
    this.overlayText = new Text({ text: "", style: { fill: PALETTE.text, fontSize: 13, align: "center", lineHeight: 17 } });
    this.overlayText.anchor.set(0.5, 0);
    this.overlayText.position.set(LOGICAL_W / 2, PANEL.y + 26);
    this.watchButton = framedButton("Watch ad", LOGICAL_W / 2 - 38, 208, 68, () => this.resolveOffer(true));
    this.declineButton = framedButton("No thanks", LOGICAL_W / 2 + 38, 208, 68, () => this.resolveOffer(false));
    this.overlay.addChild(shade, panel, this.badge, this.overlayText, this.watchButton, this.declineButton);
    this.overlay.on("pointertap", () => {
      if (this.app.ticker.lastTime - this.overlayShownAt < GAME_OVER_TAP_GUARD_MS) return;
      this.overlayTap?.();
    });
    this.root.addChild(this.overlay);
  }

  /** Streak updates at once; the score counts up over ~250 ms with a small punch on a gain. Best follows live. */
  setScore(score: number, streak: number, animate = true): void {
    this.streakText.text = `Streak ${streak}`;
    this.bestText.text = `Best ${Math.max(this.best, score)}`;
    this.scoreTarget = score;
    if (!animate || score <= this.shownScore) {
      this.shownScore = score;
      this.scoreText.text = String(score);
      return;
    }
    if (this.ticking) return; // the running tick will chase the new target
    this.ticking = true;
    const from = this.shownScore;
    void tween(this.app, 250, (t) => {
      const eased = 1 - (1 - t) * (1 - t);
      this.shownScore = Math.round(from + (this.scoreTarget - from) * eased);
      this.scoreText.text = String(this.shownScore);
      const punch = t < 0.5 ? 1 + 0.25 * (t * 2) : 1.25 - 0.25 * ((t - 0.5) * 2);
      this.scoreText.scale.set(punch);
    }).then(() => {
      this.scoreText.scale.set(1);
      this.shownScore = this.scoreTarget;
      this.scoreText.text = String(this.scoreTarget);
      this.ticking = false;
    });
  }

  setStatus(status: { mode: "endless" | "daily"; best: number; dailyDone: boolean; saveFailing?: boolean }): void {
    this.saveWarning.visible = status.saveFailing === true;
    this.best = status.best;
    this.mode = status.mode;
    this.bestText.text = `Best ${Math.max(status.best, this.scoreTarget)}`;
    this.modeText.text = status.mode === "daily" ? "Daily" : "Endless";
    // While the daily is being played its attempt is already spent (R7), but "Daily done" would read as finished.
    this.dailyButton.text = status.mode === "daily" ? "In daily" : status.dailyDone ? "Daily done" : "Daily";
    this.dailyButton.alpha = status.dailyDone ? 0.5 : 1;
  }

  /**
   * Game over. `best` here is the best before this run (Progress records the run
   * after the animation), so a score above it is a new best.
   */
  showGameOver(score: number, onNewRun: () => void): void {
    if (this.overlay.visible && this.overlayTap) return; // already showing; keep the tap guard's clock
    const newBest = score > 0 && score > this.best;
    this.badge.text = newBest ? "New best!" : "";
    const title = this.mode === "daily" ? "Daily complete" : "Game over";
    const tail = this.mode === "daily" ? "New daily at 00:00 UTC\nTap for an endless run" : "Tap for a new run";
    this.overlayText.text = `${title}\nScore ${score}   Best ${Math.max(this.best, score)}\n\n${tail}`;
    this.watchButton.visible = false;
    this.declineButton.visible = false;
    this.overlayTap = onNewRun;
    this.overlayShownAt = this.app.ticker.lastTime;
    this.overlay.visible = true;
  }

  hideGameOver(): void {
    if (this.offerResolve) return; // an offer is showing; leave it
    this.overlay.visible = false;
    this.overlayTap = null;
  }

  /** The continue offer (R3). Resolves with the player's choice. */
  offerContinue(): Promise<boolean> {
    this.badge.text = "";
    this.overlayText.text = "No moves left.\nWatch an ad to clear\na row and a column?";
    this.watchButton.visible = true;
    this.declineButton.visible = true;
    this.overlayTap = null;
    this.overlay.visible = true;
    return new Promise((resolve) => {
      this.offerResolve = resolve;
    });
  }

  private resolveOffer(watch: boolean): void {
    const r = this.offerResolve;
    if (!r) return;
    this.offerResolve = null;
    this.overlay.visible = false;
    this.watchButton.visible = false;
    this.declineButton.visible = false;
    r(watch);
  }

  /** Transient effects (the combo pop) go under the overlay, so a prompt panel is never covered. */
  addEffect(display: Container): void {
    this.root.addChildAt(display, this.root.getChildIndex(this.overlay));
  }

  showHint(text: string | null): void {
    this.hint.text = text ?? "";
    this.hint.visible = text !== null;
  }
}
