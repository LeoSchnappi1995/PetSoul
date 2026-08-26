import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { VisionCache } from "../src/cache.mjs";
import { createRouterServer } from "../src/server.mjs";

const codexPath = process.env.CODEX_CLI_PATH ?? "/Applications/ChatGPT.app/Contents/Resources/codex";
const mockProvider = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (body.stream) {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ model: body.model, choices: [{ delta: { role: "assistant", content: "SELF_CONTAINED_OK" }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ model: body.model, choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 3, total_tokens: 103 } })}\n\n`);
    response.end("data: [DONE]\n\n");
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    model: body.model,
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: "SELF_CONTAINED_OK" } }],
    usage: { prompt_tokens: 100, completion_tokens: 3, total_tokens: 103 }
  }));
});

await listen(mockProvider);
const providerPort = mockProvider.address().port;
const { server: router } = await createRouterServer({
  config: {
    listenHost: "127.0.0.1",
    listenPort: 0,
    codexModel: "DeepSeek/deepseek-chat",
    providers: {
      deepseek: { name: "DeepSeek", baseUrl: `http://127.0.0.1:${providerPort}` },
      bailian: { name: "Bailian", baseUrl: `http://127.0.0.1:${providerPort}` }
    },
    textRoute: { provider: "deepseek", model: "deepseek-chat" },
    visionRoute: { provider: "bailian", model: "qwen-vl-test" },
    modelRoutes: { "DeepSeek/deepseek-chat": { provider: "deepseek", upstreamModel: "deepseek-chat" } },
    cacheFile: ":memory:",
    usageFile: ":memory:",
    usageWindow: "week",
    modelPricing: {},
    visionPromptVersion: "test-v1",
    maxAutoVisionPerRequest: 1,
    maxRequestBytes: 30 * 1024 * 1024,
    maxImageBytes: 1024 * 1024,
    visionTimeoutMs: 5000
  },
  secrets: { clientKey: "local-key", providerKeys: { deepseek: "deepseek-key", bailian: "qwen-key" }, visionKey: "qwen-key" },
  cache: new VisionCache(":memory:")
});
await listen(router);
const routerPort = router.address().port;
const codexHome = await mkdtemp(path.join(os.tmpdir(), "friend-router-codex-smoke-"));
await writeFile(path.join(codexHome, "config.toml"), `model_provider = "friend_router"
model = "DeepSeek/deepseek-chat"
disable_response_storage = true
approval_policy = "never"
sandbox_mode = "read-only"

[model_providers.friend_router]
name = "Friend Codex Router Smoke"
base_url = "http://127.0.0.1:${routerPort}/v1"
wire_api = "responses"
requires_openai_auth = false
experimental_bearer_token = "local-key"
supports_websockets = false
`);

try {
  const result = await run(codexPath, ["exec", "--skip-git-repo-check", "--color", "never", "Reply exactly SELF_CONTAINED_OK"], {
    ...process.env,
    CODEX_HOME: codexHome,
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost"
  });
  if (!`${result.stdout}\n${result.stderr}`.includes("SELF_CONTAINED_OK")) {
    throw new Error(`Codex did not accept the translated Responses stream.\n${result.stdout}\n${result.stderr}`);
  }
  process.stdout.write("CODEX_SELF_CONTAINED_SMOKE_OK\n");
} finally {
  await close(router);
  await close(mockProvider);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex smoke test timed out."));
    }, 45_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Codex exited ${code}.\n${stdout}\n${stderr}`));
    });
  });
}
