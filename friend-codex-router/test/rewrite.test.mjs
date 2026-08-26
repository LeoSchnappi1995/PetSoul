import assert from "node:assert/strict";
import test from "node:test";
import { VisionCache } from "../src/cache.mjs";
import { rewriteRequestWithVision } from "../src/rewrite.mjs";

const imageOne = dataUrl("first-image");
const imageTwo = dataUrl("second-image");

test("a new image is analyzed once and replaced with a text summary", async () => {
  const cache = new VisionCache(":memory:");
  let calls = 0;
  const result = await rewriteRequestWithVision(requestWithImage(imageOne, "What is in this screenshot?"), {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze: async () => ({ summary: `summary-${++calls}`, model: "vision-test" })
  });

  assert.equal(calls, 1);
  assert.equal(result.metrics.newVisionCalls, 1);
  assert.equal(containsImageType(result.body), false);
  assert.match(JSON.stringify(result.body), /summary-1/);
});

test("a historical cached image does not trigger vision on a text-only follow-up", async () => {
  const cache = new VisionCache(":memory:");
  let calls = 0;
  const analyze = async () => ({ summary: `summary-${++calls}`, model: "vision-test" });
  await rewriteRequestWithVision(requestWithImage(imageOne, "Analyze this"), {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze
  });

  const followUp = {
    model: "friend-router",
    input: [
      userMessage("Analyze this", [imageBlock(imageOne)]),
      { role: "assistant", content: [{ type: "output_text", text: "Previous answer" }] },
      userMessage("Now implement the fix", [])
    ]
  };
  const result = await rewriteRequestWithVision(followUp, {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze
  });

  assert.equal(calls, 1, "vision must not be called again");
  assert.equal(result.metrics.newVisionCalls, 0);
  assert.equal(result.metrics.cacheHits, 1);
  assert.match(JSON.stringify(result.body), /summary-1/);
});

test("explicit re-analysis permits one additional targeted vision call", async () => {
  const cache = new VisionCache(":memory:");
  let calls = 0;
  const analyze = async () => ({ summary: `summary-${++calls}`, model: "vision-test" });
  await rewriteRequestWithVision(requestWithImage(imageOne, "Analyze this"), {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze
  });

  const followUp = {
    model: "friend-router",
    input: [
      userMessage("Analyze this", [imageBlock(imageOne)]),
      userMessage("重新仔细看一下左下角文字", [])
    ]
  };
  const result = await rewriteRequestWithVision(followUp, {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze
  });

  assert.equal(calls, 2);
  assert.equal(result.metrics.explicitReanalysis, true);
  assert.equal(result.metrics.newVisionCalls, 1);
  assert.match(JSON.stringify(result.body), /summary-2/);
});

test("a changed image receives a new fingerprint and a new analysis", async () => {
  const cache = new VisionCache(":memory:");
  let calls = 0;
  const analyze = async () => ({ summary: `summary-${++calls}`, model: "vision-test" });
  await rewriteRequestWithVision(requestWithImage(imageOne, "First"), {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze
  });
  await rewriteRequestWithVision(requestWithImage(imageTwo, "Second"), {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze
  });
  assert.equal(calls, 2);
  assert.equal(cache.snapshot().entries, 2);
});

test("automatic vision budget prevents a multi-image cost burst", async () => {
  const cache = new VisionCache(":memory:");
  let calls = 0;
  const request = {
    model: "friend-router",
    input: [userMessage("Compare these", [imageBlock(imageOne), imageBlock(imageTwo)])]
  };
  const result = await rewriteRequestWithVision(request, {
    cache,
    promptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    analyze: async () => ({ summary: `summary-${++calls}`, model: "vision-test" })
  });
  assert.equal(calls, 1);
  assert.equal(result.metrics.placeholders, 1);
  assert.match(JSON.stringify(result.body), /自动视觉预算已用完/);
});

function requestWithImage(url, text) {
  return {
    model: "friend-router",
    input: [userMessage(text, [imageBlock(url)])]
  };
}

function userMessage(text, images) {
  return {
    role: "user",
    content: [
      { type: "input_text", text },
      ...images
    ]
  };
}

function imageBlock(url) {
  return { type: "input_image", image_url: url };
}

function dataUrl(value) {
  return `data:image/png;base64,${Buffer.from(value).toString("base64")}`;
}

function containsImageType(value) {
  if (Array.isArray(value)) return value.some(containsImageType);
  if (!value || typeof value !== "object") return false;
  if (typeof value.type === "string" && value.type.includes("image")) return true;
  return Object.values(value).some(containsImageType);
}
