import Phaser from "phaser";
import { insertCoin, isHost, myPlayer, onPlayerJoin } from "playroomkit";

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

  constructor() {
    super({ key: "LobbyScene" });
  }

  async create() {
    const { width, height } = this.scale;

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
  }

  private refreshPlayerList() {
    // Clear old texts
    this.playerTexts.forEach((t) => t.destroy());
    this.playerTexts = [];

    const { width, height } = this.scale;
    const startY = height * 0.58;

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
