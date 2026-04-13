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
  private hasSwiped = false;

  // Bound handlers stored so they can be removed on scene shutdown
  private boundTouchStart!: (e: TouchEvent) => void;
  private boundTouchMove!: (e: TouchEvent) => void;

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

    // Touch / swipe: document-level listeners so swipes work anywhere on screen,
    // not just over the canvas. preventDefault() on every touchmove blocks browser
    // scroll and rubber-band bounce. One swipe fires per finger-down; must lift
    // to swipe again.
    this.boundTouchStart = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.hasSwiped = false;
    };

    this.boundTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // block scroll on every move, even after swipe fires
      if (this.hasSwiped) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance < SWIPE_THRESHOLD) return;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.trySetDirection(deltaX > 0 ? "RIGHT" : "LEFT");
      } else {
        this.trySetDirection(deltaY > 0 ? "DOWN" : "UP");
      }

      this.hasSwiped = true;
    };

    document.addEventListener("touchstart", this.boundTouchStart, { passive: true });
    document.addEventListener("touchmove", this.boundTouchMove, { passive: false });

    // Clean up when the scene shuts down (scene.restart also triggers shutdown)
    this.scene.events.once("shutdown", () => this.destroy());

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

  destroy() {
    document.removeEventListener("touchstart", this.boundTouchStart);
    document.removeEventListener("touchmove", this.boundTouchMove);
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
