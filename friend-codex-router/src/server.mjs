import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { VisionCache } from "./cache.mjs";
import { loadConfig, loadSecrets } from "./config.mjs";
import { callChatCompletions, modelList, resolveModelRoute } from "./provider-client.mjs";
import { chatToResponses } from "./protocol/chat-to-responses.mjs";
import { streamChatAsResponses } from "./protocol/chat-stream-to-responses.mjs";
import { responsesToChat } from "./protocol/responses-to-chat.mjs";
import { rewriteRequestWithVision } from "./rewrite.mjs";
import { analyzeVision } from "./vision.mjs";
import { extractCost, UsageStore } from "./usage-store.mjs";

export async function createRouterServer(options = {}) {
  const config = options.config ?? await loadConfig();
  const secrets = options.secrets ?? loadSecrets(config);
  const fetchFn = options.fetchFn ?? fetch;
  const cache = options.cache ?? new VisionCache(config.cacheFile);
  const usageStore = options.usageStore ?? new UsageStore(config.usageFile ?? ":memory:", { pricing: config.modelPricing ?? {} });
  const visionProvider = config.providers[config.visionRoute.provider];
  if (!visionProvider) throw new Error(`Vision provider ${config.visionRoute.provider} is not configured.`);
  await cache.load();
  await usageStore.load();
  const metrics = {
    startedAt: new Date().toISOString(),
    requests: 0,
    proxyErrors: 0,
    visionCalls: 0,
    visionCacheHits: 0,
    imagePlaceholders: 0
  };

  const server = http.createServer(async (request, response) => {
    let requestModel;
    try {
      const requestUrl = new URL(request.url, `http://${config.listenHost}:${config.listenPort}`);
      if (requestUrl.pathname === "/health") return json(response, 200, health(config));
      if (requestUrl.pathname === "/metrics") {
        const window = requestUrl.searchParams.get("window") ?? config.usageWindow;
        return json(response, 200, {
          runtime: { ...metrics, cache: cache.snapshot() },
          usage: await usageStore.snapshot(window)
        });
      }
      if (!authorized(request, secrets.clientKey)) return json(response, 401, errorPayload("invalid_local_key", "Invalid Friend Codex Router client key."));
      if (request.method === "GET" && /\/(?:v1\/)?models$/.test(requestUrl.pathname)) {
        return json(response, 200, { object: "list", data: modelList(config) });
      }
      if (request.method !== "POST" || !isResponsesPath(requestUrl.pathname)) {
        return json(response, 404, errorPayload("not_found", "Friend Codex Router supports /v1/responses and /v1/models."));
      }

      metrics.requests += 1;
      const bodyBuffer = await readRequestBody(request, config.maxRequestBytes);
      const contentType = String(request.headers["content-type"] ?? "");
      if (!bodyBuffer.length || !contentType.includes("application/json")) {
        return json(response, 400, errorPayload("invalid_request", "Responses requests must use a JSON body."));
      }
      const parsed = JSON.parse(bodyBuffer.toString("utf8"));
      if (parsed.background) return json(response, 400, errorPayload("unsupported_background", "Background Responses are not supported in the internal build."));
      requestModel = typeof parsed.model === "string" ? parsed.model : config.codexModel;
      const rewritten = await rewriteRequestWithVision(parsed, {
        cache,
        promptVersion: config.visionPromptVersion,
        maxAutoVisionPerRequest: config.maxAutoVisionPerRequest,
        maxImageBytes: config.maxImageBytes,
        fetchFn,
        analyze: async ({ source, prompt }) => {
          try {
            const result = await analyzeVision({
              apiKey: secrets.visionKey,
              baseUrl: visionProvider.baseUrl,
              model: config.visionRoute.model,
              source,
              prompt,
              timeoutMs: config.visionTimeoutMs,
              fetchFn
            });
            await usageStore.record({
                model: `${visionProvider.name}/${result.model}`,
              usage: result.usage,
              cost: result.cost,
              kind: "vision",
              ok: true
            });
            return result;
          } catch (error) {
            await usageStore.record({ model: `${visionProvider.name}/${config.visionRoute.model}`, kind: "vision", ok: false });
            process.stderr.write(`${JSON.stringify({
              time: new Date().toISOString(),
              level: "error",
              event: "vision_request_failed",
              sourceKind: source?.kind ?? "unknown",
              model: config.visionRoute.model,
              error: formatError(error)
            })}\n`);
            throw error;
          }
        }
      });
      metrics.visionCalls += rewritten.metrics.newVisionCalls;
      metrics.visionCacheHits += rewritten.metrics.cacheHits;
      metrics.imagePlaceholders += rewritten.metrics.placeholders;

      const route = resolveModelRoute(config, secrets, requestModel);
      const converted = responsesToChat(rewritten.body, route);
      const upstreamResponse = await callChatCompletions(route, converted.payload, {
        fetchFn,
        timeoutMs: 300_000,
        retries: 2
      });
      const upstreamType = upstreamResponse.headers.get("content-type") ?? "";
      if (converted.payload.stream && upstreamType.includes("text/event-stream")) {
        const result = await streamChatAsResponses(upstreamResponse, response, converted);
        await usageStore.record({ model: converted.requestedModel, usage: result.usage, kind: "text", ok: true });
        return;
      }
      const chatPayload = await upstreamResponse.json();
      const output = chatToResponses(chatPayload, converted);
      await usageStore.record({
        model: converted.requestedModel,
        usage: chatPayload.usage,
        cost: extractCost(chatPayload),
        kind: "text",
        ok: true
      });
      return json(response, 200, output);
    } catch (error) {
      metrics.proxyErrors += 1;
      if (requestModel) await usageStore.record({ model: requestModel, kind: "text", ok: false });
      const status = error?.code === "REQUEST_TOO_LARGE" ? 413 : 502;
      json(response, status, errorPayload("router_error", formatError(error)));
    }
  });

  return { server, config, metrics, cache, usageStore };
}

export async function start() {
  const { server, config } = await createRouterServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.listenPort, config.listenHost, resolve);
  });
  process.stdout.write(`Friend Codex Router listening on http://${config.listenHost}:${config.listenPort}\n`);
  return server;
}

function health(config) {
  return {
    ok: true,
    service: "friend-codex-router",
    version: "0.4.0",
    listen: `${config.listenHost}:${config.listenPort}`,
    providers: ["deepseek", "qwen"],
    visionModel: `${config.providers[config.visionRoute.provider].name}/${config.visionRoute.model}`,
    visionPolicy: "new-image-once-with-cache"
  };
}

function authorized(request, expected) {
  const header = String(request.headers.authorization ?? "");
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected ?? "");
  return suppliedBuffer.length > 0
    && suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function isResponsesPath(url = "") {
  return /\/(?:v1\/)?responses(?:\?|$)/.test(url);
}

async function readRequestBody(request, limit) {
  if (!canHaveBody(request.method)) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) {
      const error = new Error(`Request body exceeds ${limit} bytes.`);
      error.code = "REQUEST_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function canHaveBody(method = "GET") {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

function json(response, status, payload) {
  if (response.headersSent) return response.end();
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length)
  });
  response.end(body);
}

function errorPayload(code, message) {
  return { error: { code, message, type: "friend_codex_router_error" } };
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  start().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
