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
- `src/adapter.ts`: Dependency-free Hitch adapter source that forwards events to the local endpoint.
- `config.toml`: Runtime configuration options.
- `hitch-extension.toml`: Hitch extension manifest installed as `~/.config/hitch/extensions/hitch-face/config.toml`.
- `install.sh`: Optional install/launcher helper.
- `test-drive.sh`: Sends sample events for manual verification.
- `tests/extract-metadata.test.js`: Unit test for metadata extraction.
- `tests/adapter.test.js`: Integration test for adapter forwarding/fail-open behavior.

## Requirements

- Linux/macOS desktop environment (X11/Wayland or macOS windowing).
- Node.js 22.12+ and npm.
- `bash` and `curl` are only needed for the optional install script and `test-drive.sh`; the installed Hitch adapter runs with `node` and has no `bash`, `jq`, or `curl` dependency.

## Install

### Option A — Run from source

```bash
git clone https://github.com/sagebynature/hitch-face.git
cd hitch-face
npm install
npm start
```

### Option B — Install script

```bash
chmod +x install.sh
./install.sh
```

This installs:

- `~/.config/hitch/extensions/hitch-face` (adapter-only Hitch extension)
- `~/.local/share/hitch-face` (Electron desktop app)
- `~/.local/bin/hitch-face` (launcher)

And installs a default config file at:

- `~/.config/hitch-face/config.toml`

Run with:

```bash
hitch-face
```

## Runtime configuration

Edit `~/.config/hitch-face/config.toml` to configure the desktop widget process.
This file is read by Electron when it starts; the Hitch adapter does not read it.

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

`install.sh` writes a Hitch extension manifest to:

```text
~/.config/hitch/extensions/hitch-face/config.toml
```

Hitch scans that directory automatically. The manifest registers the Node adapter with the extension directory as its working directory:

```toml
name = "hitch_face"
type = "shell"
command = ["node", "adapter.js"]
hitch_events = ["*"]
kind = "observer"
timeout_ms = 1000
on_error = "fail_open"
on_timeout = "fail_open"
```

By default, `adapter.js` posts events to `http://127.0.0.1:8888/event`. Override
the destination with `HITCH_FACE_URL` when Hitch runs somewhere other than the
desktop host running the widget:

```toml
command = ["env", "HITCH_FACE_URL=http://host.docker.internal:8888/event", "node", "adapter.js"]
```

For remote hosts, prefer an SSH tunnel and keep the widget bound to localhost:

```bash
ssh -R 8888:127.0.0.1:8888 remote-host
```

## Manual test

With the widget running, run:

```bash
./test-drive.sh
```

That will POST all supported expressions in sequence to `http://127.0.0.1:8888/expression`.

## Directory and event troubleshooting

- If no widget appears, confirm no other process is occupying the configured `port`.
- If Hitch runs in Docker or remotely, set `HITCH_FACE_URL` in the Hitch extension manifest to the widget's reachable `/event` URL.
- Ensure `node` is available where Hitch runs the adapter.