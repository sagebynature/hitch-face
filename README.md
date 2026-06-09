# Hitch Face (BMO Edition)

Animated desktop BMO widget that mirrors Hitch events in real time.

## Features

- **Frameless/Borderless Widget**: Frameless 750x500 overlay that stays above other windows.
- **Always-on-Top**: Always visible by default.
- **Interactive & Draggable**: Position the widget anywhere on screen.
- **Local Event Endpoint**: Starts a local HTTP endpoint at `127.0.0.1:8888`.
- **Expression Mapping**: Supports all standard Hitch event types (session/turn/llm/tool/retry/subagent/error).
- **Session-aware UI**: Keeps one window per `session_id`.
- **Fail-safe Integration**: Hitch observer path never blocks the agent and recovers on malformed input.

## Project Files

- `main.js`: Electron bootstrap, HTTP endpoint (`/event`, `/expression`), window/session orchestration.
- `index.html`: Widget markup.
- `style.css`: Styling and per-expression themes.
- `renderer.js`: IPC event rendering, sound effects, metadata display.
- `adapter.sh`: Hitch shell handler that posts events to the local endpoint.
- `config.toml`: Runtime configuration options.
- `install.sh`: Optional install/launcher helper.
- `test-drive.sh`: Sends sample events for manual verification.
- `tests/extract-metadata.test.js`: Unit test for metadata extraction.

## Requirements

- Linux/macOS desktop environment (X11/Wayland or macOS windowing).
- Node.js and npm.
- `bash`, `jq`, and `curl` available in `PATH`.

## Install

### Option A — Run from source

```bash
git clone https://github.com/sagebynature/hitch
cd hitch
npm install
npm start
```

### Option B — Install script

```bash
chmod +x install.sh
./install.sh
```

This copies the extension to:

- `~/.config/hitch/extensions/hitch-face` (app files)
- `~/.local/bin/hitch-face` (launcher)

And installs a default config file at:

- `~/.config/hitch-face/config.toml`

Run with:

```bash
hitch-face
```

## Runtime configuration

Edit `~/.config/hitch-face/config.toml`.

```toml
movement_enabled = false
speed = 1.0
interval_ms = 100
port = 8888
ticker_speed_s = 5
buffer_size = 500

[colors]
pi = "#4ca8a1"
antigravity = "#de8a1d"
```

## Event API

Widget listens on:

- `POST /event`
- `POST /expression` (legacy compatibility)

### `/event` payload

```json
{
  "hitch_event_type": "turn.assistant_completed",
  "session_id": "my-session-id",
  "harness": "codex",
  "payload": {
    "tool": {
      "name": "calculator"
    }
  }
}
```

### `/expression` payload

```json
{ "expression": "turn.assistant_completed" }
```

When using `/expression`, no `session_id` is required and session is created as `default-session` with harness set to `omp`.

## Verify Hitch wiring

Edit (or create) `~/.config/hitch/config.toml` and add:

```toml
[handlers.hitch_face]
type = "shell"
command = ["/bin/bash", "/ABSOLUTE/PATH/TO/hitch-face/adapter.sh"]
hitch_events = ["*"]
kind = "observer"
timeout_ms = 1000
on_error = "fail_open"
on_timeout = "fail_open"
```

Notes:

- Replace `/ABSOLUTE/PATH/TO/hitch-face/adapter.sh` with the actual path where `adapter.sh` lives.
- If you used `install.sh`, use `~/.config/hitch/extensions/hitch-face/adapter.sh`.

## Manual test

With the widget running, run:

```bash
./test-drive.sh
```

That will POST all supported expressions in sequence to `http://127.0.0.1:8888/expression`.

## Directory and event troubleshooting

- If no widget appears, confirm no other process is occupying the configured `port`.
- If a custom port is used, set the same value in `~/.config/hitch-face/config.toml`.
- Ensure `adapter.sh` can run and that `jq`/`curl` are installed.