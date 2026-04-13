import Phaser from "phaser";
import { isHost, myPlayer, getState, setState, onPlayerJoin } from "playroomkit";
import { UnifiedInputManager } from "../input/UnifiedInputManager";

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

export class GameScene extends Phaser.Scene {
  private inputManager!: UnifiedInputManager;
  private players: PlayroomPlayer[] = [];
  private tickTimer = 0;

  private gridGraphics!: Phaser.GameObjects.Graphics;
  private snakeGraphics!: Phaser.GameObjects.Graphics;
  private foodGraphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;

  private gridOffsetX = 0;

  // Host-only: tracks the last direction that was actually processed per player
  // to prevent 180° reversals across tick boundaries
  private lastProcessedDir: Record<string, Direction> = {};

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    const { width, height } = this.scale;

    // Center the grid horizontally
    this.gridOffsetX = Math.floor((width - GRID_COLS * CELL_SIZE) / 2);

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
      });
    });

    // Host sets up authoritative game state.
    // Small delay gives onPlayerJoin time to fire for all existing players.
    if (isHost()) {
      this.time.delayedCall(200, () => this.initHostState());
    }
  }

  // ── Host initialisation ─────────────────────────────────────────────────────

  private initHostState() {
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
    const x = Math.floor(Math.random() * GRID_COLS);
    const y = Math.floor(Math.random() * GRID_ROWS);
    setState("food", { x, y });
  }

  // ── Phaser update ───────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    // All clients poll local input and push direction to Playroom
    this.inputManager.update();

    // Only the host advances the physics simulation
    if (isHost()) {
      this.tickTimer += delta;
      if (this.tickTimer >= TICK_MS) {
        this.tickTimer -= TICK_MS;
        this.hostTick();
      }
    }

    // Everyone renders from the authoritative Playroom state
    this.render();
  }

  // ── Host physics tick ───────────────────────────────────────────────────────

  private hostTick() {
    const food = getState("food") as Vec2 | null;

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

      // Advance head one cell in the chosen direction
      const vec = DIR_VEC[actualDir];
      const newHead: Vec2 = { x: body[0].x + vec.x, y: body[0].y + vec.y };

      // Wall collision → die
      if (
        newHead.x < 0 ||
        newHead.x >= GRID_COLS ||
        newHead.y < 0 ||
        newHead.y >= GRID_ROWS
      ) {
        player.setState("isAlive", false);
        return;
      }

      // Self collision → die
      if (body.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
        player.setState("isAlive", false);
        return;
      }

      // Food collision → grow, respawn food, increment score
      let ate = false;
      if (food && newHead.x === food.x && newHead.y === food.y) {
        ate = true;
        const score = ((player.getState("score") as number) ?? 0) + 1;
        player.setState("score", score);
        this.spawnFood();
      }

      // Build new body: prepend new head, pop tail only if no food was eaten
      const newBody = [newHead, ...body];
      if (!ate) newBody.pop();
      player.setState("body", newBody);
    });
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

    // Draw food
    const food = getState("food") as Vec2 | null;
    if (food) {
      const fx = ox + food.x * CELL_SIZE + CELL_SIZE / 2;
      const fy = oy + food.y * CELL_SIZE + CELL_SIZE / 2;
      this.foodGraphics.fillStyle(0xff3355, 1);
      this.foodGraphics.fillCircle(fx, fy, CELL_SIZE / 2 - 4);
    }

    // Draw all snakes
    this.players.forEach((player) => {
      const body = player.getState("body") as Vec2[] | null;
      if (!body) return;

      const isAlive = player.getState("isAlive") as boolean;
      const colorHex = (player.getState("color") as string) ?? "#00ff88";
      const colorInt = parseInt(colorHex.replace("#", ""), 16);

      body.forEach((seg, i) => {
        const sx = ox + seg.x * CELL_SIZE;
        const sy = oy + seg.y * CELL_SIZE;

        if (i === 0) {
          // Head: full cell, full brightness
          this.snakeGraphics.fillStyle(isAlive ? colorInt : 0x334433, 1);
          this.snakeGraphics.fillRect(sx + 1, sy + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        } else {
          // Body: inset slightly, lower alpha
          this.snakeGraphics.fillStyle(isAlive ? colorInt : 0x222233, 0.6);
          this.snakeGraphics.fillRect(sx + 3, sy + 3, CELL_SIZE - 6, CELL_SIZE - 6);
        }
      });
    });

    // Update score / status text for the local player
    const me = myPlayer();
    const myScore = (me?.getState("score") as number) ?? 0;
    const myAlive = (me?.getState("isAlive") as boolean) ?? false;
    const myBodySet = this.players.some((p) => p.id === me?.id && me?.getState("body"));

    if (myBodySet && !myAlive) {
      this.scoreText.setText(`Score: ${myScore}  —  GAME OVER`).setColor("#ff4466");
    } else {
      this.scoreText.setText(`Score: ${myScore}`).setColor("#aaaaaa");
    }
  }
}
