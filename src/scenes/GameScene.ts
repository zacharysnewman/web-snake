import Phaser from "phaser";
import { isHost, myPlayer, getState, setState, onPlayerJoin } from "playroomkit";
import { UnifiedInputManager } from "../input/UnifiedInputManager";
import { LOGICAL_W, LOGICAL_H } from "../constants";

// Grid configuration
const GRID_COLS = 20;
const GRID_ROWS = 16;
const CELL_SIZE = 30;
const GRID_TOP = 70;  // px from canvas top, leaves room for title + score
const TICK_MS = 150;  // physics tick interval in milliseconds

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Vec2 = { x: number; y: number };

const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

const DIR_VEC: Record<Direction, Vec2> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

// Minimal interface matching Playroom's player object shape
interface PlayroomPlayer {
  id: string;
  setState(key: string, value: unknown): void;
  getState(key: string): unknown;
  onQuit(cb: () => void): void;
}

// Per-player interpolation state: lerp between prevBody and currBody
interface PlayerRenderState {
  prevBody: Vec2[];
  currBody: Vec2[];
  lastUpdateTime: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bodiesEqual(a: Vec2[], b: Vec2[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
}

export class GameScene extends Phaser.Scene {
  private inputManager!: UnifiedInputManager;
  private players: PlayroomPlayer[] = [];
  private tickTimer = 0;

  private gridGraphics!: Phaser.GameObjects.Graphics;
  private snakeGraphics!: Phaser.GameObjects.Graphics;
  private foodGraphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;

  private gridOffsetX = 0;

  // Host-only: tracks the last direction actually processed per player
  private lastProcessedDir: Record<string, Direction> = {};

  // Interpolation: per-player render state
  private renderStates: Record<string, PlayerRenderState> = {};

  // Game-phase tracking
  private previousGameState = "";
  private gameOverContainer?: Phaser.GameObjects.Container;
  private youDiedContainer?: Phaser.GameObjects.Container;
  private isRestartPending = false;
  private gamepadAWasDown = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    const width = LOGICAL_W;
    const height = LOGICAL_H;

    // Center the grid horizontally within the logical canvas
    this.gridOffsetX = Math.floor((width - GRID_COLS * CELL_SIZE) / 2);

    // Reset state on scene (re)create
    this.renderStates = {};
    this.previousGameState = "";
    this.isRestartPending = false;
    this.gamepadAWasDown = false;
    this.gameOverContainer = undefined;
    this.youDiedContainer = undefined;

    // Background
    this.add.rectangle(0, 0, width, height, 0x0a0a1a).setOrigin(0, 0);

    // Title
    this.add
      .text(width / 2, 14, "WEB SNAKE", {
        fontSize: "24px",
        color: "#00ff88",
        fontFamily: "monospace",
        stroke: "#004422",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0);

    // Score display
    this.scoreText = this.add
      .text(width / 2, 46, "Score: 0", {
        fontSize: "16px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0);

    // Graphics layers — order determines draw order (grid → food → snake)
    this.gridGraphics = this.add.graphics();
    this.foodGraphics = this.add.graphics();
    this.snakeGraphics = this.add.graphics();

    this.drawGrid();

    // Input
    this.inputManager = new UnifiedInputManager(this);
    this.inputManager.initialize();

    // Register all current and future players.
    // Playroom fires onPlayerJoin for existing players immediately on registration.
    onPlayerJoin((player) => {
      const p = player as unknown as PlayroomPlayer;
      if (!this.players.find((existing) => existing.id === p.id)) {
        this.players.push(p);
      }
      player.onQuit(() => {
        this.players = this.players.filter((existing) => existing.id !== p.id);
        delete this.renderStates[p.id];
      });
    });

    // Host sets up authoritative game state.
    // Small delay gives onPlayerJoin time to fire for all existing players.
    if (isHost()) {
      this.time.delayedCall(200, () => this.initHostState());
    }

    // Fit the logical game area into the physical screen using camera zoom.
    this.fitCamera();
    this.scale.on("resize", this.fitCamera, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.fitCamera, this));
  }

  // ── Camera fit ──────────────────────────────────────────────────────────────

  private fitCamera() {
    const { width, height } = this.scale; // physical canvas pixels
    const zoom = Math.min(width / LOGICAL_W, height / LOGICAL_H);
    this.cameras.main.setZoom(zoom);
    // Centre the logical area in the physical canvas via camera scroll.
    // scrollX/Y is the world-space position of the camera's top-left corner.
    this.cameras.main.setScroll(
      -(width / zoom - LOGICAL_W) / 2,
      -(height / zoom - LOGICAL_H) / 2
    );
  }

  // ── Host initialisation ─────────────────────────────────────────────────────

  private initHostState() {
    this.isRestartPending = false;
    this.spawnFood();

    this.players.forEach((player, index) => {
      // Stagger starting positions horizontally so players don't overlap
      const startX = Math.min(4 + index * 6, GRID_COLS - 4);
      const startY = Math.floor(GRID_ROWS / 2);

      // Snake starts with a length-3 body, facing RIGHT
      const body: Vec2[] = [
        { x: startX + 2, y: startY },
        { x: startX + 1, y: startY },
        { x: startX, y: startY },
      ];

      player.setState("body", body);
      player.setState("isAlive", true);
      player.setState("score", 0);
      player.setState("direction", "RIGHT");
      this.lastProcessedDir[player.id] = "RIGHT";
    });

    setState("gameState", "playing");
  }

  private spawnFood() {
    // Avoid spawning on any occupied cell
    const occupied: Vec2[] = [];
    this.players.forEach((p) => {
      const body = p.getState("body") as Vec2[] | null;
      if (body) occupied.push(...body);
    });

    let x = 0, y = 0;
    let attempts = 0;
    do {
      x = Math.floor(Math.random() * GRID_COLS);
      y = Math.floor(Math.random() * GRID_ROWS);
      attempts++;
    } while (occupied.some((seg) => seg.x === x && seg.y === y) && attempts < 50);

    setState("food", { x, y });
  }

  // ── Phaser update ───────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    // All clients poll local input and push direction to Playroom
    this.inputManager.update();

    const gameState = (getState("gameState") as string) ?? "playing";

    // Detect and respond to game-state transitions
    if (gameState !== this.previousGameState) {
      this.onGameStateChanged(gameState);
      this.previousGameState = gameState;
    }

    // Gamepad A / Start button triggers "Play Again" on game-over screen
    if (gameState === "game_over" && this.gameOverContainer) {
      this.checkGamepadRestart();
    } else {
      this.gamepadAWasDown = false;
    }

    // Only the host advances the physics simulation while playing
    if (gameState === "playing" && isHost()) {
      this.tickTimer += delta;
      if (this.tickTimer >= TICK_MS) {
        this.tickTimer -= TICK_MS;
        this.hostTick();
      }
    }

    // Everyone renders from the authoritative Playroom state
    this.render();

    // Show/hide "YOU DIED" spectator banner
    this.updateYouDiedBanner(gameState);
  }

  // ── Game-state transition handler ───────────────────────────────────────────

  private onGameStateChanged(newState: string) {
    if (newState === "game_over") {
      this.showGameOverOverlay();
    } else if (newState === "playing") {
      this.hideGameOverOverlay();
      // Clear interpolation state so old positions don't carry over
      this.renderStates = {};
    } else if (newState === "restarting") {
      // Host re-initialises game; clients wait for "playing" signal
      if (isHost() && !this.isRestartPending) {
        this.isRestartPending = true;
        this.initHostState();
      }
    }
  }

  // ── Host physics tick ───────────────────────────────────────────────────────

  private hostTick() {
    const food = getState("food") as Vec2 | null;

    type Move = { player: PlayroomPlayer; body: Vec2[]; newHead: Vec2 };
    const moves: Move[] = [];
    const deadThisTick = new Set<string>();

    // ── Step 1: compute new heads, detect wall / self collisions ─────────────
    this.players.forEach((player) => {
      if (!player.getState("isAlive")) return;

      const body = player.getState("body") as Vec2[] | null;
      if (!body || body.length === 0) return;

      // Reconcile requested direction with server-side last direction to
      // prevent a 180° reversal within a single tick
      const requestedDir = (player.getState("direction") as Direction) ?? "RIGHT";
      const lastDir = this.lastProcessedDir[player.id] ?? "RIGHT";
      const actualDir = requestedDir === OPPOSITE[lastDir] ? lastDir : requestedDir;
      this.lastProcessedDir[player.id] = actualDir;

      const vec = DIR_VEC[actualDir];
      const newHead: Vec2 = { x: body[0].x + vec.x, y: body[0].y + vec.y };

      // Wall collision → die
      if (
        newHead.x < 0 ||
        newHead.x >= GRID_COLS ||
        newHead.y < 0 ||
        newHead.y >= GRID_ROWS
      ) {
        deadThisTick.add(player.id);
        return;
      }

      // Self collision → die
      if (body.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
        deadThisTick.add(player.id);
        return;
      }

      moves.push({ player, body, newHead });
    });

    // ── Step 2: head-to-head collision — both players die ────────────────────
    for (let i = 0; i < moves.length; i++) {
      for (let j = i + 1; j < moves.length; j++) {
        if (
          !deadThisTick.has(moves[i].player.id) &&
          !deadThisTick.has(moves[j].player.id) &&
          moves[i].newHead.x === moves[j].newHead.x &&
          moves[i].newHead.y === moves[j].newHead.y
        ) {
          deadThisTick.add(moves[i].player.id);
          deadThisTick.add(moves[j].player.id);
        }
      }
    }

    // ── Step 3: head-to-body collision with OTHER snakes ─────────────────────
    moves.forEach((move) => {
      if (deadThisTick.has(move.player.id)) return;
      this.players.forEach((other) => {
        if (other.id === move.player.id) return;
        if (!(other.getState("isAlive") as boolean)) return;
        const otherBody = other.getState("body") as Vec2[] | null;
        if (!otherBody) return;
        if (otherBody.some((seg) => seg.x === move.newHead.x && seg.y === move.newHead.y)) {
          deadThisTick.add(move.player.id);
        }
      });
    });

    // ── Step 4: commit deaths ────────────────────────────────────────────────
    deadThisTick.forEach((id) => {
      const p = this.players.find((p) => p.id === id);
      p?.setState("isAlive", false);
    });

    // ── Step 5: apply movement for survivors ─────────────────────────────────
    moves.forEach((move) => {
      if (deadThisTick.has(move.player.id)) return;

      // Food collision → grow, respawn food, increment score
      let ate = false;
      if (food && move.newHead.x === food.x && move.newHead.y === food.y) {
        ate = true;
        const score = ((move.player.getState("score") as number) ?? 0) + 1;
        move.player.setState("score", score);
        this.spawnFood();
      }

      // Build new body: prepend new head, pop tail only if no food was eaten
      const newBody = [move.newHead, ...move.body];
      if (!ate) newBody.pop();
      move.player.setState("body", newBody);
    });

    // ── Step 6: check if all players are dead → game over ────────────────────
    const anyAlive = this.players.some((p) => p.getState("isAlive") as boolean);
    if (!anyAlive && this.players.length > 0) {
      setState("gameState", "game_over");
    }
  }

  // ── Overlays ────────────────────────────────────────────────────────────────

  private showGameOverOverlay() {
    if (this.gameOverContainer) return;
    const width = LOGICAL_W;
    const height = LOGICAL_H;

    const container = this.add.container(0, 0);
    this.gameOverContainer = container;

    // Semi-transparent dim
    const bg = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.8)
      .setOrigin(0, 0)
      .setInteractive(); // block clicks reaching the game beneath
    container.add(bg);

    // "GAME OVER" title
    const title = this.add
      .text(width / 2, height * 0.18, "GAME OVER", {
        fontSize: "52px",
        color: "#ff4466",
        fontFamily: "monospace",
        stroke: "#660022",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    container.add(title);

    // Pulsing animation on title
    this.tweens.add({
      targets: title,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Player scores, sorted descending
    const myId = myPlayer()?.id;
    const sorted = [...this.players].sort(
      (a, b) =>
        ((b.getState("score") as number) ?? 0) -
        ((a.getState("score") as number) ?? 0)
    );

    sorted.forEach((player, i) => {
      const score = (player.getState("score") as number) ?? 0;
      const colorHex = (player.getState("color") as string) ?? "#00ff88";
      const isMe = player.id === myId;
      const medal = i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`;
      const label = isMe ? `${medal}  YOU  ${score} pts` : `${medal}  Player ${i + 1}  ${score} pts`;

      const row = this.add
        .text(width / 2, height * 0.36 + i * 34, label, {
          fontSize: "19px",
          color: isMe ? "#ffffff" : colorHex,
          fontFamily: "monospace",
          stroke: isMe ? colorHex : "#000000",
          strokeThickness: isMe ? 2 : 0,
        })
        .setOrigin(0.5);
      container.add(row);
    });

    // ── PLAY AGAIN button ────────────────────────────────────────────────────
    const btnY = height * 0.74;
    const btnW = 260;
    const btnH = 52;

    const btnBg = this.add
      .rectangle(width / 2, btnY, btnW, btnH, 0x006633, 1)
      .setInteractive({ useHandCursor: true });
    const btnText = this.add
      .text(width / 2, btnY, "[ PLAY AGAIN ]", {
        fontSize: "22px",
        color: "#00ff88",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    btnBg.on("pointerover", () => {
      btnBg.setFillStyle(0x00aa55);
      btnText.setColor("#ffffff");
    });
    btnBg.on("pointerout", () => {
      btnBg.setFillStyle(0x006633);
      btnText.setColor("#00ff88");
    });
    btnBg.on("pointerdown", () => this.requestRestart());

    container.add(btnBg);
    container.add(btnText);

    // Hint text for gamepad / keyboard
    const hint = this.add
      .text(width / 2, btnY + 40, "or press  A / Start", {
        fontSize: "13px",
        color: "#555577",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    container.add(hint);

    // Blink effect on button to draw attention
    this.tweens.add({
      targets: btnBg,
      alpha: 0.7,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private hideGameOverOverlay() {
    if (this.gameOverContainer) {
      this.gameOverContainer.destroy();
      this.gameOverContainer = undefined;
    }
  }

  /** Show a small spectator banner when the local player is dead mid-game. */
  private updateYouDiedBanner(gameState: string) {
    const me = myPlayer();
    if (!me) return;

    const myAlive = me.getState("isAlive") as boolean;
    const myHasBody = this.players.some((p) => p.id === me.id && me.getState("body"));
    const shouldShow = myHasBody && !myAlive && gameState === "playing";

    if (shouldShow && !this.youDiedContainer) {
      this.showYouDiedBanner();
    } else if (!shouldShow && this.youDiedContainer) {
      this.youDiedContainer.destroy();
      this.youDiedContainer = undefined;
    }
  }

  private showYouDiedBanner() {
    if (this.youDiedContainer) return;
    const width = LOGICAL_W;

    const container = this.add.container(0, 0);
    this.youDiedContainer = container;

    const banner = this.add
      .text(width / 2, GRID_TOP - 2, "  YOU DIED — spectating  ", {
        fontSize: "14px",
        color: "#ff4466",
        fontFamily: "monospace",
        backgroundColor: "#220011bb",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 1);
    container.add(banner);
  }

  /** Pressing gamepad A (button 0) or Start (button 9) triggers restart. */
  private checkGamepadRestart() {
    const pad = this.input.gamepad?.getPad(0);
    if (!pad) {
      this.gamepadAWasDown = false;
      return;
    }
    const isDown = !!(pad.buttons[0]?.pressed || pad.buttons[9]?.pressed);
    if (isDown && !this.gamepadAWasDown) {
      this.requestRestart();
    }
    this.gamepadAWasDown = isDown;
  }

  private requestRestart() {
    setState("gameState", "restarting");
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  private drawGrid() {
    const gw = GRID_COLS * CELL_SIZE;
    const gh = GRID_ROWS * CELL_SIZE;
    const ox = this.gridOffsetX;
    const oy = GRID_TOP;

    // Subtle grid lines
    this.gridGraphics.lineStyle(1, 0x1a1a3a, 1);
    for (let c = 0; c <= GRID_COLS; c++) {
      this.gridGraphics.lineBetween(
        ox + c * CELL_SIZE, oy,
        ox + c * CELL_SIZE, oy + gh
      );
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      this.gridGraphics.lineBetween(
        ox, oy + r * CELL_SIZE,
        ox + gw, oy + r * CELL_SIZE
      );
    }

    // Bright arena border
    this.gridGraphics.lineStyle(2, 0x00ff88, 0.5);
    this.gridGraphics.strokeRect(ox, oy, gw, gh);
  }

  private render() {
    this.snakeGraphics.clear();
    this.foodGraphics.clear();

    const ox = this.gridOffsetX;
    const oy = GRID_TOP;
    const now = this.time.now;

    // ── Food ─────────────────────────────────────────────────────────────────
    const food = getState("food") as Vec2 | null;
    if (food) {
      const fx = ox + food.x * CELL_SIZE + CELL_SIZE / 2;
      const fy = oy + food.y * CELL_SIZE + CELL_SIZE / 2;
      this.foodGraphics.fillStyle(0xff3355, 1);
      this.foodGraphics.fillCircle(fx, fy, CELL_SIZE / 2 - 4);
    }

    // ── Snakes (with interpolation) ──────────────────────────────────────────
    this.players.forEach((player) => {
      const body = player.getState("body") as Vec2[] | null;
      if (!body || body.length === 0) return;

      // Update render state when body changes
      let rs = this.renderStates[player.id];
      if (!rs) {
        rs = { prevBody: body, currBody: body, lastUpdateTime: now };
        this.renderStates[player.id] = rs;
      } else if (!bodiesEqual(rs.currBody, body)) {
        rs.prevBody = rs.currBody;
        rs.currBody = body;
        rs.lastUpdateTime = now;
      }

      // t = 0 at the moment of a tick update, 1 when the next tick is due
      const t = Math.min((now - rs.lastUpdateTime) / TICK_MS, 1);

      const isAlive = player.getState("isAlive") as boolean;
      const colorHex = (player.getState("color") as string) ?? "#00ff88";
      const colorInt = parseInt(colorHex.replace("#", ""), 16);

      rs.currBody.forEach((seg, i) => {
        // Segments that didn't exist in prevBody (tail growth) snap to position
        const prev = rs.prevBody[i] ?? seg;

        const px = ox + lerp(prev.x, seg.x, t) * CELL_SIZE;
        const py = oy + lerp(prev.y, seg.y, t) * CELL_SIZE;

        if (i === 0) {
          // Head: full cell, full brightness
          this.snakeGraphics.fillStyle(isAlive ? colorInt : 0x334433, 1);
          this.snakeGraphics.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        } else {
          // Body: slightly inset, lower alpha
          this.snakeGraphics.fillStyle(isAlive ? colorInt : 0x222233, 0.6);
          this.snakeGraphics.fillRect(px + 3, py + 3, CELL_SIZE - 6, CELL_SIZE - 6);
        }
      });
    });

    // ── Score / status text ──────────────────────────────────────────────────
    const me = myPlayer();
    const myScore = (me?.getState("score") as number) ?? 0;
    this.scoreText.setText(`Score: ${myScore}`).setColor("#aaaaaa");
  }
}
