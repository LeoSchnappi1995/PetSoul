import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function generateSigningKey(input) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const rawPublicKey = Buffer.from(publicDer).subarray(-32);
  await writeFile(input.privatePath, privatePem, { mode: 0o600 });
  await chmod(input.privatePath, 0o600);
  await writeFile(input.publicPath, `${rawPublicKey.toString("base64")}\n`, { mode: 0o644 });
  return { privatePath: input.privatePath, publicPath: input.publicPath, publicKeyBase64: rawPublicKey.toString("base64") };
}

export async function createManifest(input) {
  const dmg = await readFile(input.dmgPath);
  const sha256 = createHash("sha256").update(dmg).digest("hex");
  const canonical = Buffer.from(`${input.version}\n${input.build}\n${input.dmgURL}\n${sha256}\n`);
  const privateKey = await readFile(input.privateKeyPath, "utf8");
  const signature = sign(null, canonical, privateKey).toString("base64");
  const manifest = {
    version: input.version,
    build: Number(input.build),
    dmgURL: input.dmgURL,
    sha256,
    signature,
    publishedAt: new Date().toISOString()
  };
  await writeFile(input.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function values(args) {
  return Object.fromEntries(args.filter((item) => item.startsWith("--") && item.includes("="))
    .map((item) => {
      const index = item.indexOf("=");
      return [item.slice(2, index), item.slice(index + 1)];
    }));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = values(args);
  let result;
  if (command === "generate-key") {
    if (!options.private || !options.public) throw new Error("generate-key requires --private=... and --public=...");
    result = await generateSigningKey({ privatePath: path.resolve(options.private), publicPath: path.resolve(options.public) });
  } else if (command === "manifest") {
    for (const key of ["dmg", "version", "build", "url", "private", "out"]) {
      if (!options[key]) throw new Error(`manifest requires --${key}=...`);
    }
    result = await createManifest({
      dmgPath: path.resolve(options.dmg),
      version: options.version,
      build: Number(options.build),
      dmgURL: options.url,
      privateKeyPath: path.resolve(options.private),
      outputPath: path.resolve(options.out)
    });
  } else {
    throw new Error("Usage: publish-update.mjs generate-key|manifest [options]");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
