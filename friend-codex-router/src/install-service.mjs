import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = "com.friend-codex-router.gateway";

export async function installService(options = {}) {
  const home = os.homedir();
  const supportDir = options.supportDir ?? path.join(home, "Library/Application Support/Friend Codex Router");
  const launchAgentsDir = path.join(home, "Library/LaunchAgents");
  const plistPath = path.join(launchAgentsDir, `${label}.plist`);
  const configPath = options.configPath ?? path.join(supportDir, "config.json");
  const nodePath = options.nodePath ?? process.execPath;
  const serverPath = options.serverPath ?? path.join(projectRoot, "src/server.mjs");
  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(path.join(supportDir, "logs"), { recursive: true });
  await writeFile(plistPath, plist({ supportDir, configPath, nodePath, serverPath }), { mode: 0o600 });
  if (!options.noLoad) {
    bootout(plistPath);
    execFileSync("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath], { stdio: "inherit" });
  }
  return { plistPath, label };
}

export async function uninstallService(options = {}) {
  const plistPath = path.join(os.homedir(), "Library/LaunchAgents", `${label}.plist`);
  if (!options.noLoad) bootout(plistPath);
  await rm(plistPath, { force: true });
  return { removed: true, plistPath };
}

function plist(input) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(input.nodePath)}</string>
    <string>${xml(input.serverPath)}</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>FRIEND_ROUTER_CONFIG</key><string>${xml(input.configPath)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xml(path.join(input.supportDir, "logs/gateway.out.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(input.supportDir, "logs/gateway.err.log"))}</string>
</dict></plist>
`;
}

function bootout(plistPath) {
  try {
    execFileSync("/bin/launchctl", ["bootout", `gui/${process.getuid()}`, plistPath], { stdio: "ignore" });
  } catch {}
}

function xml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function main() {
  const command = process.argv[2] ?? "install";
  let result;
  if (command === "install") result = await installService();
  else if (command === "uninstall") result = await uninstallService();
  else throw new Error("Usage: install-service.mjs install|uninstall");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
