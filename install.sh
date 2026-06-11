#!/bin/bash

set -e

echo "=== Hitch-Face Desktop Widget Installer ==="

APP_DIR="$HOME/.local/share/hitch-face"
BIN_DIR="$HOME/.local/bin"

if [ ! -x "./node_modules/.bin/tsc" ]; then
  echo "Installing local build dependencies..."
  npm install
fi

echo "Building Hitch adapter and zero-native desktop app..."
npm run build

echo "Installing Hitch extension adapter..."
node scripts/install-extension.js

echo "Installing desktop app to $APP_DIR..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/frontend" "$APP_DIR/assets"
cp app/zig-out/bin/hitch-face "$APP_DIR/hitch-face"
cp -R app/frontend/dist "$APP_DIR/frontend/dist"
cp -R app/assets/. "$APP_DIR/assets/"
cp app/app.zon "$APP_DIR/app.zon"

mkdir -p "$BIN_DIR"
LAUNCHER="$BIN_DIR/hitch-face"
echo "Creating launcher script at $LAUNCHER..."
cat << 'EOF' > "$LAUNCHER"
#!/bin/bash
cd "$HOME/.local/share/hitch-face"
exec ./hitch-face "$@"
EOF

chmod +x "$LAUNCHER"

echo "=== Installation complete ==="
echo "Launcher: $LAUNCHER"
echo "Desktop app: $APP_DIR"
echo "Extension adapter: $HOME/.config/hitch/extensions/hitch-face"
echo "Config: $HOME/.config/hitch-face/config.toml"
echo "To run the widget, type: hitch-face"
