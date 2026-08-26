import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createManifest, generateSigningKey } from "../scripts/publish-update.mjs";

test("published update manifest signs the version, URL, and DMG digest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "friend-router-update-"));
  const privatePath = path.join(root, "private.pem");
  const publicPath = path.join(root, "public.txt");
  const dmgPath = path.join(root, "update.dmg");
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(dmgPath, "test-dmg-content");
  await generateSigningKey({ privatePath, publicPath });
  const manifest = await createManifest({
    dmgPath,
    version: "0.2.0",
    build: 2,
    dmgURL: "https://downloads.example.com/update.dmg",
    privateKeyPath: privatePath,
    outputPath: manifestPath
  });
  const privateKey = await readFile(privatePath, "utf8");
  const publicKey = createPublicKey(privateKey);
  const canonical = Buffer.from(`${manifest.version}\n${manifest.build}\n${manifest.dmgURL}\n${manifest.sha256}\n`);
  assert.equal(verify(null, canonical, publicKey, Buffer.from(manifest.signature, "base64")), true);
  assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), manifest);
});
