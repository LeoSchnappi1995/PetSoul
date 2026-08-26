# Friend Codex Router design

## Goal

Ship a macOS-friendly local gateway that lets a non-technical user connect Codex to models configured in Claude Code Router (CCR), while ensuring that an image-understanding model is not called repeatedly just because an earlier image remains in the conversation history.

## First release boundary

The first release is an internal-test build. It provides:

- a local proxy in front of CCR;
- one-time image understanding with a persistent local cache;
- request rewriting that replaces raw image blocks with reusable text summaries before the text model receives the request;
- a Codex user-config installer with exact backup and safe restore;
- macOS Keychain storage for local gateway credentials;
- a LaunchAgent installer and a DMG packaging skeleton;
- automated tests for image deduplication and explicit re-analysis;
- a compact menu-bar usage dashboard;
- a signed manifest update channel controlled by the distributor.

The first release does not fork CCR or edit its live SQLite database. DeepSeek and Alibaba Bailian/Qwen are imported through CCR's supported provider flow. A later native setup UI can drive CCR's management API after that API contract is pinned to a tested CCR version.

## Runtime architecture

```text
Codex CLI / ChatGPT desktop app
        |
        | OpenAI Responses API
        v
Friend Codex Router :3566
        |-- authentication and health checks
        |-- image fingerprinting (SHA-256)
        |-- persistent vision-summary cache
        |-- raw-image -> cached-summary request rewrite
        |
        v
Claude Code Router :3456
        |-- DeepSeek text model
        |-- Qwen text model
        `-- provider failover / protocol adaptation

New image only
        |
        `--> Qwen-compatible vision endpoint -> one text summary -> cache
```

Codex points only to Friend Codex Router. Friend Codex Router points to CCR. This keeps Codex configuration stable while providers and text models can change inside CCR.

## Image call contract

- The router fingerprints decoded image bytes with SHA-256. URL strings are used only as a fallback when the image cannot be downloaded safely.
- A normal turn automatically analyzes only images newly attached to the latest user message.
- The same image hash is automatically analyzed at most once for a given vision prompt version.
- Every raw image block in the forwarded request is replaced by a compact text block containing the cached analysis. The text model never receives the historical raw image again.
- Historical images without a cache entry are not silently analyzed in bulk. They become an explicit placeholder.
- A second vision call is allowed only when the user explicitly requests re-analysis, OCR, zooming, or inspection of a different region, or when the image bytes change.
- The default automatic budget is one vision call per request. Extra new images are marked as not yet analyzed rather than triggering an unbounded burst.
- Image understanding and image generation are separate capabilities. Receiving an image never invokes an image-generation model.

## Codex configuration

The installer edits the user-level `~/.codex/config.toml`, because Codex ignores `model_provider` and `model_providers` in project-local config. It:

1. creates an exact backup before the first installation;
2. updates top-level `model_provider` and `model` without duplicating TOML keys;
3. appends one clearly marked managed provider table;
4. uses command-backed authentication so the local client key stays in macOS Keychain;
5. records the installed-file hash;
6. restores only when the current file still matches the installed version, unless the user explicitly forces restore.

## Failure behavior

- If vision understanding fails, the text request still proceeds with a visible "vision unavailable" placeholder; raw image data is not forwarded to the text model.
- If CCR is unavailable, the proxy returns a concise `502` with the upstream address and no provider key.
- If the local client key is wrong, the proxy returns `401` before reading the request body.
- Cache corruption is quarantined and replaced with a new empty cache.
- Request bodies above the configured limit are rejected with `413`.
- Secrets are read from Keychain and never returned by health or metrics endpoints.
- Usage persistence and menu-bar refresh failures never fail a successful model response.

## Usage dashboard

The gateway records completed text and vision calls in daily local rollups. For each resolved model it stores request count, failures, input tokens, output tokens, total tokens, vision-call count, estimated or returned cost, and last-call time. JSON Responses and streaming SSE responses are both parsed for their terminal usage object. The menu-bar app polls the loopback metrics endpoint every ten seconds and defaults to the current Monday-to-today natural-week window.

Costs use upstream-returned cost fields when present. Otherwise they are calculated only from explicitly configured provider pricing. The app never silently invents provider prices.

## Update channel

Remote distribution uses an HTTPS JSON manifest signed with a release Ed25519 private key. The client embeds only the public key. The signed payload binds the version, build number, DMG URL, and SHA-256 digest. Clients poll every fifteen minutes and support manual refresh. A valid newer release is downloaded, hash-checked, and opened for installation. Remote arbitrary commands, unsigned manifests, HTTP URLs, and hash mismatches are rejected.

## Packaging path

The internal build uses a LaunchAgent plus scripts. The formal DMG will bundle:

- a pinned CCR Desktop runtime;
- the Friend Codex Router sidecar;
- a SwiftUI first-run configuration app;
- signed helper binaries for Keychain access and Codex configuration;
- code signing, hardened runtime, notarization, and a restore/uninstall action.
