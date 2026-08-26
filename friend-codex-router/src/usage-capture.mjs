import { Transform } from "node:stream";
import { extractCost, normalizeUsage } from "./usage-store.mjs";

export function createUsageCaptureTransform(options) {
  const chunks = [];
  let capturedBytes = 0;
  const maxCaptureBytes = options.maxCaptureBytes ?? 5 * 1024 * 1024;
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (capturedBytes < maxCaptureBytes) {
        const remaining = maxCaptureBytes - capturedBytes;
        chunks.push(Buffer.from(chunk).subarray(0, remaining));
        capturedBytes += Math.min(chunk.length, remaining);
      }
      callback(null, chunk);
    },
    flush(callback) {
      Promise.resolve()
        .then(async () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const parsed = options.contentType?.includes("text/event-stream")
            ? parseSSE(raw)
            : parseJSON(raw);
          await options.onComplete({
            model: parsed.model ?? options.requestModel ?? "unknown",
            usage: parsed.usage,
            cost: parsed.cost,
            ok: options.ok
          });
        })
        .then(() => callback(), () => callback());
    }
  });
}

export function parseJSON(raw) {
  try {
    return extractFromPayload(JSON.parse(raw));
  } catch {
    return { usage: normalizeUsage() };
  }
}

export function parseSSE(raw) {
  let result = { usage: normalizeUsage() };
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const extracted = extractFromPayload(JSON.parse(data));
      if (extracted.model) result.model = extracted.model;
      if (extracted.usage.totalTokens) result.usage = extracted.usage;
      if (extracted.cost !== undefined) result.cost = extracted.cost;
    } catch {}
  }
  return result;
}

export function extractFromPayload(payload) {
  const response = payload?.response ?? payload;
  const usage = response?.usage ?? payload?.usage ?? {};
  return {
    model: response?.model ?? payload?.model,
    usage: normalizeUsage(usage),
    cost: extractCost(response) ?? extractCost(payload)
  };
}
