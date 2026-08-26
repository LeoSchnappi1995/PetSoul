import assert from "node:assert/strict";
import test from "node:test";
import { VisionCache } from "../src/cache.mjs";
import { createRouterServer } from "../src/server.mjs";

test("streaming Chat Completions becomes Responses SSE", async (t) => {
  const fetchFn = async () => new Response(chatSSE([
    { model: "deepseek-chat", choices: [{ delta: { role: "assistant", content: "SELF_" }, finish_reason: null }] },
    { model: "deepseek-chat", choices: [{ delta: { content: "CONTAINED_OK" }, finish_reason: null }] },
    { model: "deepseek-chat", choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } }
  ]), { status: 200, headers: { "content-type": "text/event-stream" } });
  const { server } = await createTestServer(fetchFn);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
    method: "POST",
    headers: { authorization: "Bearer local-key", "content-type": "application/json" },
    body: JSON.stringify({ model: "DeepSeek/deepseek-chat", input: "Reply", stream: true })
  });
  const raw = await response.text();
  assert.equal(response.headers.get("content-type").startsWith("text/event-stream"), true);
  assert.match(raw, /response\.created/);
  assert.match(raw, /response\.output_text\.delta/);
  assert.match(raw, /SELF_/);
  assert.match(raw, /CONTAINED_OK/);
  const completed = responseEvents(raw).find((item) => item.type === "response.completed");
  assert.equal(completed.response.output_text, "SELF_CONTAINED_OK");
  assert.equal(completed.response.usage.total_tokens, 24);
});

test("streaming virtual apply_patch becomes a custom tool call", async (t) => {
  const fetchFn = async () => new Response(chatSSE([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "tool_1", type: "function", function: { name: "virtual_apply_patch", arguments: "{\"patch\":\"*** Begin" } }] }, finish_reason: null }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: " Patch***\"}" } }] }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 } }
  ]), { status: 200, headers: { "content-type": "text/event-stream" } });
  const { server } = await createTestServer(fetchFn);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
    method: "POST",
    headers: { authorization: "Bearer local-key", "content-type": "application/json" },
    body: JSON.stringify({
      model: "DeepSeek/deepseek-chat",
      input: "Patch",
      stream: true,
      tools: [{ type: "custom", name: "apply_patch", description: "Apply patch" }]
    })
  });
  const raw = await response.text();
  const completed = responseEvents(raw).find((item) => item.type === "response.completed");
  assert.equal(completed.response.output[0].type, "custom_tool_call");
  assert.equal(completed.response.output[0].name, "apply_patch");
  assert.equal(completed.response.output[0].input, "*** Begin Patch***");
  assert.match(raw, /response\.custom_tool_call_input\.done/);
});

async function createTestServer(fetchFn) {
  return createRouterServer({
    config: {
      listenHost: "127.0.0.1",
      listenPort: 0,
      codexModel: "DeepSeek/deepseek-chat",
      deepseekBaseUrl: "https://deepseek.example",
      qwenBaseUrl: "https://qwen.example/v1",
      modelRoutes: { "DeepSeek/deepseek-chat": { provider: "deepseek", upstreamModel: "deepseek-chat" } },
      visionBaseUrl: "https://vision.example/v1",
      visionModel: "qwen-vl-test",
      cacheFile: ":memory:",
      usageFile: ":memory:",
      visionPromptVersion: "test-v1",
      maxAutoVisionPerRequest: 1,
      maxRequestBytes: 1024 * 1024,
      maxImageBytes: 1024 * 1024,
      visionTimeoutMs: 5000,
      modelPricing: {}
    },
    secrets: { clientKey: "local-key", deepseekKey: "deepseek-key", qwenKey: "qwen-key", visionKey: "qwen-key" },
    cache: new VisionCache(":memory:"),
    fetchFn
  });
}

function chatSSE(events) {
  return `${events.map((item) => `data: ${JSON.stringify(item)}\n\n`).join("")}data: [DONE]\n\n`;
}

function responseEvents(raw) {
  return raw.split(/\r?\n/)
    .filter((line) => line.startsWith("data: ") && line.slice(6) !== "[DONE]")
    .map((line) => JSON.parse(line.slice(6)));
}
