import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function configure(options = {}) {
  const supportDir = options.supportDir ?? path.join(os.homedir(), "Library/Application Support/Friend Codex Router");
  const configPath = path.join(supportDir, "config.json");
  await mkdir(supportDir, { recursive: true });
  try {
    await readFile(configPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await copyFile(path.join(projectRoot, "config.example.json"), configPath);
  }
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (options.codexModel ?? process.env.FRIEND_ROUTER_CODEX_MODEL) {
    config.codexModel = options.codexModel ?? process.env.FRIEND_ROUTER_CODEX_MODEL;
  }
  if (options.visionModel ?? process.env.FRIEND_ROUTER_VISION_MODEL) {
    config.visionModel = options.visionModel ?? process.env.FRIEND_ROUTER_VISION_MODEL;
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  const clientKey = options.clientKey ?? process.env.FRIEND_ROUTER_CLIENT_KEY ?? `fcr_${randomBytes(24).toString("base64url")}`;
  const ccrKey = options.ccrKey ?? process.env.FRIEND_ROUTER_CCR_KEY;
  const visionKey = options.visionKey ?? process.env.FRIEND_ROUTER_VISION_KEY;
  if (!ccrKey) throw new Error("Set FRIEND_ROUTER_CCR_KEY to the CCR client key.");
  if (!visionKey) throw new Error("Set FRIEND_ROUTER_VISION_KEY to the Qwen/DashScope vision key.");
  writeKeychain("com.friend-codex-router.client", "default", clientKey);
  writeKeychain("com.friend-codex-router.ccr", "default", ccrKey);
  writeKeychain("com.friend-codex-router.vision", "default", visionKey);
  return { configPath, clientKeyStored: true, ccrKeyStored: true, visionKeyStored: true };
}

function writeKeychain(service, account, value) {
  execFileSync("/usr/bin/security", [
    "add-generic-password", "-U", "-s", service, "-a", account, "-w", value
  ], { stdio: ["ignore", "ignore", "pipe"] });
}

async function main() {
  const result = await configure();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
