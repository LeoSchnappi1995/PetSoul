# Friend Codex Router

Friend Codex Router is a self-contained local gateway that connects Codex directly to DeepSeek and Qwen. It translates Codex Responses/tool traffic into OpenAI-compatible Chat Completions and prevents a historical image from causing a new paid vision-model call on every later agent turn.

## Current milestone

This repository currently contains the internal-test core:

- OpenAI Responses to Chat Completions protocol translation;
- function-tool and free-form custom-tool bridging, including `apply_patch`;
- Responses JSON and streaming SSE generation for Codex;
- latest-user-turn image detection;
- SHA-256 image fingerprints;
- persistent vision summaries;
- replacement of raw images with cached text summaries;
- explicit re-analysis handling;
- Codex config backup/install/restore;
- macOS Keychain helpers;
- LaunchAgent and DMG packaging scripts;
- a native menu-bar dashboard with per-model request, token, vision-call, and cost totals;
- signed update manifests with HTTPS download and SHA-256 verification.

No second router is required. The remaining distribution milestone is Developer ID signing and Apple notarization.

## Prerequisites for the internal build

- macOS;
- Node.js 22 or newer;
- a DeepSeek API key;
- a Qwen/DashScope API key.

## Configure secrets

Copy the example config:

```bash
mkdir -p "$HOME/Library/Application Support/Friend Codex Router"
cp config.example.json "$HOME/Library/Application Support/Friend Codex Router/config.json"
```

Store the three local secrets in Keychain:

```bash
security add-generic-password -U -s com.friend-codex-router.client -a default -w '<local-client-key>'
security add-generic-password -U -s com.friend-codex-router.deepseek -a default -w '<deepseek-key>'
security add-generic-password -U -s com.friend-codex-router.qwen -a default -w '<qwen-key>'
```

The local client key is the key Codex uses to call this proxy. It can be a randomly generated value and is separate from provider keys.

### Where keys live

- The DeepSeek key is stored under `com.friend-codex-router.deepseek`.
- The Qwen text/vision key is stored under `com.friend-codex-router.qwen`.
- The local key used by Codex is generated automatically and stored under `com.friend-codex-router.client`.
- Secure fields intentionally reopen blank. The Settings window shows only whether each local key is saved.

### How routing is controlled

- The **默认文字模型** picker changes the model selector written to Codex user config.
- **应用模型路由** changes text and vision models without asking for keys again.
- New image bytes are intercepted by Friend Codex Router and sent once to the configured Qwen vision model.
- The cached visual summary replaces raw image blocks before the request reaches the text provider.
- Text-only work is routed directly to the configured DeepSeek/Qwen endpoint.

## Run

```bash
FRIEND_ROUTER_CONFIG="$HOME/Library/Application Support/Friend Codex Router/config.json" npm start
```

Health and cost-control metrics:

```bash
curl http://127.0.0.1:3566/health
curl http://127.0.0.1:3566/metrics
```

The menu bar refreshes the current natural-week totals every 10 seconds. It shows total requests and tokens plus input/output/total tokens, failures, visual-understanding calls, and cost for each resolved model.

Pricing is deliberately not hard-coded because provider prices change. The gateway first uses cost returned by the upstream. When the upstream does not return cost, add verified prices to `config.json`:

```json
{
  "modelPricing": {
    "DeepSeek/deepseek-chat": {
      "inputPerMillion": 0,
      "outputPerMillion": 0
    }
  }
}
```

Replace the zero placeholders with the provider's current confirmed USD-per-million-token rates.

## Connect Codex

Install the managed user-level provider configuration:

```bash
node src/install-codex.mjs install
```

Restore the exact pre-install Codex config:

```bash
node src/install-codex.mjs restore
```

Codex provider settings must live in user-level config. See official OpenAI documentation: [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic) and [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## Vision policy

- A newly attached image is analyzed once.
- A cached image is not analyzed again.
- A text-only follow-up never triggers vision just because an old image remains in history.
- "Analyze again", OCR, zoom, or detail-inspection language permits one targeted re-analysis.
- Raw image blocks are removed before the text request reaches DeepSeek/Qwen.
- Image generation is never triggered by image receipt.

## Signed remote updates

The app supports a safe remote-update channel. It does not accept remote shell commands. You publish a DMG and a small signed JSON manifest; clients poll the manifest every 15 minutes and expose **检查更新…** in the menu bar.

Generate an Ed25519 signing key once and keep the private key offline:

```bash
node scripts/publish-update.mjs generate-key \
  --private=release-private.pem \
  --public=release-public-base64.txt
```

Build the client with the HTTPS manifest URL and public key:

```bash
UPDATE_MANIFEST_URL='https://downloads.example.com/friend-router/latest.json' \
UPDATE_PUBLIC_KEY_BASE64='paste-public-key-base64' \
./scripts/build-internal-dmg.sh
```

For each release, upload the DMG and generate its manifest:

```bash
node scripts/publish-update.mjs manifest \
  --dmg=dist/Friend-Codex-Router-0.3.0-internal.dmg \
  --version=0.3.0 \
  --build=4 \
  --url=https://downloads.example.com/Friend-Codex-Router-0.3.0.dmg \
  --private=release-private.pem \
  --out=latest.json
```

The client verifies the Ed25519 signature and downloaded DMG SHA-256 before opening it. The internal build opens the verified DMG for user confirmation; the formal notarized build can later use Sparkle for in-place replacement.
