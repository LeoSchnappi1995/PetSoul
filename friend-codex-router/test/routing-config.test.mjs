import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { updateRouting } from "../src/update-routing.mjs";

test("routing can change without re-entering provider keys", async () => {
  const supportDir = await mkdtemp(path.join(os.tmpdir(), "friend-router-routing-"));
  const result = await updateRouting({
    supportDir,
    textProvider: { id: "bailian", name: "Alibaba Bailian", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3-coder-plus" },
    visionProvider: { id: "bailian", name: "Alibaba Bailian", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max" }
  });
  const config = JSON.parse(await readFile(result.configPath, "utf8"));
  assert.equal(config.codexModel, "friend-router/text");
  assert.deepEqual(config.textRoute, { provider: "bailian", model: "qwen3-coder-plus" });
  assert.deepEqual(config.visionRoute, { provider: "bailian", model: "qwen-vl-max" });
});
