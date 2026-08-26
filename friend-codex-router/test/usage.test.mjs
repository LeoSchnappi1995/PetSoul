import assert from "node:assert/strict";
import test from "node:test";
import { UsageStore } from "../src/usage-store.mjs";
import { parseJSON, parseSSE } from "../src/usage-capture.mjs";

test("usage store aggregates requests, tokens, cost, and vision calls per model", async () => {
  const store = new UsageStore(":memory:", {
    pricing: {
      "DeepSeek/deepseek-chat": { inputPerMillion: 1, outputPerMillion: 2 }
    }
  });
  const now = new Date();
  await store.record({
    model: "DeepSeek/deepseek-chat",
    usage: { input_tokens: 1_000_000, output_tokens: 500_000 },
    kind: "text",
    ok: true,
    timestamp: now
  });
  await store.record({
    model: "qwen-vl-max",
    usage: { prompt_tokens: 1000, completion_tokens: 200 },
    cost: 0.02,
    kind: "vision",
    ok: true,
    timestamp: now
  });
  const snapshot = await store.snapshot("week", now);
  assert.equal(snapshot.total.requests, 2);
  assert.equal(snapshot.total.visionCalls, 1);
  assert.equal(snapshot.total.totalTokens, 1_501_200);
  assert.equal(snapshot.models.find((item) => item.model === "DeepSeek/deepseek-chat").cost, 2);
});

test("usage parser reads JSON Responses usage", () => {
  const result = parseJSON(JSON.stringify({
    model: "DeepSeek/deepseek-chat",
    usage: { input_tokens: 90, output_tokens: 10, total_tokens: 100 }
  }));
  assert.equal(result.model, "DeepSeek/deepseek-chat");
  assert.equal(result.usage.totalTokens, 100);
});

test("usage parser reads the completed response from SSE", () => {
  const result = parseSSE([
    "event: response.output_text.delta",
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"hi\"}",
    "",
    "event: response.completed",
    "data: {\"type\":\"response.completed\",\"response\":{\"model\":\"Alibaba Bailian/qwen3-coder-plus\",\"usage\":{\"input_tokens\":300,\"output_tokens\":40,\"total_tokens\":340}}}",
    ""
  ].join("\n"));
  assert.equal(result.model, "Alibaba Bailian/qwen3-coder-plus");
  assert.equal(result.usage.totalTokens, 340);
});
