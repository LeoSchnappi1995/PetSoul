# Provider presets and connection feedback 0.4.0

The setup UI treats text and vision as separate routes. Each route owns a provider preset, editable endpoint, editable model ID, and API key. Presets cover DeepSeek, Alibaba Bailian/Qwen, OpenRouter, SiliconFlow, Moonshot/Kimi, Zhipu GLM, and a custom OpenAI-compatible endpoint.

Preset values are defaults rather than promises. Before saving, Friend Router sends a small real text request and a one-pixel real vision request. Only when both succeed does it store provider keys in macOS Keychain, write the route config, start the gateway, and connect Codex.

The result is shown in a prominent status banner:

- blue with progress during testing;
- green with the resolved provider/model pair after success;
- red with the provider HTTP error after failure;
- neutral for restored or unconfigured state.

Provider prices and model catalogs are not frozen into routing logic. Model IDs and endpoints remain editable so users can follow provider changes without waiting for an app release.
