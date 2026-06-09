# Hitch Face (BMO Edition)

A native desktop widget showing a beautifully animated, borderless, always-on-top BMO (from Adventure Time) whose expressions respond in real time to Hitch events.

## Features
- **Frameless/Borderless Window**: Clean 500x500px overlay.
- **Always-on-Top**: Stays visible on top of other workspace windows.
- **Interactive & Draggable**: Click and drag BMO's body to position it anywhere on screen.
- **Lightweight Endpoint**: Spawns a local HTTP server on port `8888` receiving `POST /expression` calls.
- **Rich CSS Animations**: Unique expressive faces, blinking console buttons, wiggling limbs, and color schemes corresponding to all 20 Hitch event types.
- **Fail-Safe Hitch Integration**: Integrates directly as an observer shell handler that never blocks your agent.

## Directory Structure
- [main.js](file:///Users/sage/workspace/hitch-face/main.js): Electron process bootstrap, custom bouncing physics, & HTTP endpoint.
- [index.html](file:///Users/sage/workspace/hitch-face/index.html): Layout structure for BMO's casing, retro screen, buttons, and limbs.
- [style.css](file:///Users/sage/workspace/hitch-face/style.css): Vanilla CSS keyframes, variables, and themes mapping expressions to BMO face layouts & colors.
- [renderer.js](file:///Users/sage/workspace/hitch-face/renderer.js): IPC mapping and state transition timers.
- [adapter.sh](file:///Users/sage/workspace/hitch-face/adapter.sh): Bash adapter feeding standard input to `jq` and running `curl`.
- [test-drive.sh](file:///Users/sage/workspace/hitch-face/test-drive.sh): Visual verification shell script to run through all expressions sequentially.

## How to Run

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the Desktop Widget**:
   ```bash
   npm start
   ```

3. **Verify/Test Expressions**:
   In another terminal, run the test-drive script to cycle through all 20 expressions:
   ```bash
   ./test-drive.sh
   ```

## Hitch Integration
The adapter is registered as an observer in your global `~/.config/hitch/config.toml` under the `[handlers.hitch_face]` section:
```toml
[handlers.hitch_face]
type = "shell"
command = ["/bin/bash", "/Users/sage/workspace/hitch-face/adapter.sh"]
hitch_events = ["*"]
kind = "observer"
timeout_ms = 1000
on_error = "fail_open"
on_timeout = "fail_open"
```

Once the Hitch serve daemon is running (e.g. `go run ./cmd/hitch serve`), any event received from Codex, Hermes, Pi, OMP, or OpenCode will automatically update the robot face expression on your screen!
