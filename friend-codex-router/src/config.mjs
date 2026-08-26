import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaultConfigPath = "~/Library/Application Support/Friend Codex Router/config.json";

export function expandHome(value) {
  if (typeof value !== "string") return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export async function loadConfig(configPath = process.env.FRIEND_ROUTER_CONFIG ?? defaultConfigPath) {
  const resolvedPath = path.resolve(expandHome(configPath));
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  const config = {
    listenHost: parsed.listenHost ?? "127.0.0.1",
    listenPort: integer(parsed.listenPort, 3566),
    codexModel: parsed.codexModel ?? "DeepSeek/deepseek-chat",
    clientKeychainService: parsed.clientKeychainService ?? "com.friend-codex-router.client",
    clientKeychainAccount: parsed.clientKeychainAccount ?? "default",
    deepseekBaseUrl: stripTrailingSlash(parsed.deepseekBaseUrl ?? "https://api.deepseek.com"),
    deepseekKeychainService: parsed.deepseekKeychainService ?? "com.friend-codex-router.deepseek",
    deepseekKeychainAccount: parsed.deepseekKeychainAccount ?? "default",
    qwenBaseUrl: stripTrailingSlash(parsed.qwenBaseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    qwenKeychainService: parsed.qwenKeychainService ?? "com.friend-codex-router.qwen",
    qwenKeychainAccount: parsed.qwenKeychainAccount ?? "default",
    modelRoutes: parsed.modelRoutes ?? defaultModelRoutes(),
    visionBaseUrl: stripTrailingSlash(parsed.visionBaseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    visionModel: parsed.visionModel ?? "qwen-vl-max",
    cacheFile: path.resolve(expandHome(parsed.cacheFile ?? "~/Library/Application Support/Friend Codex Router/vision-cache.json")),
    usageFile: path.resolve(expandHome(parsed.usageFile ?? "~/Library/Application Support/Friend Codex Router/usage.json")),
    usageWindow: parsed.usageWindow ?? "week",
    modelPricing: parsed.modelPricing ?? {},
    visionPromptVersion: parsed.visionPromptVersion ?? "general-v1",
    maxAutoVisionPerRequest: integer(parsed.maxAutoVisionPerRequest, 1),
    maxRequestBytes: integer(parsed.maxRequestBytes, 25 * 1024 * 1024),
    maxImageBytes: integer(parsed.maxImageBytes, 20 * 1024 * 1024),
    visionTimeoutMs: integer(parsed.visionTimeoutMs, 45_000),
    updateManifestURL: parsed.updateManifestURL ?? "",
    updatePublicKeyBase64: parsed.updatePublicKeyBase64 ?? "",
    updateCheckIntervalSeconds: integer(parsed.updateCheckIntervalSeconds, 900),
    configPath: resolvedPath
  };
  validateConfig(config);
  return config;
}

export function loadSecrets(config) {
  return {
    clientKey: process.env.FRIEND_ROUTER_CLIENT_KEY
      ?? readKeychain(config.clientKeychainService, config.clientKeychainAccount),
    deepseekKey: process.env.FRIEND_ROUTER_DEEPSEEK_KEY
      ?? readKeychain(config.deepseekKeychainService, config.deepseekKeychainAccount),
    qwenKey: process.env.FRIEND_ROUTER_QWEN_KEY
      ?? readKeychain(config.qwenKeychainService, config.qwenKeychainAccount),
    visionKey: process.env.FRIEND_ROUTER_QWEN_KEY
      ?? readKeychain(config.qwenKeychainService, config.qwenKeychainAccount)
  };
}

function defaultModelRoutes() {
  return {
    "DeepSeek/deepseek-chat": { provider: "deepseek", upstreamModel: "deepseek-chat" },
    "DeepSeek/deepseek-reasoner": { provider: "deepseek", upstreamModel: "deepseek-reasoner" },
    "Alibaba Bailian/qwen3-coder-plus": { provider: "qwen", upstreamModel: "qwen3-coder-plus" }
  };
}

export function readKeychain(service, account) {
  try {
    return execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", service, "-a", account],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
  } catch {
    throw new Error(`Missing macOS Keychain secret for service ${service} and account ${account}.`);
  }
}

function validateConfig(config) {
  if (config.listenHost !== "127.0.0.1" && config.listenHost !== "::1" && config.listenHost !== "localhost") {
    throw new Error("listenHost must remain loopback-only in the internal build.");
  }
  if (!Number.isInteger(config.listenPort) || config.listenPort < 1 || config.listenPort > 65535) {
    throw new Error("listenPort must be a valid TCP port.");
  }
  for (const [label, value] of [
    ["deepseekBaseUrl", config.deepseekBaseUrl],
    ["qwenBaseUrl", config.qwenBaseUrl],
    ["visionBaseUrl", config.visionBaseUrl]
  ]) {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${label} must use http or https.`);
    }
  }
  if (config.maxAutoVisionPerRequest < 0 || config.maxAutoVisionPerRequest > 8) {
    throw new Error("maxAutoVisionPerRequest must be between 0 and 8.");
  }
}

function integer(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}
