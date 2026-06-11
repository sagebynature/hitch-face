# Hitch Face native shell

Zero-native host for Hitch Face. The root project owns scripts and packaging; this directory contains the Zig host, zero-native manifest, native window shim, and browser frontend assets.

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
