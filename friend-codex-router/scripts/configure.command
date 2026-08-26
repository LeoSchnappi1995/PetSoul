#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"

read -s "CCR_KEY?CCR client key: "
echo
read -s "VISION_KEY?Qwen/DashScope vision key: "
echo

FRIEND_ROUTER_CCR_KEY="$CCR_KEY" \
FRIEND_ROUTER_VISION_KEY="$VISION_KEY" \
  node "$PROJECT_DIR/src/configure.mjs"

node "$PROJECT_DIR/src/install-codex.mjs" install
node "$PROJECT_DIR/src/install-service.mjs" install

echo "Friend Codex Router configured. Open Codex and send a test message."
