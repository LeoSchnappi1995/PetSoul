import assert from "node:assert/strict";
import test from "node:test";
import { testProvider } from "../src/provider-check.mjs";

test("text provider connectivity test sends configured endpoint and model", async () => {
  let request;
  const result = await testProvider({
    provider: { id: "custom", name: "Custom", baseUrl: "https://example.com/v1", model: "coder-model" },
    apiKey: "secret",
    kind: "text",
    fetchFn: async (url, options) => {
      request = { url, body: JSON.parse(options.body), authorization: options.headers.authorization };
      return new Response(JSON.stringify({ model: "coder-model", choices: [{ message: { content: "TEXT_OK" } }] }), { status: 200 });
    }
  });
  assert.equal(request.url, "https://example.com/v1/chat/completions");
  assert.equal(request.body.model, "coder-model");
  assert.equal(request.authorization, "Bearer secret");
  assert.equal(result.ok, true);
});

test("vision provider connectivity test includes an inline image", async () => {
  let body;
  await testProvider({
    provider: { id: "vision", name: "Vision", baseUrl: "https://vision.example/v1", model: "vision-model" },
    apiKey: "secret",
    kind: "vision",
    fetchFn: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ model: "vision-model", choices: [{ message: { content: "VISION_OK red blue green" } }] }), { status: 200 });
    }
  });
  assert.equal(body.messages[0].content[1].type, "image_url");
  assert.match(body.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
});

test("vision provider connectivity fails when response does not prove image understanding", async () => {
  await assert.rejects(
    testProvider({
      provider: { id: "vision", name: "Vision", baseUrl: "https://vision.example/v1", model: "vision-model" },
      apiKey: "secret",
      kind: "vision",
      fetchFn: async () => new Response(JSON.stringify({
        model: "vision-model",
        choices: [{ message: { content: "I cannot inspect images in this environment." } }]
      }), { status: 200 })
    }),
    /did not prove image understanding/
  );
});
