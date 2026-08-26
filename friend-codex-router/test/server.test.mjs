import assert from "node:assert/strict";
import test from "node:test";
import { VisionCache } from "../src/cache.mjs";
import { createRouterServer } from "../src/server.mjs";

test("HTTP proxy calls vision once and forwards text-only requests to CCR", async (t) => {
  let visionCalls = 0;
  const upstreamBodies = [];
  const fetchFn = async (url, options = {}) => {
    if (String(url).endsWith("/chat/completions")) {
      visionCalls += 1;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "A settings dialog with a Save button." } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    upstreamBodies.push(JSON.parse(Buffer.from(options.body).toString("utf8")));
    return new Response(JSON.stringify({ id: "response-test", output: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const config = {
    listenHost: "127.0.0.1",
    listenPort: 0,
    upstreamBaseUrl: "http://127.0.0.1:3456",
    visionBaseUrl: "https://vision.example/v1",
    visionModel: "qwen-vl-test",
    cacheFile: ":memory:",
    visionPromptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    maxRequestBytes: 1024 * 1024,
    maxImageBytes: 1024 * 1024,
    visionTimeoutMs: 5000
  };
  const { server } = await createRouterServer({
    config,
    secrets: { clientKey: "local-key", upstreamKey: "ccr-key", visionKey: "vision-key" },
    cache: new VisionCache(":memory:"),
    fetchFn
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const image = `data:image/png;base64,${Buffer.from("same-image").toString("base64")}`;

  await post(base, {
    model: "friend-router",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "Explain this UI" },
        { type: "input_image", image_url: image }
      ]
    }]
  });
  await post(base, {
    model: "friend-router",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Explain this UI" },
          { type: "input_image", image_url: image }
        ]
      },
      { role: "user", content: [{ type: "input_text", text: "Now write the code" }] }
    ]
  });

  assert.equal(visionCalls, 1);
  assert.equal(upstreamBodies.length, 2);
  assert.equal(upstreamBodies.some(containsImageType), false);
  assert.match(JSON.stringify(upstreamBodies[1]), /A settings dialog with a Save button/);

  async function post(baseUrl, body) {
    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-key",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 200);
  }
});

function containsImageType(value) {
  if (Array.isArray(value)) return value.some(containsImageType);
  if (!value || typeof value !== "object") return false;
  if (typeof value.type === "string" && value.type.includes("image")) return true;
  return Object.values(value).some(containsImageType);
}
