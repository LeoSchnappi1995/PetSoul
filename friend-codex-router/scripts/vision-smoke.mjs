import { fileURLToPath } from "node:url";
import { loadConfig, loadSecrets } from "../src/config.mjs";
import { testProvider } from "../src/provider-check.mjs";

export async function runVisionSmoke(options = {}) {
  const config = options.config ?? await loadConfig(options.configPath);
  const secrets = options.secrets ?? loadSecrets(config);
  const route = config.visionRoute;
  const provider = config.providers[route.provider];
  if (!provider) throw new Error(`Vision provider ${route.provider} is not configured.`);
  const apiKey = secrets.providerKeys?.[route.provider] ?? secrets.visionKey;
  const result = await testProvider({
    provider: {
      id: route.provider,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: route.model
    },
    apiKey,
    kind: "vision",
    timeoutMs: options.timeoutMs ?? 45_000
  });
  return {
    ok: result.ok,
    provider: result.provider,
    model: result.model,
    response: result.response
  };
}

async function main() {
  const result = await runVisionSmoke();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
