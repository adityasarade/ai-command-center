#!/usr/bin/env bash
# AI Command Center — plain curl integration (works from any language/tool).
# Run the gateway first:  npx ai-command-center start
set -euo pipefail

GATEWAY="${AICC_GATEWAY:-http://localhost:4321}"
PROJECT="curl-demo"

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "→ real OpenAI call through the gateway"
  curl -s "$GATEWAY/p/$PROJECT/openai/v1/chat/completions" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Say hello from AI Command Center in 5 words."}]}' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["choices"][0]["message"]["content"])'
else
  echo "→ no OPENAI_API_KEY, reporting a sample record via /api/track"
  curl -s -X POST "$GATEWAY/api/track" \
    -H "Content-Type: application/json" \
    -d "{\"project\":\"$PROJECT\",\"provider\":\"openai\",\"model\":\"gpt-4o-mini\",\"tokensIn\":1100,\"tokensOut\":280,\"latencyMs\":900}"
  echo
fi

echo "Open the dashboard: $GATEWAY"
