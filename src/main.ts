import Phaser from "phaser";
import { LobbyScene } from "./scenes/LobbyScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#0a0a1a",
  scene: [LobbyScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 640,   // 20-col grid (600px) + 20px margin each side
    height: 570,  // header (70px) + 16-row grid (480px) + 20px bottom margin
  },
  input: {
    gamepad: true,
  },
};

new Phaser.Game(config);
