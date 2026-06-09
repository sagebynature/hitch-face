#!/bin/bash

# Exit immediately if a command exits with a non-zero status, but allow curl to fail
set -e

# Read the full JSON payload from standard input
INPUT=$(cat)

# Extract the hitch_event_type from the input JSON
EVENT_TYPE=$(echo "$INPUT" | /usr/bin/jq -r '.hitch_event_type')

# Default port
PORT=8888

# Check if ~/.config/hitch-face/config.toml exists and has a port entry
CONFIG_PATH="$HOME/.config/hitch-face/config.toml"
if [ -f "$CONFIG_PATH" ]; then
  # Parse port = <number> from the config file
  parsed_port=$(grep -E '^\s*port\s*=' "$CONFIG_PATH" | head -n 1 | cut -d'=' -f2 | tr -d '[:space:]')
  if [ -n "$parsed_port" ]; then
    PORT="$parsed_port"
  fi
fi

# If the input is non-empty, POST the entire envelope to the /event endpoint
if [ -n "$INPUT" ] && [ "$EVENT_TYPE" != "null" ]; then
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$INPUT" \
    http://127.0.0.1:${PORT}/event > /dev/null 2>&1 || true
fi

