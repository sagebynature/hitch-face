# Hitch Face app

Desktop application runtime for Hitch Face. This directory owns the zero-native host, local API server, session/window orchestration, native window shim, and embedded BMO frontend.

## Commands

```sh
zig build run
zig build test
zig build frontend-build
zig build package -Dpackage-target=macos -Doptimize=ReleaseSmall
```

`zig build run` launches the system-WebView desktop app. `zig build package` writes packages under `zig-out/package/`.

## Frontend

- Source: `frontend/index.html`, `frontend/style.css`, `frontend/renderer.js`
- Production assets: `frontend/dist`
- Dev URL: `http://127.0.0.1:5173/`

The app uses zero-native bridge commands declared in `app.zon` and served by `src/main.zig`.
