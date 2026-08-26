#!/bin/zsh
set -euo pipefail

open 'ccr://provider?name=DeepSeek&base_url=https%3A%2F%2Fapi.deepseek.com&protocol=openai_chat_completions&models=deepseek-chat%2Cdeepseek-reasoner'
sleep 1
open 'ccr://provider?name=Alibaba+Bailian&base_url=https%3A%2F%2Fdashscope.aliyuncs.com%2Fcompatible-mode%2Fv1&protocol=openai_chat_completions&models=qwen3-coder-plus%2Cqwen-vl-max'
