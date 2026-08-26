#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"

read -s "DEEPSEEK_KEY?DeepSeek API key: "
echo
read -s "QWEN_KEY?Qwen/DashScope API key: "
echo

FRIEND_ROUTER_DEEPSEEK_KEY="$DEEPSEEK_KEY" \
FRIEND_ROUTER_QWEN_KEY="$QWEN_KEY" \
  node "$PROJECT_DIR/src/configure.mjs"

node "$PROJECT_DIR/src/install-codex.mjs" install
node "$PROJECT_DIR/src/install-service.mjs" install

echo "Friend Codex Router configured. Open Codex and send a test message."
