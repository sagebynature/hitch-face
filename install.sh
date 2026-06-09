#!/bin/bash

# Exit on error
set -e

echo "=== Hitch-Face Desktop Widget Installer ==="

# Define directories
TARGET_DIR="$HOME/.config/hitch/extensions/hitch-face"
CONFIG_DIR="$HOME/.config/hitch-face"
BIN_DIR="$HOME/.local/bin"

# Ensure directories exist
mkdir -p "$TARGET_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$BIN_DIR"

# Copy code files
echo "Copying source files to $TARGET_DIR..."
cp package.json package-lock.json "$TARGET_DIR/"
cp main.js index.html style.css renderer.js adapter.sh "$TARGET_DIR/"

# Ensure adapter.sh is executable in the target directory
chmod +x "$TARGET_DIR/adapter.sh"

# Install node dependencies
echo "Installing node dependencies in $TARGET_DIR..."
(
  cd "$TARGET_DIR"
  npm install --omit=dev
)

# Copy default config.toml if it doesn't exist
if [ ! -f "$CONFIG_DIR/config.toml" ]; then
  echo "Creating default configuration in $CONFIG_DIR/config.toml..."
  cp config.toml "$CONFIG_DIR/config.toml"
else
  echo "Configuration file already exists at $CONFIG_DIR/config.toml. Skipping override."
fi

# Create launcher script
LAUNCHER="$BIN_DIR/hitch-face"
echo "Creating launcher script at $LAUNCHER..."
cat << 'EOF' > "$LAUNCHER"
#!/bin/bash
cd "$HOME/.config/hitch/extensions/hitch-face"
if [ -f "./node_modules/.bin/electron" ]; then
  exec ./node_modules/.bin/electron . "$@"
else
  exec npm start "$@"
fi
EOF

chmod +x "$LAUNCHER"

echo "=== Installation complete ==="
echo "Launcher: $LAUNCHER"
echo "Config: $CONFIG_DIR/config.toml"
echo "To run, type: hitch-face"
