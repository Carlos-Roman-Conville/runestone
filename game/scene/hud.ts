import { Container, Text } from "pixi.js";
import { LOGICAL_W } from "../layout.js";
import { PALETTE } from "../assets/tile.js";

export class HudView {
  readonly root = new Container();
  private readonly scoreText: Text;
  private readonly streakText: Text;
  private readonly overlay = new Container();
  private readonly overlayScore: Text;
  private newRunHandler: (() => void) | null = null;

  constructor() {
    this.scoreText = new Text({ text: "0", style: { fill: PALETTE.text, fontSize: 16 } });
    this.scoreText.position.set(12, 16);
    this.streakText = new Text({ text: "Streak 0", style: { fill: PALETTE.text, fontSize: 12 } });
    this.streakText.position.set(120, 20);
    this.root.addChild(this.scoreText, this.streakText);

    this.overlay.visible = false;
    this.overlay.eventMode = "static";
    const panel = new Text({
      text: "Game over\nScore: 0\n\nTap for new run",
      style: { fill: PALETTE.text, fontSize: 14, align: "center" },
    });
    panel.anchor.set(0.5);
    panel.position.set(LOGICAL_W / 2, 192);
    this.overlayScore = panel;
    this.overlay.addChild(panel);
    this.overlay.on("pointertap", () => this.newRunHandler?.());
    this.root.addChild(this.overlay);
  }

  setScore(score: number, streak: number): void {
    this.scoreText.text = String(score);
    this.streakText.text = `Streak ${streak}`;
  }

  showGameOver(score: number, onNewRun: () => void): void {
    this.newRunHandler = onNewRun;
    this.overlayScore.text = `Game over\nScore: ${score}\n\nTap for new run`;
    this.overlay.visible = true;
  }

  hideGameOver(): void {
    this.overlay.visible = false;
  }

}
