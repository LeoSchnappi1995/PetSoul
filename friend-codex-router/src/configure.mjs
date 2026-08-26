import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providerKeychainService } from "./config.mjs";

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
  const textProvider = options.textProvider ?? parseProvider(process.env.FRIEND_ROUTER_TEXT_PROVIDER_JSON, {
    id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat"
  });
  const visionProvider = options.visionProvider ?? parseProvider(process.env.FRIEND_ROUTER_VISION_PROVIDER_JSON, {
    id: "bailian", name: "Alibaba Bailian", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max"
  });
  const clientKey = options.clientKey ?? process.env.FRIEND_ROUTER_CLIENT_KEY ?? `fcr_${randomBytes(24).toString("base64url")}`;
  const textKey = options.textKey ?? process.env.FRIEND_ROUTER_TEXT_KEY ?? process.env.FRIEND_ROUTER_DEEPSEEK_KEY;
  const visionKey = options.visionKey ?? process.env.FRIEND_ROUTER_VISION_KEY ?? process.env.FRIEND_ROUTER_QWEN_KEY
    ?? (visionProvider.id === textProvider.id ? textKey : undefined);
  if (!textKey) throw new Error(`API key for text provider ${textProvider.name} is missing.`);
  if (!visionKey) throw new Error(`API key for vision provider ${visionProvider.name} is missing.`);

  config.providers = {
    ...(config.providers ?? {}),
    [textProvider.id]: providerConfig(textProvider),
    [visionProvider.id]: providerConfig(visionProvider)
  };
  config.textRoute = { provider: textProvider.id, model: textProvider.model };
  config.visionRoute = { provider: visionProvider.id, model: visionProvider.model };
  config.codexModel = "friend-router/text";
  config.modelRoutes = {
    ...(config.modelRoutes ?? {}),
    "friend-router/text": { provider: textProvider.id, upstreamModel: textProvider.model }
  };
  delete config.deepseekBaseUrl;
  delete config.qwenBaseUrl;
  delete config.visionBaseUrl;
  delete config.visionModel;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  writeKeychain("com.friend-codex-router.client", "default", clientKey);
  writeKeychain(providerKeychainService(textProvider.id), "default", textKey);
  writeKeychain(providerKeychainService(visionProvider.id), "default", visionKey);
  return {
    configPath,
    clientKeyStored: true,
    textProvider: { id: textProvider.id, name: textProvider.name, model: textProvider.model },
    visionProvider: { id: visionProvider.id, name: visionProvider.name, model: visionProvider.model }
  };
}

function parseProvider(raw, fallback) {
  if (!raw) return fallback;
  const value = JSON.parse(raw);
  for (const key of ["id", "name", "baseUrl", "model"]) {
    if (!value[key]) throw new Error(`Provider configuration is missing ${key}.`);
  }
  const url = new URL(value.baseUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Provider URL must use HTTP or HTTPS.");
  return value;
}

function providerConfig(value) {
  return {
    name: value.name,
    baseUrl: String(value.baseUrl).replace(/\/+$/, ""),
    keychainService: providerKeychainService(value.id),
    keychainAccount: "default"
  };
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
