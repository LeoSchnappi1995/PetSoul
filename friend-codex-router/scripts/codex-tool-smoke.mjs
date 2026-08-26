import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { VisionCache } from "../src/cache.mjs";
import { createRouterServer } from "../src/server.mjs";

const codexPath = process.env.CODEX_CLI_PATH ?? "/Applications/ChatGPT.app/Contents/Resources/codex";
let providerTurn = 0;
const mockProvider = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  providerTurn += 1;
  response.writeHead(200, { "content-type": "text/event-stream" });
  if (providerTurn === 1) {
    const execTool = body.tools?.find((item) => item.function?.name === "exec_command");
    if (!execTool) throw new Error(`Codex exec_command was not bridged to the provider. Tools: ${JSON.stringify(body.tools?.map((item) => item.function?.name))}`);
    const argumentsText = JSON.stringify({ cmd: "pwd", yield_time_ms: 1000, max_output_tokens: 2000 });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "tool_exec_1", type: "function", function: { name: "exec_command", arguments: argumentsText } }] }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })}\n\n`);
  } else {
    const hasToolOutput = body.messages?.some((message) => message.role === "tool" && message.tool_call_id === "tool_exec_1");
    if (!hasToolOutput) throw new Error("Codex tool output was not translated back to Chat Completions.");
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: "TOOL_DONE" }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 140, completion_tokens: 3, total_tokens: 143 } })}\n\n`);
  }
  response.end("data: [DONE]\n\n");
});

await listen(mockProvider);
const providerPort = mockProvider.address().port;
const { server: router } = await createRouterServer({
  config: {
    listenHost: "127.0.0.1", listenPort: 0,
    codexModel: "DeepSeek/deepseek-chat",
    deepseekBaseUrl: `http://127.0.0.1:${providerPort}`,
    qwenBaseUrl: `http://127.0.0.1:${providerPort}`,
    modelRoutes: { "DeepSeek/deepseek-chat": { provider: "deepseek", upstreamModel: "deepseek-chat" } },
    visionBaseUrl: `http://127.0.0.1:${providerPort}`, visionModel: "qwen-vl-test",
    cacheFile: ":memory:", usageFile: ":memory:", usageWindow: "week", modelPricing: {},
    visionPromptVersion: "test-v1", maxAutoVisionPerRequest: 1,
    maxRequestBytes: 30 * 1024 * 1024, maxImageBytes: 1024 * 1024, visionTimeoutMs: 5000
  },
  secrets: { clientKey: "local-key", deepseekKey: "deepseek-key", qwenKey: "qwen-key", visionKey: "qwen-key" },
  cache: new VisionCache(":memory:")
});
await listen(router);
const routerPort = router.address().port;
const smokeDir = await mkdtemp(path.join(os.tmpdir(), "friend-router-tool-smoke-"));
const codexHome = path.join(smokeDir, "codex-home");
await import("node:fs/promises").then(({ mkdir }) => mkdir(codexHome, { recursive: true }));
await writeFile(path.join(codexHome, "config.toml"), `model_provider = "friend_router"
model = "DeepSeek/deepseek-chat"
disable_response_storage = true
approval_policy = "never"
sandbox_mode = "workspace-write"

[model_providers.friend_router]
name = "Friend Codex Router Tool Smoke"
base_url = "http://127.0.0.1:${routerPort}/v1"
wire_api = "responses"
requires_openai_auth = false
experimental_bearer_token = "local-key"
supports_websockets = false
`);

try {
  const result = await run(codexPath, ["exec", "--skip-git-repo-check", "--color", "never", "Run pwd using the shell tool"], {
    ...process.env,
    CODEX_HOME: codexHome,
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost"
  }, smokeDir);
  if (!`${result.stdout}\n${result.stderr}`.includes("TOOL_DONE")) throw new Error("Codex did not complete the post-tool turn.");
  process.stdout.write("CODEX_SELF_CONTAINED_TOOL_SMOKE_OK\n");
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

function close(server) { return new Promise((resolve) => server.close(resolve)); }

function run(command, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Codex tool smoke timed out.")); }, 60_000);
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
