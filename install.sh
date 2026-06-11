#!/bin/bash

# Exit on error
set -e

echo "=== Hitch-Face Desktop Widget Installer ==="

# Define directories
APP_DIR="$HOME/.local/share/hitch-face"
BIN_DIR="$HOME/.local/bin"

# Ensure local build tooling is available, then compile the dependency-free
# Hitch adapter that the extension runs.
if [ ! -x "./node_modules/.bin/tsc" ]; then
  echo "Installing local build dependencies..."
  npm install
fi

echo "Building Hitch adapter..."
npm run build:adapter

echo "Installing Hitch extension adapter..."
node scripts/install-extension.js
# Install the Electron desktop app separately from the Hitch extension.
echo "Installing desktop app to $APP_DIR..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp package.json package-lock.json "$APP_DIR/"
cp main.js index.html style.css renderer.js config.toml hitch-extension.toml "$APP_DIR/"

echo "Installing desktop app runtime dependencies in $APP_DIR..."
(
  cd "$APP_DIR"
  npm install --omit=dev
)



# Create launcher script
mkdir -p "$BIN_DIR"
LAUNCHER="$BIN_DIR/hitch-face"
echo "Creating launcher script at $LAUNCHER..."
cat << 'EOF' > "$LAUNCHER"
#!/bin/bash
cd "$HOME/.local/share/hitch-face"
if [ -f "./node_modules/.bin/electron" ]; then
  exec ./node_modules/.bin/electron . "$@"
else
  exec npm start "$@"
fi
EOF

chmod +x "$LAUNCHER"

echo "=== Installation complete ==="
echo "Launcher: $LAUNCHER"
echo "Desktop app: $APP_DIR"
echo "Extension adapter: $HOME/.config/hitch/extensions/hitch-face"
echo "Config: $HOME/.config/hitch-face/config.toml"
echo "To run the widget, type: hitch-face"
