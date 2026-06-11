#!/bin/bash

# Exit on error
set -e

echo "=== Hitch-Face Desktop Widget Installer ==="

# Define directories
EXTENSION_DIR="$HOME/.config/hitch/extensions/hitch-face"
APP_DIR="$HOME/.local/share/hitch-face"
CONFIG_DIR="$HOME/.config/hitch-face"
BIN_DIR="$HOME/.local/bin"

# Ensure local build tooling is available, then compile the dependency-free
# Hitch adapter that the extension runs.
if [ ! -x "./node_modules/.bin/tsc" ]; then
  echo "Installing local build dependencies..."
  npm install
fi

echo "Building Hitch adapter..."
npm run build:adapter

# Install only the adapter and Hitch manifest into the extension directory.
echo "Installing Hitch extension adapter to $EXTENSION_DIR..."
rm -rf "$EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR"
cp dist/adapter.js "$EXTENSION_DIR/adapter.js"
cp hitch-extension.toml "$EXTENSION_DIR/config.toml"

# Install the Electron desktop app separately from the Hitch extension.
echo "Installing desktop app to $APP_DIR..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp package.json package-lock.json "$APP_DIR/"
cp main.js index.html style.css renderer.js "$APP_DIR/"

echo "Installing desktop app runtime dependencies in $APP_DIR..."
(
  cd "$APP_DIR"
  npm install --omit=dev
)

# Copy default config.toml if it doesn't exist
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/config.toml" ]; then
  echo "Creating default configuration in $CONFIG_DIR/config.toml..."
  cp config.toml "$CONFIG_DIR/config.toml"
else
  echo "Configuration file already exists at $CONFIG_DIR/config.toml. Skipping override."
fi

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
echo "Extension adapter: $EXTENSION_DIR"
echo "Config: $CONFIG_DIR/config.toml"
echo "To run the widget, type: hitch-face"
