import Phaser from "phaser";
import { insertCoin, isHost, myPlayer, onPlayerJoin } from "playroomkit";
import { GAME_VERSION } from "../version";
import { LOGICAL_W, LOGICAL_H } from "../constants";

const PLAYER_COLORS = [
  "#00ff88",
  "#ff4466",
  "#44aaff",
  "#ffdd00",
  "#ff8800",
  "#cc44ff",
];

export class LobbyScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private connectedPlayers: string[] = [];
  private startButton?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "LobbyScene" });
  }

  async create() {
    const width = LOGICAL_W;
    const height = LOGICAL_H;

    // Background
    this.add.rectangle(0, 0, width, height, 0x0a0a1a).setOrigin(0, 0);

    // Title
    this.add
      .text(width / 2, height * 0.15, "WEB SNAKE", {
        fontSize: "48px",
        color: "#00ff88",
        fontFamily: "monospace",
        stroke: "#004422",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Status text
    this.statusText = this.add
      .text(width / 2, height * 0.35, "Connecting to lobby...", {
        fontSize: "18px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Version
    this.add
      .text(width / 2, height - 12, `v${GAME_VERSION}`, {
        fontSize: "12px",
        color: "#333355",
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 1);

    // Players heading
    this.add
      .text(width / 2, height * 0.5, "PLAYERS IN LOBBY", {
        fontSize: "16px",
        color: "#666688",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Initialize Playroom
    try {
      await insertCoin({ skipLobby: false });

      // Assign a color to this player
      const colorIndex =
        Math.floor(Math.random() * PLAYER_COLORS.length);
      myPlayer().setState("color", PLAYER_COLORS[colorIndex]);
      myPlayer().setState("isAlive", false);
      myPlayer().setState("score", 0);

      const roleLabel = isHost() ? "HOST" : "CLIENT";
      this.statusText.setText(
        `Connected as ${roleLabel}\nShare the room link to invite others!`
      );
      this.statusText.setColor("#00ff88");

      this.showStartButton();

      // Listen for players joining
      onPlayerJoin((player) => {
        const id = player.id;
        if (!this.connectedPlayers.includes(id)) {
          this.connectedPlayers.push(id);
        }
        this.refreshPlayerList();

        player.onQuit(() => {
          this.connectedPlayers = this.connectedPlayers.filter(
            (p) => p !== id
          );
          this.refreshPlayerList();
        });
      });
    } catch (err) {
      console.error("Playroom insertCoin error:", err);
      this.statusText.setText("Failed to connect to lobby.\nSee console.");
      this.statusText.setColor("#ff4444");
    }

    this.fitCamera();
    this.scale.on("resize", this.fitCamera, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.fitCamera, this));
  }

  private fitCamera() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const zoom = Math.min(w / LOGICAL_W, h / LOGICAL_H);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setScroll(
      -(w / zoom - LOGICAL_W) / 2,
      -(h / zoom - LOGICAL_H) / 2
    );
  }

  private showStartButton() {
    const width = LOGICAL_W;
    const height = LOGICAL_H;

    this.startButton = this.add
      .text(width / 2, height * 0.85, "[ START GAME ]", {
        fontSize: "22px",
        color: "#00ff88",
        fontFamily: "monospace",
        stroke: "#004422",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.startButton?.setColor("#ffffff"))
      .on("pointerout", () => this.startButton?.setColor("#00ff88"))
      .on("pointerdown", () => this.scene.start("GameScene"));
  }

  private refreshPlayerList() {
    // Clear old texts
    this.playerTexts.forEach((t) => t.destroy());
    this.playerTexts = [];

    const width = LOGICAL_W;
    const startY = LOGICAL_H * 0.58;

    this.connectedPlayers.forEach((id, i) => {
      const label =
        i === 0
          ? `${i + 1}. ${id.slice(0, 8)}... (Host)`
          : `${i + 1}. ${id.slice(0, 8)}...`;

      const text = this.add
        .text(width / 2, startY + i * 28, label, {
          fontSize: "15px",
          color: PLAYER_COLORS[i % PLAYER_COLORS.length],
          fontFamily: "monospace",
        })
        .setOrigin(0.5);

      this.playerTexts.push(text);
    });
  }
}
