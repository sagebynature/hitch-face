#!/usr/bin/env bash
# =========================================================
# test-payloads.sh — End-to-end payload simulation for BMO
#
# Sends a sequence of realistic Hitch event envelopes to
# the /event endpoint. Run this while Electron is running:
#   npm start &
#   bash tests/test-payloads.sh
# =========================================================

set -euo pipefail

PORT="${PORT:-8888}"
BASE="http://127.0.0.1:${PORT}"

send_event() {
  local label="$1"
  local payload="$2"
  echo "→ Sending: ${label}"
  printf '%s' "${payload}" | curl -s -X POST \
    -H "Content-Type: application/json" \
    -d @- \
    "${BASE}/event" > /dev/null 2>&1 || {
      echo "  ⚠️  curl failed – is Electron running on port ${PORT}?"
      return 0
    }
  echo "  ✅ OK"
  sleep 2
}

echo ""
echo "BMO Payload Test Drive – firing ${BASE}/event"
echo "=================================================="

# 1. Session started
send_event "session.started" '{
  "harness": "omp",
  "hitch_event_type": "session.started",
  "payload": { "session": { "id": "sess-001" } }
}'

# 2. User prompt
send_event "turn.user_prompt" '{
  "harness": "omp",
  "hitch_event_type": "turn.user_prompt",
  "payload": { "turn": { "prompt": "How do I reset a stuck process in Linux?" } }
}'

# 3. LLM requested
send_event "llm.requested" '{
  "harness": "omp",
  "hitch_event_type": "llm.requested",
  "payload": { "llm": { "model": "gemini-2.5-pro" } }
}'

# 4. Tool requested with inputs
send_event "tool.requested" '{
  "harness": "omp",
  "hitch_event_type": "tool.requested",
  "payload": {
    "tool": {
      "name": "grep_search",
      "input": { "query": "hitch_event_type", "path": "/workspace" }
    }
  }
}'

# 5. Tool completed
send_event "tool.completed" '{
  "harness": "omp",
  "hitch_event_type": "tool.completed",
  "payload": {
    "tool": {
      "name": "grep_search",
      "input": { "query": "hitch_event_type" }
    }
  }
}'

# 6. LLM completed with token/cost usage
send_event "llm.completed" '{
  "harness": "omp",
  "hitch_event_type": "llm.completed",
  "payload": {
    "llm": {
      "finish_reason": "stop",
      "usage": { "tokens": 2048, "cost": 0.0041 }
    }
  }
}'

# 7. Turn completed
send_event "turn.assistant_completed" '{
  "harness": "omp",
  "hitch_event_type": "turn.assistant_completed",
  "payload": {}
}'

# 8. Error reported
send_event "error.reported" '{
  "harness": "omp",
  "hitch_event_type": "error.reported",
  "payload": { "error": { "message": "Rate limit exceeded" } }
}'

# 9. Session ended
send_event "session.ended" '{
  "harness": "omp",
  "hitch_event_type": "session.ended",
  "payload": {}
}'

echo ""
echo "=================================================="
echo "✅ All test payloads sent. Check BMO for reactions!"
echo ""
echo "Tip: click BMO's RED button to toggle the log console."
