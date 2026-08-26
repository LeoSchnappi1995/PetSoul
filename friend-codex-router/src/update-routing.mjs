import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providerKeychainService } from "./config.mjs";

export async function updateRouting(options = {}) {
  const supportDir = options.supportDir ?? path.join(os.homedir(), "Library/Application Support/Friend Codex Router");
  const configPath = path.join(supportDir, "config.json");
  await mkdir(supportDir, { recursive: true });
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    config = JSON.parse(await readFile(path.join(projectRoot, "config.example.json"), "utf8"));
  }
  const textProvider = options.textProvider ?? parseProvider(process.env.FRIEND_ROUTER_TEXT_PROVIDER_JSON);
  const visionProvider = options.visionProvider ?? parseProvider(process.env.FRIEND_ROUTER_VISION_PROVIDER_JSON);
  if (textProvider) {
    config.providers ??= {};
    config.providers[textProvider.id] = providerConfig(textProvider);
    config.textRoute = { provider: textProvider.id, model: textProvider.model };
    config.codexModel = "friend-router/text";
    config.modelRoutes ??= {};
    config.modelRoutes["friend-router/text"] = { provider: textProvider.id, upstreamModel: textProvider.model };
  }
  if (visionProvider) {
    config.providers ??= {};
    config.providers[visionProvider.id] = providerConfig(visionProvider);
    config.visionRoute = { provider: visionProvider.id, model: visionProvider.model };
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return { configPath, textRoute: config.textRoute, visionRoute: config.visionRoute };
}

function parseProvider(raw) {
  if (!raw) return undefined;
  const value = JSON.parse(raw);
  for (const key of ["id", "name", "baseUrl", "model"]) if (!value[key]) throw new Error(`Provider configuration is missing ${key}.`);
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

async function main() {
  const result = await updateRouting();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
