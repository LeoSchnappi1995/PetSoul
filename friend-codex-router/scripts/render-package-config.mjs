import { readFile, writeFile } from "node:fs/promises";

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error("Usage: render-package-config.mjs <source> <target>");
const config = JSON.parse(await readFile(source, "utf8"));
if (process.env.UPDATE_MANIFEST_URL) config.updateManifestURL = process.env.UPDATE_MANIFEST_URL;
if (process.env.UPDATE_PUBLIC_KEY_BASE64) config.updatePublicKeyBase64 = process.env.UPDATE_PUBLIC_KEY_BASE64;
if (process.env.UPDATE_CHECK_INTERVAL_SECONDS) config.updateCheckIntervalSeconds = Number(process.env.UPDATE_CHECK_INTERVAL_SECONDS);
await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
