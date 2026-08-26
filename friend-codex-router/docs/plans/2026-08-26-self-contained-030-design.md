# Friend Codex Router 0.3.0 self-contained design

## Product boundary

The user installs one macOS App and enters only a DeepSeek API key and a Qwen/DashScope API key. No Claude Code Router installation, client key, profile, or secondary management UI is required.

## Request flow

```text
Codex Responses API
        |
        v
Friend Codex Router
  - local bearer authentication
  - Responses input/history normalization
  - custom/free-form tool virtualization
  - image SHA-256 deduplication
  - one-time Qwen-VL understanding
  - per-model routing and usage accounting
        |
        +--> DeepSeek Chat Completions
        `--> Qwen Chat Completions
        |
        v
Responses JSON or Responses SSE returned to Codex
```

## Protocol bridge

- Responses messages become Chat Completions messages.
- Responses function tools become ordinary Chat function tools.
- Responses custom/free-form tools become virtual function tools with one raw string field. `apply_patch` uses `virtual_apply_patch` with a required `patch` field.
- Chat tool calls are converted back to Responses `function_call` or `custom_tool_call` items.
- Tool outputs from Codex become Chat `tool` messages using the original `call_id`.
- Streaming text deltas, function arguments, custom tool inputs, item lifecycle events, and terminal usage are emitted as Responses SSE.
- Codex response storage is disabled in managed config so every request carries the transcript required by the stateless bridge.

## Routing

- `DeepSeek/deepseek-chat` -> DeepSeek `deepseek-chat`.
- `DeepSeek/deepseek-reasoner` -> DeepSeek `deepseek-reasoner`.
- `Alibaba Bailian/qwen3-coder-plus` -> Qwen `qwen3-coder-plus`.
- Newly attached images -> Qwen vision once per image hash and prompt version.
- Text-only follow-ups never re-run vision because raw images become cached summaries.

## Validation

- Unit tests cover message translation, functions, custom `apply_patch`, streaming text/tool calls, image deduplication, usage, updates, and config restore.
- A real Codex CLI smoke test accepts translated Responses streaming output.
- A second real Codex CLI smoke test executes `exec_command`, returns its tool result through the bridge, and completes the next model turn.
