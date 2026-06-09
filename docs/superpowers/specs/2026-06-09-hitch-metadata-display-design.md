# Design Spec: Hitch Metadata Display on BMO

This document details the design for enhancing the `hitch-face` desktop widget to display additional metadata emitted from `hitch` (such as harness name, tool name, and payload details) while maintaining BMO's minimal retro aesthetic.

## 1. Objectives

- **Enrich Information Display**: Render harness name and payload details (e.g. active tool, prompts, token cost, etc.).
- **Preserve Aesthetics**: Retain BMO's frameless, always-on-top, minimal retro gaming console layout.
- **On-Demand Depth**: Show high-level status directly on BMO's screen (HUD and scrolling ticker) and allow toggling a full Side Console Drawer by clicking BMO's physical red button.
- **Maintain Center Alignment**: Ensure BMO's body remains centered and still when sliding the console drawer open.

## 2. System Architecture & Data Flow

```
[Hitch Server] 
      │
      │ (feeds event envelope on stdin)
      ▼
[adapter.sh]
      │
      │ (forwards full JSON event payload via HTTP POST)
      ▼
[Electron: main.js (Port 8888)]
      │
      │ (sends payload via IPC 'hitch-event')
      ▼
[Electron: renderer.js (index.html)]
      │
      ├─► Renders Screen HUD (Harness/Action)
      ├─► Scrolls details in Screen Ticker
      └─► Updates Side Console Drawer (Toggled by Red Button click)
```

## 3. Detailed Components & Implementation Plan

### A. Bash Adapter (`adapter.sh`)
- Currently, `adapter.sh` only extracts `hitch_event_type` and posts `{"expression": "$EVENT_TYPE"}`.
- **Update**: Read the full stdin envelope JSON into a variable and POST the entire JSON body directly to `http://127.0.0.1:${PORT}/event`.

### B. Electron Main Process (`main.js`)
- **Resize Window**: Increase window width from `500` to `750` to accommodate the console drawer sliding out to the right without clipping. Keep height at `500`.
- **Center BMO**: Ensure BMO's container remains centered inside the `750px` width.
- **HTTP Server**: 
  - Add a POST `/event` endpoint (while keeping POST `/expression` for backward compatibility/testing).
  - The `/event` endpoint accepts the full Hitch event JSON, sends it to `renderer.js` via `mainWindow.webContents.send('hitch-event', payload)`, and controls window bouncing movement based on `hitch_event_type` (action start/stop events).

### C. HTML Structure (`index.html`)
- **Wrap BMO**: Place BMO inside a wrapper `.bmo-container` to handle relative positioning.
- **HUD & Ticker**: Add `.hud-header` and `.screen-ticker` (with `.ticker-wrap` container) inside the BMO screen element `.bmo-screen`.
- **Side Console Drawer**: Add `.console-drawer` at the same level as `.bmo-body` (behind BMO body) inside the wrapper.
- **Event Listeners**: Ensure BMO's physical red button `.btn-red` is interactive and toggles the drawer.

### D. CSS Styling & Animations (`style.css`)
- **Window & Wrapper Layout**:
  - Keep the app container transparent, centered, and set width to `750px`.
  - Position `.bmo-body` in the absolute center using Flexbox or absolute centering.
- **Console Drawer**:
  - Style `.console-drawer` with a dark slate background (`#1e293b`), custom borders matching BMO's case outline, and a monospaced font (`Share Tech Mono` or fallback `Courier`).
  - Position it on the right side: `left: calc(50% + 145px)` (where `145px` is half of BMO's width).
  - Use `transform: scaleX(0);` and `transform-origin: left center;` by default.
  - When `.drawer-open` class is applied to the container, animate to `transform: scaleX(1);` with a smooth ease-in-out transition.
- **HUD & Ticker**:
  - Render `.hud-header` in small, low-opacity dark green text in the top-left of the screen.
  - Render `.screen-ticker` at the bottom of the screen with a dashed top border, scrolling text horizontally using a `@keyframes ticker` translation animation.
  - Shift BMO's face slightly upward when the ticker is active to keep it balanced.

### E. Frontend Logic (`renderer.js`)
- **IPC Listener**: Listen to `hitch-event`.
- **Metadata Extraction**:
  - Map incoming events and extract:
    - **Harness**: `codex`, `omp`, `hermes`, `pi`, `opencode`, `antigravity`.
    - **Event type**: `tool.requested`, `llm.requested`, etc.
    - **Key Detail**:
      - For `tool.*`: tool `name` and `input` parameters.
      - For `turn.user_prompt`: user `prompt`.
      - For `llm.completed`: `finish_reason`, `usage.tokens`, and `usage.cost`.
      - For other events: general description or event payload.
- **Render UI**:
  - Update HUD header text: `[HARNESS / EVENT_TYPE]`.
  - Update Ticker scrolling text with key details.
  - Update Side Console Drawer text with structured, formatted monospaced log lines showing complete properties of the event.
  - Change BMO's visual states and expressions as before.
- **Drawer Interaction**:
  - Toggle `.drawer-open` class on the container when the red button `.btn-red` is clicked.
  - Automatically close the drawer on `session.ended` or `turn.completed` to keep BMO clean.

## 4. Error Handling & Backwards Compatibility
- If `adapter.sh` sends a partial JSON payload or an old-style payload (`{"expression": "..."}`), the app should fall back gracefully, displaying the expression in standard mode and keeping the console drawer empty or indicating "No payload available".
- HTTP server `/expression` endpoint is preserved to support legacy or custom scripts.

## 5. Verification Plan
- Run `npm run dev` or `hitch-face`.
- Run a modified `test-drive.sh` that posts simulated full JSON payloads (with dummy parameters for tools, turns, token metrics, etc.) and verify:
  1. Real-time screen HUD and ticker updates.
  2. Clicking BMO's red button slides out the Side Console Drawer smoothly.
  3. BMO body and the cartridge stay perfectly centered.
