import { sourceAsVisionUrl } from "./images.mjs";
import { extractCost, normalizeUsage } from "./usage-store.mjs";

export async function analyzeVision(input) {
  const {
    apiKey,
    baseUrl,
    model,
    source,
    prompt,
    timeoutMs = 45_000,
    fetchFn = fetch
  } = input;
  if (!apiKey) throw new Error("Vision API key is missing.");
  const response = await fetchFn(`${String(baseUrl).replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: "You are the one-time visual perception stage for a coding agent. Return a compact factual description, visible text/OCR, layout, relevant objects, and uncertainty. Do not answer the user's broader task and do not invent hidden details."
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: sourceAsVisionUrl(source) } }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const rawText = await response.text();
  const payload = safeJson(rawText);
  if (!response.ok) {
    throw new Error(`Vision request failed (${response.status}): ${providerError(payload, rawText)}`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  const text = responseText(content) || responseText(payload?.output_text) || rawText;
  if (!text.trim()) throw new Error("Vision model returned an empty analysis.");
  return {
    summary: text.trim(),
    model: payload?.model ?? model,
    usage: normalizeUsage(payload?.usage),
    cost: extractCost(payload)
  };
}

function responseText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item.text === "string") return item.text;
    return "";
  }).filter(Boolean).join("\n");
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function providerError(payload, fallback) {
  return payload?.error?.message ?? payload?.message ?? fallback.slice(0, 500);
}
