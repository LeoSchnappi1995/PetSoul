import { createHash } from "node:crypto";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, loadConfig } from "./config.mjs";

const managedStart = "# >>> Friend Codex Router managed provider >>>";
const managedEnd = "# <<< Friend Codex Router managed provider <<<";

export async function installCodex(options = {}) {
  const routerConfig = options.routerConfig ?? await loadConfig(options.routerConfigPath);
  const codexHome = path.resolve(expandHome(options.codexHome ?? process.env.CODEX_HOME ?? "~/.codex"));
  const configPath = path.join(codexHome, "config.toml");
  const supportDir = path.resolve(expandHome(options.supportDir ?? "~/Library/Application Support/Friend Codex Router"));
  const statePath = path.join(supportDir, "codex-install-state.json");
  const helperPath = path.join(supportDir, "bin", "read-client-key");
  await mkdir(codexHome, { recursive: true });
  await mkdir(path.dirname(helperPath), { recursive: true });
  await mkdir(supportDir, { recursive: true });

  const current = await readOptional(configPath);
  const priorState = await readJsonOptional(statePath);
  const original = priorState?.original ?? {
    existed: current !== undefined,
    content: current ?? ""
  };
  await writeFile(
    helperPath,
    keychainHelper(routerConfig.clientKeychainService, routerConfig.clientKeychainAccount),
    { mode: 0o700 }
  );

  const model = options.model ?? routerConfig.codexModel;
  const baseUrl = `http://${routerConfig.listenHost}:${routerConfig.listenPort}/v1`;
  const installedContent = patchCodexConfig(current ?? "", { model, baseUrl, helperPath });
  await writeFile(configPath, installedContent, { mode: 0o600 });
  const state = {
    version: 1,
    installedAt: new Date().toISOString(),
    configPath,
    helperPath,
    original,
    installedHash: sha256(installedContent),
    model,
    baseUrl
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  return { configPath, statePath, helperPath, model, baseUrl };
}

export async function restoreCodex(options = {}) {
  const supportDir = path.resolve(expandHome(options.supportDir ?? "~/Library/Application Support/Friend Codex Router"));
  const statePath = path.join(supportDir, "codex-install-state.json");
  const state = await readJsonOptional(statePath);
  if (!state) throw new Error("No Friend Codex Router install state was found.");
  const current = await readOptional(state.configPath);
  if (!options.force && current !== undefined && sha256(current) !== state.installedHash) {
    throw new Error("Codex config changed after installation; refusing to overwrite it. Re-run restore with --force after reviewing the file.");
  }
  if (state.original.existed) {
    await writeFile(state.configPath, state.original.content, { mode: 0o600 });
  } else {
    await unlink(state.configPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  await rm(state.helperPath, { force: true });
  await rm(statePath, { force: true });
  return { restored: true, configPath: state.configPath };
}

export async function codexInstallStatus(options = {}) {
  const supportDir = path.resolve(expandHome(options.supportDir ?? "~/Library/Application Support/Friend Codex Router"));
  const statePath = path.join(supportDir, "codex-install-state.json");
  const state = await readJsonOptional(statePath);
  if (!state) return { installed: false, statePath };
  const current = await readOptional(state.configPath);
  return {
    installed: true,
    configPath: state.configPath,
    model: state.model,
    baseUrl: state.baseUrl,
    unchangedSinceInstall: current !== undefined && sha256(current) === state.installedHash
  };
}

export function patchCodexConfig(content, input) {
  const unmanaged = removeManagedBlock(content);
  const lines = unmanaged.split(/\r?\n/);
  const result = [];
  let inTopLevel = true;
  for (const line of lines) {
    if (/^\s*\[/.test(line)) inTopLevel = false;
    if (inTopLevel && /^\s*(model_provider|model|disable_response_storage)\s*=/.test(line)) continue;
    result.push(line);
  }
  while (result.length && result[0] === "") result.shift();
  while (result.length && result[result.length - 1] === "") result.pop();
  const top = [
    `model_provider = "friend_router"`,
    `model = ${tomlString(input.model)}`,
    `disable_response_storage = true`,
    ""
  ];
  const provider = [
    "",
    managedStart,
    "[model_providers.friend_router]",
    `name = "Friend Codex Router"`,
    `base_url = ${tomlString(input.baseUrl)}`,
    `wire_api = "responses"`,
    `supports_websockets = false`,
    "",
    "[model_providers.friend_router.auth]",
    `command = ${tomlString(input.helperPath)}`,
    `timeout_ms = 5000`,
    `refresh_interval_ms = 300000`,
    managedEnd
  ];
  return `${[...top, ...result, ...provider].join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function removeManagedBlock(content) {
  const start = content.indexOf(managedStart);
  if (start < 0) return content;
  const end = content.indexOf(managedEnd, start);
  if (end < 0) return content.slice(0, start);
  return `${content.slice(0, start)}${content.slice(end + managedEnd.length)}`;
}

function keychainHelper(service, account) {
  return `#!/bin/zsh\nexec /usr/bin/security find-generic-password -w -s ${shellQuote(service)} -a ${shellQuote(account)}\n`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readJsonOptional(file) {
  const value = await readOptional(file);
  return value === undefined ? undefined : JSON.parse(value);
}

async function main() {
  const [command = "status", ...args] = process.argv.slice(2);
  const force = args.includes("--force");
  const modelArg = args.find((arg) => arg.startsWith("--model="));
  const options = { force, ...(modelArg ? { model: modelArg.slice("--model=".length) } : {}) };
  let result;
  if (command === "install") result = await installCodex(options);
  else if (command === "restore") result = await restoreCodex(options);
  else if (command === "status") result = await codexInstallStatus(options);
  else throw new Error("Usage: install-codex.mjs install|restore|status [--model=...] [--force]");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
