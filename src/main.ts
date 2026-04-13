import Phaser from "phaser";
import { LobbyScene } from "./scenes/LobbyScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#0a0a1a",
  scene: [LobbyScene, GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  input: {
    gamepad: true,
  },
};

new Phaser.Game(config);
