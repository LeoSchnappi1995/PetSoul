import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const codexModel = options.codexModel ?? process.env.FRIEND_ROUTER_CODEX_MODEL;
  const visionModel = options.visionModel ?? process.env.FRIEND_ROUTER_VISION_MODEL;
  if (codexModel) config.codexModel = codexModel;
  if (visionModel) config.visionModel = visionModel;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return { configPath, codexModel: config.codexModel, visionModel: config.visionModel };
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
