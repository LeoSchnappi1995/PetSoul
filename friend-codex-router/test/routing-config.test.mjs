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
    codexModel: "Alibaba Bailian/qwen3-coder-plus",
    visionModel: "qwen-vl-max"
  });
  const config = JSON.parse(await readFile(result.configPath, "utf8"));
  assert.equal(config.codexModel, "Alibaba Bailian/qwen3-coder-plus");
  assert.equal(config.visionModel, "qwen-vl-max");
});
