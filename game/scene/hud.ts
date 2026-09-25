import { Container, Rectangle, Text } from "pixi.js";
import { LOGICAL_H, LOGICAL_W } from "../layout.js";
import { PALETTE } from "../assets/tile.js";

const SMALL = { fill: PALETTE.text, fontSize: 10 } as const;

function button(label: string, x: number, y: number, onTap: () => void): Text {
  const t = new Text({ text: label, style: { fill: PALETTE.text, fontSize: 12 } });
  t.position.set(x, y);
  t.eventMode = "static";
  t.cursor = "pointer";
  t.hitArea = new Rectangle(-6, -6, t.width + 12, t.height + 12);
  t.on("pointertap", onTap);
  return t;
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
  private readonly watchButton: Text;
  private readonly declineButton: Text;
  private readonly hint: Text;
  private overlayTap: (() => void) | null = null;
  private offerResolve: ((watch: boolean) => void) | null = null;
  onDaily: () => void = () => {};

  constructor() {
    this.scoreText = new Text({ text: "0", style: { fill: PALETTE.text, fontSize: 16 } });
    this.scoreText.position.set(12, 12);
    this.bestText = new Text({ text: "Best 0", style: SMALL });
    this.bestText.position.set(12, 32);
    this.streakText = new Text({ text: "Streak 0", style: SMALL });
    this.streakText.position.set(80, 32);
    this.modeText = new Text({ text: "Endless", style: SMALL });
    this.modeText.position.set(80, 16);
    this.dailyButton = button("Daily", 160, 14, () => this.onDaily());
    this.root.addChild(this.scoreText, this.bestText, this.streakText, this.modeText, this.dailyButton);

    this.hint = new Text({ text: "", style: { fill: PALETTE.text, fontSize: 11, align: "center" } });
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(LOGICAL_W / 2, LOGICAL_H - 48);
    this.hint.visible = false;
    this.root.addChild(this.hint);

    this.overlay.visible = false;
    this.overlay.eventMode = "static";
    this.overlay.hitArea = new Rectangle(0, 0, LOGICAL_W, LOGICAL_H);
    this.overlayText = new Text({ text: "", style: { fill: PALETTE.text, fontSize: 14, align: "center" } });
    this.overlayText.anchor.set(0.5);
    this.overlayText.position.set(LOGICAL_W / 2, 170);
    this.watchButton = button("Watch ad", 0, 210, () => this.resolveOffer(true));
    this.declineButton = button("No thanks", 0, 210, () => this.resolveOffer(false));
    this.watchButton.anchor.set(0.5, 0);
    this.declineButton.anchor.set(0.5, 0);
    this.watchButton.position.x = LOGICAL_W / 2 - 40;
    this.declineButton.position.x = LOGICAL_W / 2 + 40;
    this.overlay.addChild(this.overlayText, this.watchButton, this.declineButton);
    this.overlay.on("pointertap", () => this.overlayTap?.());
    this.root.addChild(this.overlay);
  }

  setScore(score: number, streak: number): void {
    this.scoreText.text = String(score);
    this.streakText.text = `Streak ${streak}`;
  }

  setStatus(status: { mode: "endless" | "daily"; best: number; dailyDone: boolean }): void {
    this.bestText.text = `Best ${status.best}`;
    this.modeText.text = status.mode === "daily" ? "Daily" : "Endless";
    this.dailyButton.text = status.dailyDone ? "Daily done" : "Daily";
    this.dailyButton.alpha = status.dailyDone ? 0.5 : 1;
  }

  showGameOver(score: number, onNewRun: () => void): void {
    this.overlayText.text = `Game over\nScore: ${score}\n\nTap for new run`;
    this.watchButton.visible = false;
    this.declineButton.visible = false;
    this.overlayTap = onNewRun;
    this.overlay.visible = true;
  }

  hideGameOver(): void {
    if (this.offerResolve) return; // an offer is showing; leave it
    this.overlay.visible = false;
    this.overlayTap = null;
  }

  /** The continue offer (R3). Resolves with the player's choice. */
  offerContinue(): Promise<boolean> {
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

  showHint(text: string | null): void {
    this.hint.text = text ?? "";
    this.hint.visible = text !== null;
  }
}
