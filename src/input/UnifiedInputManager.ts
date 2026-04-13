import { myPlayer } from "playroomkit";

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

const SWIPE_THRESHOLD = 30;
const GAMEPAD_DEADZONE = 0.5;

export class UnifiedInputManager {
  private scene: Phaser.Scene;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private currentDirection: Direction = "RIGHT";
  private touchStartX = 0;
  private touchStartY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  initialize() {
    // Keyboard: Arrow keys + WASD
    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Touch / swipe: fire as soon as the distance threshold is met during a drag.
    // After firing, reset the start point so a continued drag can trigger again.
    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.touchStartX = pointer.x;
      this.touchStartY = pointer.y;
    });

    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      const deltaX = pointer.x - this.touchStartX;
      const deltaY = pointer.y - this.touchStartY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance < SWIPE_THRESHOLD) return;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.trySetDirection(deltaX > 0 ? "RIGHT" : "LEFT");
      } else {
        this.trySetDirection(deltaY > 0 ? "DOWN" : "UP");
      }

      // Reset origin so the next segment of the drag can fire a new swipe
      this.touchStartX = pointer.x;
      this.touchStartY = pointer.y;
    });

    // Gamepad: log when a controller is detected
    if (this.scene.input.gamepad) {
      this.scene.input.gamepad.once(
        "connected",
        (pad: Phaser.Input.Gamepad.Gamepad) => {
          console.log("[Input] Gamepad connected:", pad.id);
        }
      );
    }

    console.log("[Input] UnifiedInputManager initialized (keyboard, swipe, gamepad)");
  }

  update() {
    this.pollKeyboard();
    this.pollGamepad();
  }

  private pollKeyboard() {
    if (this.cursors.up.isDown || this.wasd.up.isDown) {
      this.trySetDirection("UP");
    } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
      this.trySetDirection("DOWN");
    } else if (this.cursors.left.isDown || this.wasd.left.isDown) {
      this.trySetDirection("LEFT");
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      this.trySetDirection("RIGHT");
    }
  }

  private pollGamepad() {
    const pad = this.scene.input.gamepad?.getPad(0);
    if (!pad) return;

    // D-pad (digital)
    if (pad.up) {
      this.trySetDirection("UP");
    } else if (pad.down) {
      this.trySetDirection("DOWN");
    } else if (pad.left) {
      this.trySetDirection("LEFT");
    } else if (pad.right) {
      this.trySetDirection("RIGHT");
    } else {
      // Left analog stick with deadzone
      const axisX = pad.axes[0]?.getValue() ?? 0;
      const axisY = pad.axes[1]?.getValue() ?? 0;
      if (Math.abs(axisX) > GAMEPAD_DEADZONE || Math.abs(axisY) > GAMEPAD_DEADZONE) {
        if (Math.abs(axisX) > Math.abs(axisY)) {
          this.trySetDirection(axisX > 0 ? "RIGHT" : "LEFT");
        } else {
          this.trySetDirection(axisY > 0 ? "DOWN" : "UP");
        }
      }
    }
  }

  /** Validates the new direction and updates player state if accepted. */
  private trySetDirection(newDir: Direction) {
    if (newDir === this.currentDirection) {
      console.log(`[Input] Swipe ignored — already moving ${newDir}`);
      return;
    }
    if (newDir === OPPOSITE[this.currentDirection]) {
      console.log(`[Input] Swipe ignored — ${newDir} is opposite of current ${this.currentDirection}`);
      return;
    }

    this.currentDirection = newDir;
    console.log(`[Input] Direction → ${newDir}`);
    myPlayer().setState("direction", newDir);
  }
}
