import Phaser from "phaser";
import { isHost, myPlayer } from "playroomkit";
import { UnifiedInputManager } from "../input/UnifiedInputManager";

export class GameScene extends Phaser.Scene {
  private inputManager!: UnifiedInputManager;
  private directionText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x0a0a1a).setOrigin(0, 0);

    this.add
      .text(width / 2, 40, "WEB SNAKE", {
        fontSize: "32px",
        color: "#00ff88",
        fontFamily: "monospace",
        stroke: "#004422",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const role = isHost() ? "HOST" : "CLIENT";
    this.add
      .text(width / 2, 80, `Role: ${role}`, {
        fontSize: "16px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Direction display
    this.add
      .text(width / 2, height / 2 - 50, "Current Direction:", {
        fontSize: "18px",
        color: "#666688",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    this.directionText = this.add
      .text(width / 2, height / 2 + 10, "RIGHT", {
        fontSize: "52px",
        color: "#00ff88",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height - 50,
        "WASD / Arrow Keys / Swipe / Gamepad  •  check console for logs",
        {
          fontSize: "13px",
          color: "#444466",
          fontFamily: "monospace",
        }
      )
      .setOrigin(0.5);

    this.inputManager = new UnifiedInputManager(this);
    this.inputManager.initialize();
  }

  update() {
    this.inputManager.update();

    const dir: string = myPlayer()?.getState("direction") ?? "RIGHT";
    this.directionText.setText(dir);
  }
}
