# Hitch Face (BMO Edition)
<img width="500" height="500" alt="image" src="https://github.com/user-attachments/assets/3c97c473-a3b7-4880-9852-a0c1121bbe38" />


Animated desktop BMO widget that mirrors Hitch events in real time.

## Features

- **Frameless/Borderless Widget**: overlay that stays above other windows.
- **Interactive & Draggable**: Position the widget anywhere on screen.
- **Local Event Endpoint**: Starts a local HTTP endpoint at `127.0.0.1:8888`.
- **Expression Mapping**: Supports all standard Hitch event types (session/turn/llm/tool/retry/subagent/error).
- **Session-aware UI**: Keeps one window per `session_id`.
- **Fail-safe Integration**: Hitch observer path never blocks the agent and recovers on malformed input.

## Project Files

- `native/src/main.zig`: zero-native host, HTTP endpoint (`/event`, `/expression`), window/session orchestration.
- `native/frontend/index.html`: Widget markup.
- `native/frontend/style.css`: Styling and per-expression themes.
- `native/frontend/renderer.js`: zero-native bridge event rendering, sound effects, metadata display.
- `src/adapter.ts`: Dependency-free Hitch adapter source that forwards events to the local endpoint.
- `config.toml`: Runtime configuration options.
- `hitch-extension.toml`: Hitch extension manifest installed as `~/.config/hitch/extensions/hitch-face/config.toml`.
- `install.sh`: Optional install/launcher helper.
- `test-drive.sh`: Sends sample events for manual verification.
- `tests/extract-metadata.test.js`: Unit test for metadata extraction.
- `tests/adapter.test.js`: Integration test for adapter forwarding/fail-open behavior.

- `scripts/install-extension.js`: Shared installer helper for Hitch detection, extension install, and config seeding.
- `native/app.zon`: zero-native app manifest.
- `Makefile`: Source build, test, install, and packaging targets.

## Requirements

- macOS for the current locally verified zero-native package. Windows/Linux package targets are wired for CI verification.
- [Hitch](https://github.com/sagebynature/hitch) for event integration.
- Node.js 22.12+, npm, and Zig 0.16.
  - Source builds use Node/npm for the Hitch adapter and frontend assets.
  - Packaged/source installs still require `node` where Hitch runs the extension because the Hitch extension manifest executes `command = ["node", "adapter.js"]`.
- `bash` and `curl` are only needed for the source install script and `test-drive.sh`.

Install Hitch first if it is not already installed:

```bash
curl -fsSL https://raw.githubusercontent.com/sagebynature/hitch/main/scripts/install.sh | sh
```

## Install

### Option A — Release installer

Download the artifact from the GitHub release matching the semantic version you want.

- macOS: run the packaged zero-native app artifact.
- Windows/Linux: package targets are wired in CI; verify platform artifacts before publishing them as supported.

During install, Hitch Face checks for Hitch and installs the extension into Hitch when Hitch is present. If Hitch is missing, the app install can still complete, but event integration will not work until Hitch is installed and the extension helper is rerun.

### Option B — Build/run from source

```bash
git clone https://github.com/sagebynature/hitch-face.git
cd hitch-face
make deps
make test
make start
```

Useful Makefile targets:

```bash
make build              # Build the Hitch adapter and zero-native app
make test               # Run unit/integration tests
make install-extension  # Install only the Hitch extension/config
make install-local      # Source install app + extension + CLI launcher
make package-mac        # Build macOS zero-native package on macOS
make package-win        # Build Windows package on Windows/CI
make package-linux      # Build Linux package on Linux/CI
```

### Option C — Source install script

```bash
curl -fsSL https://raw.githubusercontent.com/sagebynature/hitch-face/main/install.sh | sh
```

This installs:

- `~/.config/hitch/extensions/hitch-face` (adapter-only Hitch extension)
- `~/.local/share/hitch-face` (zero-native desktop app)
- `~/.local/bin/hitch-face` (launcher)

And installs a default config file at:

- `~/.config/hitch-face/config.toml`

Run with:

```bash
hitch-face
```

## Runtime configuration

Edit `~/.config/hitch-face/config.toml` to configure the desktop widget process.
This file is read by the zero-native host when it starts; the Hitch adapter does not read it.

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

Installer packages and `install.sh` write a Hitch extension manifest to:

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
- If the installer reports that Hitch is missing, install Hitch with `curl -fsSL https://raw.githubusercontent.com/sagebynature/hitch/main/scripts/install.sh | sh`, then run `make install-extension` from source or rerun the installed helper.
- If the installer reports that Node is missing, install Node.js 22.12+; Hitch needs `node` on `PATH` to execute the adapter.
