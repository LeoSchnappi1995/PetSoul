import { fileURLToPath } from "node:url";

export async function testProvider(input) {
  const provider = input.provider;
  const apiKey = input.apiKey;
  const kind = input.kind ?? "text";
  if (!provider?.baseUrl || !provider?.model || !apiKey) throw new Error("Provider URL, model, and API key are required.");
  const messages = kind === "vision"
    ? [{
        role: "user",
        content: [
          { type: "text", text: "Reply with VISION_OK if you can see the single-pixel test image." },
          { type: "image_url", image_url: { url: testImageDataUrl } }
        ]
      }]
    : [{ role: "user", content: "Reply with TEXT_OK." }];
  const response = await (input.fetchFn ?? fetch)(`${String(provider.baseUrl).replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: provider.model, stream: false, max_tokens: 32, messages }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000)
  });
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch {}
  if (!response.ok) throw new Error(`${provider.name ?? provider.id} returned HTTP ${response.status}: ${payload?.error?.message ?? payload?.message ?? raw.slice(0, 500)}`);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error(`${provider.name ?? provider.id} returned an empty response.`);
  return { ok: true, kind, provider: provider.name ?? provider.id, model: payload.model ?? provider.model, response: content.trim().slice(0, 200) };
}

const testImageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlGQAAAAASUVORK5CYII=";

async function main() {
  const provider = JSON.parse(process.env.FRIEND_ROUTER_PROVIDER_JSON ?? "{}");
  const result = await testProvider({
    provider,
    apiKey: process.env.FRIEND_ROUTER_PROVIDER_KEY,
    kind: process.env.FRIEND_ROUTER_PROVIDER_KIND ?? "text"
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
