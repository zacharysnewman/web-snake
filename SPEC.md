# Web Snake — Technical Specification

## 1. Game Overview

A real-time, cross-platform multiplayer survival take on the classic Snake game. Players join a shared arena via browser or mobile device, eat food to grow, and try to survive the longest. The game features seamless cross-input support, allowing mobile, desktop, and console controller players to compete equitably.

## 2. Technology Stack

| Concern | Technology |
|---|---|
| Game Engine | Phaser 3 (rendering, unified local input management, game loop) |
| Multiplayer Networking | Playroom Kit (lobbies, player states, state sync, host-client architecture) |
| Language / Bundler | TypeScript or JavaScript / Vite |
| Input Management | Native Phaser 3 Input Plugins (Keyboard, Pointer/Touch, Gamepad) |

## 3. Architecture & Networking Model

The game uses Playroom Kit's **Host-Client architecture**.

- **The Host (Authoritative):** The first player becomes the Host. Their device runs the physics tick, updates snake positions, handles all collisions, and pushes the authoritative state to Playroom.
- **The Clients:** Other players' devices act as dumb terminals. They capture local input (swipe, keyboard, or gamepad), translate it into a standardized "direction" intent, send it to the Host via Playroom, and render the global state received from the Host.

## 4. Data Models & State Management

### Global State (Managed by Playroom `setState` / `getState`)

| Field | Type | Description |
|---|---|---|
| `gameState` | String | `"lobby"`, `"playing"`, or `"game_over"` |
| `food` | Object | `{ x: int, y: int }` |

### Player State (Managed by Playroom `player.setState` / `player.getState`)

| Field | Type | Description |
|---|---|---|
| `color` | String | Hex color code assigned on join |
| `direction` | String | `"UP"`, `"DOWN"`, `"LEFT"`, or `"RIGHT"` — set by the client via the Unified Input Manager |
| `body` | Array | `[{x, y}, {x, y}, ...]` — set by the Host |
| `isAlive` | Boolean | Whether the player is still alive |
| `score` | Integer | Current score |

## 5. Unified Input Management (Client-Side)

Clients run a **Unified Input Manager** in their Phaser update loop. This manager listens to all supported devices simultaneously and funnels them into a single direction state update.

### A. Keyboard Input (Desktop)

- Map both WASD and Arrow Keys using `Phaser.Input.Keyboard`.
- Logic:
  ```js
  if (cursors.up.isDown || wasd.up.isDown) setDirection("UP");
  ```

### B. Touch / Swipe Input (Mobile)

- Use `Phaser.Input.Pointer` to track touch coordinates.
- **Logic:** Record pointer coordinates on `pointerdown`. On `pointerup` (or continuously on `pointermove`), calculate the delta between the start and end coordinates.
- **Threshold:** Minimum distance of 30 pixels so simple taps are not registered as swipes.
- **Axis Detection:**
  - If `Math.abs(deltaX) > Math.abs(deltaY)` → horizontal swipe
    - `deltaX > 0` → `"RIGHT"`
    - `deltaX < 0` → `"LEFT"`
  - If `Math.abs(deltaY) > Math.abs(deltaX)` → vertical swipe
    - `deltaY > 0` → `"DOWN"`
    - `deltaY < 0` → `"UP"`

### C. Gamepad / Controller Input

- Enable Phaser's Gamepad plugin: `this.input.gamepad.once('connected', ...)`
- **D-Pad Logic:** Map standard D-pad buttons (`pad.up`, `pad.down`, `pad.left`, `pad.right`).
- **Joystick Logic:** Read the left analog stick axes (`pad.axes[0]` for X, `pad.axes[1]` for Y). Apply a deadzone threshold (e.g., `> 0.5` or `< -0.5`) to prevent drift.

### Input Validation

Before calling `myPlayer.setState("direction", newDir)`, the client checks whether `newDir` is the direct opposite of the current local direction to prevent immediate self-collision.

## 6. Menu Navigation & UI

Playroom Kit's `insertCoin()` automatically provides a standardized lobby overlay (QR codes, room sharing, player avatars). Custom in-game menus (e.g., "Ready Up", "Play Again") require explicit cross-device support.

### A. Interactive UI Elements

- **HTML/DOM Overlay (Recommended):** Use absolute-positioned HTML buttons over the Phaser canvas. This ensures native mobile touch targets and accessibility.
- **Phaser UI:** If using in-engine UI, use `setInteractive()` on text or images to support mouse clicks and mobile taps.

### B. Controller Menu Navigation

- When a Gamepad is detected on a menu screen, hijack D-pad/Joystick inputs to cycle through an array of UI buttons.
- Apply a visual highlight (e.g., yellow border or scaling effect) to the currently focused menu item.
- Map the Gamepad's primary action button (`pad.A`) or the Start button to trigger the focused menu item's click event.

## 7. The Game Loop (`Phaser update`)

### Host (`isHost() === true`)

- **Physics Tick:** Run logic every 100–150 ms.
- **Movement & Validation:** Read each player's `direction`. Calculate the new head position. Validate that the new direction is not opposite to the *last processed* direction for that snake to prevent 1-tick self-decapitation.
- **Collisions:** Check for:
  - Food — grow the snake, spawn new food.
  - Walls — set `isAlive` to `false`.
  - Other snakes — set `isAlive` to `false`.
- **State Sync:** Update and push the new `body` arrays to Playroom.

### Client (`isHost() === false`)

- **Input Polling:** Run the Unified Input Manager (Keyboard, Swipe, Gamepad). If an intent is detected, call `myPlayer.setState("direction", newDir)`.
- **Rendering:** Read the global Playroom state. Clear the canvas and draw all snakes based strictly on the authoritative coordinates from the Host. Use Phaser tweens for smooth visual interpolation between the 100 ms grid ticks.

## 8. MVP Milestone Plan

| Milestone | Goal |
|---|---|
| **1 — Environment & Lobby** | Set up Vite, Phaser, and Playroom `insertCoin()`. Get a basic canvas on screen and confirm multiple devices can connect to the room. |
| **2 — Unified Input System** | Build the local client input manager. Implement and test Keyboard, Swipe (with deadzones/thresholds), and Gamepad detection logging to the console. |
| **3 — Single-Player Host Logic** | Build the host loop. Implement grid movement based on incoming input state, food spawning, growing, and wall collisions for a single player. |
| **4 — Multiplayer Sync & Interpolation** | Ensure the Host calculates movement for all players. Have clients render state accurately and smoothly tween between coordinates. |
| **5 — Combat & UI** | Implement snake-on-snake collisions. Add Gamepad/Touch-friendly UI overlays for "Game Over" and "Play Again" states. |
