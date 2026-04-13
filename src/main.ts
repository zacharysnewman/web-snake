import Phaser from "phaser";
import { LobbyScene } from "./scenes/LobbyScene";
import { GameScene } from "./scenes/GameScene";
import { LOGICAL_W, LOGICAL_H } from "./constants";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#0a0a1a",
  scene: [LobbyScene, GameScene],
  width: LOGICAL_W,
  height: LOGICAL_H,
  scale: {
    // This tells Phaser to handle the scaling/centering of the canvas element
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    gamepad: true,
  },
};

new Phaser.Game(config);
