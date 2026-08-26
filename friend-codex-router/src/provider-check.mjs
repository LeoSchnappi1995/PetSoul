import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export async function testProvider(input) {
  const provider = input.provider;
  const apiKey = input.apiKey;
  const kind = input.kind ?? "text";
  if (!provider?.baseUrl || !provider?.model || !apiKey) throw new Error("Provider URL, model, and API key are required.");
  const messages = kind === "vision"
    ? [{
        role: "user",
        content: [
          { type: "text", text: "Look at the test image. Reply with VISION_OK and list the visible colors in this order: left area, right area, bottom stripe. Do not guess if you cannot see the image." },
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
  if (kind === "text" && !/TEXT_OK/i.test(content)) {
    throw new Error(`${provider.name ?? provider.id} text test did not return TEXT_OK. Response: ${content.trim().slice(0, 200)}`);
  }
  if (kind === "vision" && !visionTestPassed(content)) {
    throw new Error(`${provider.name ?? provider.id} vision test did not prove image understanding. Expected red, blue, and green from the test image. Response: ${content.trim().slice(0, 200)}`);
  }
  return { ok: true, kind, provider: provider.name ?? provider.id, model: payload.model ?? provider.model, response: content.trim().slice(0, 200) };
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function visionTestPassed(content) {
  const normalized = String(content).toLowerCase();
  return /vision_ok/i.test(content)
    && (normalized.includes("red") || content.includes("红"))
    && (normalized.includes("blue") || content.includes("蓝"))
    && (normalized.includes("green") || content.includes("绿"));
}

function createVisionTestImageDataUrl() {
  const width = 96;
  const height = 64;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = y >= 48
        ? [28, 178, 84]
        : x < width / 2 ? [220, 38, 38] : [37, 99, 235];
      const offset = 1 + x * 3;
      row[offset] = color[0];
      row[offset + 1] = color[1];
      row[offset + 2] = color[2];
    }
    rows.push(row);
  }
  const png = Buffer.concat([
    pngSignature,
    pngChunk("IHDR", Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 2, 0, 0, 0])
    ])),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  return Buffer.concat([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(Buffer.concat([typeBytes, data])))
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[n] = c >>> 0;
}

const testImageDataUrl = createVisionTestImageDataUrl();

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
