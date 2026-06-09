#!/bin/bash

# List of Hitch event expressions to test
EXPRESSIONS=(
  "session.started"
  "session.resumed"
  "turn.started"
  "turn.user_prompt"
  "turn.assistant_started"
  "turn.assistant_completed"
  "llm.requested"
  "llm.completed"
  "tool.requested"
  "tool.permission_requested"
  "tool.completed"
  "tool.progress"
  "retry.started"
  "retry.completed"
  "subagent.started"
  "subagent.completed"
  "session.compacted"
  "error.reported"
  "session.ended"
)

echo "Testing Hitch Face expressions..."

for expr in "${EXPRESSIONS[@]}"; do
  echo "Sending expression: $expr"
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"expression\":\"$expr\"}" \
    http://127.0.0.1:8888/expression
  echo ""
  sleep 4.5 # Wait enough time to see the animation and transition
done

echo "Test drive finished!"
