import Phaser from "phaser";
import { LobbyScene } from "./scenes/LobbyScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#0a0a1a",
  scene: [LobbyScene, GameScene],
  scale: {
    // Fill the entire viewport so touch events are captured everywhere,
    // including above/below the game area.  Each scene zooms its camera
    // to fit the logical 640×570 game space and centres it on screen.
    mode: Phaser.Scale.RESIZE,
  },
  input: {
    gamepad: true,
  },
};

new Phaser.Game(config);
