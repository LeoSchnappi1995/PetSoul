import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  installCodex,
  patchCodexConfig,
  restoreCodex
} from "../src/install-codex.mjs";

test("patchCodexConfig changes only top-level model selection and adds a managed provider", () => {
  const original = `model_provider = "openai"\nmodel = "gpt-example"\napproval_policy = "on-request"\n\n[projects."/tmp/demo"]\ntrust_level = "trusted"\n`;
  const patched = patchCodexConfig(original, {
    model: "friend-router",
    baseUrl: "http://127.0.0.1:3566/v1",
    helperPath: "/tmp/read-client-key"
  });
  assert.match(patched, /^model_provider = "friend_router"\nmodel = "friend-router"/);
  assert.match(patched, /approval_policy = "on-request"/);
  assert.match(patched, /\[projects\."\/tmp\/demo"\]/);
  assert.match(patched, /\[model_providers\.friend_router\.auth\]/);
  assert.equal((patched.match(/model_provider\s*=/g) ?? []).length, 1);
});

test("install and restore preserve the exact original Codex config", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "friend-router-test-"));
  const codexHome = path.join(root, "codex");
  const supportDir = path.join(root, "support");
  const configPath = path.join(codexHome, "config.toml");
  const original = `model = "original-model"\n\n[features]\napps = true\n`;
  await import("node:fs/promises").then(({ mkdir }) => mkdir(codexHome, { recursive: true }));
  await writeFile(configPath, original);
  const routerConfig = {
    listenHost: "127.0.0.1",
    listenPort: 3566,
    codexModel: "friend-router",
    clientKeychainService: "test.service",
    clientKeychainAccount: "default"
  };

  await installCodex({ codexHome, supportDir, routerConfig });
  const installed = await readFile(configPath, "utf8");
  assert.match(installed, /model_provider = "friend_router"/);
  await restoreCodex({ supportDir });
  assert.equal(await readFile(configPath, "utf8"), original);
});

test("restore refuses to overwrite a Codex config modified after installation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "friend-router-test-"));
  const codexHome = path.join(root, "codex");
  const supportDir = path.join(root, "support");
  const configPath = path.join(codexHome, "config.toml");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(codexHome, { recursive: true }));
  await writeFile(configPath, `model = "original"\n`);
  await installCodex({
    codexHome,
    supportDir,
    routerConfig: {
      listenHost: "127.0.0.1",
      listenPort: 3566,
      codexModel: "friend-router",
      clientKeychainService: "test.service",
      clientKeychainAccount: "default"
    }
  });
  await writeFile(configPath, `${await readFile(configPath, "utf8")}# user edit\n`);
  await assert.rejects(() => restoreCodex({ supportDir }), /refusing to overwrite/);
});
