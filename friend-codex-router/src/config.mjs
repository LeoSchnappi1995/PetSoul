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
  const providers = normalizeProviders(parsed);
  const textRoute = parsed.textRoute ?? legacyTextRoute(parsed);
  const visionRoute = parsed.visionRoute ?? legacyVisionRoute(parsed);
  const modelRoutes = {
    ...(parsed.modelRoutes ?? {}),
    "friend-router/text": { provider: textRoute.provider, upstreamModel: textRoute.model }
  };
  const config = {
    listenHost: parsed.listenHost ?? "127.0.0.1",
    listenPort: integer(parsed.listenPort, 3566),
    codexModel: "friend-router/text",
    clientKeychainService: parsed.clientKeychainService ?? "com.friend-codex-router.client",
    clientKeychainAccount: parsed.clientKeychainAccount ?? "default",
    providers,
    textRoute,
    visionRoute,
    modelRoutes,
    visionBaseUrl: providers[visionRoute.provider].baseUrl,
    visionModel: visionRoute.model,
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
  const requiredProviderIds = new Set([config.textRoute.provider, config.visionRoute.provider]);
  const providerKeys = {};
  for (const providerId of requiredProviderIds) {
    const provider = config.providers[providerId];
    const envName = `FRIEND_ROUTER_PROVIDER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEY`;
    providerKeys[providerId] = process.env[envName]
      ?? legacyProviderEnv(providerId)
      ?? readProviderKey(providerId, provider);
  }
  return {
    clientKey: process.env.FRIEND_ROUTER_CLIENT_KEY
      ?? readKeychain(config.clientKeychainService, config.clientKeychainAccount),
    providerKeys,
    visionKey: providerKeys[config.visionRoute.provider]
  };
}

export function providerKeychainService(providerId) {
  return `com.friend-codex-router.provider.${String(providerId).replace(/[^A-Za-z0-9._-]/g, "_")}`;
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
  for (const [providerId, provider] of Object.entries(config.providers)) {
    const url = new URL(provider.baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Provider ${providerId} must use http or https.`);
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

function normalizeProviders(parsed) {
  if (parsed.providers && typeof parsed.providers === "object") {
    return Object.fromEntries(Object.entries(parsed.providers).map(([id, provider]) => [id, {
      name: provider.name ?? id,
      baseUrl: stripTrailingSlash(provider.baseUrl),
      keychainService: provider.keychainService ?? providerKeychainService(id),
      keychainAccount: provider.keychainAccount ?? "default"
    }]));
  }
  return {
    deepseek: {
      name: "DeepSeek",
      baseUrl: stripTrailingSlash(parsed.deepseekBaseUrl ?? "https://api.deepseek.com"),
      keychainService: providerKeychainService("deepseek"),
      keychainAccount: "default"
    },
    bailian: {
      name: "Alibaba Bailian",
      baseUrl: stripTrailingSlash(parsed.qwenBaseUrl ?? parsed.visionBaseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"),
      keychainService: providerKeychainService("bailian"),
      keychainAccount: "default"
    }
  };
}

function legacyTextRoute(parsed) {
  const selected = parsed.modelRoutes?.[parsed.codexModel];
  if (selected) return { provider: selected.provider === "qwen" ? "bailian" : selected.provider, model: selected.upstreamModel };
  return { provider: "deepseek", model: "deepseek-chat" };
}

function legacyVisionRoute(parsed) {
  return { provider: "bailian", model: parsed.visionModel ?? "qwen-vl-max" };
}

function legacyProviderEnv(providerId) {
  if (providerId === "deepseek") return process.env.FRIEND_ROUTER_DEEPSEEK_KEY;
  if (providerId === "bailian") return process.env.FRIEND_ROUTER_QWEN_KEY;
  return undefined;
}

function readProviderKey(providerId, provider) {
  try {
    return readKeychain(provider.keychainService, provider.keychainAccount);
  } catch (error) {
    const legacyService = providerId === "deepseek"
      ? "com.friend-codex-router.deepseek"
      : providerId === "bailian" ? "com.friend-codex-router.qwen" : undefined;
    if (legacyService) return readKeychain(legacyService, "default");
    throw error;
  }
}
