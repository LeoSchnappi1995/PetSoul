import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { VisionCache } from "./cache.mjs";
import { loadConfig, loadSecrets } from "./config.mjs";
import { rewriteRequestWithVision } from "./rewrite.mjs";
import { analyzeVision } from "./vision.mjs";
import { UsageStore } from "./usage-store.mjs";
import { createUsageCaptureTransform } from "./usage-capture.mjs";

export async function createRouterServer(options = {}) {
  const config = options.config ?? await loadConfig();
  const secrets = options.secrets ?? loadSecrets(config);
  const fetchFn = options.fetchFn ?? fetch;
  const cache = options.cache ?? new VisionCache(config.cacheFile);
  const usageStore = options.usageStore ?? new UsageStore(config.usageFile ?? ":memory:", { pricing: config.modelPricing ?? {} });
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

      metrics.requests += 1;
      const bodyBuffer = await readRequestBody(request, config.maxRequestBytes);
      let outboundBody = bodyBuffer;
      const contentType = String(request.headers["content-type"] ?? "");
      if (bodyBuffer.length && contentType.includes("application/json") && isResponsesPath(request.url)) {
        const parsed = JSON.parse(bodyBuffer.toString("utf8"));
        requestModel = typeof parsed.model === "string" ? parsed.model : undefined;
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
                baseUrl: config.visionBaseUrl,
                model: config.visionModel,
                source,
                prompt,
                timeoutMs: config.visionTimeoutMs,
                fetchFn
              });
              await usageStore.record({
                model: result.model,
                usage: result.usage,
                cost: result.cost,
                kind: "vision",
                ok: true
              });
              return result;
            } catch (error) {
              await usageStore.record({ model: config.visionModel, kind: "vision", ok: false });
              throw error;
            }
          }
        });
        metrics.visionCalls += rewritten.metrics.newVisionCalls;
        metrics.visionCacheHits += rewritten.metrics.cacheHits;
        metrics.imagePlaceholders += rewritten.metrics.placeholders;
        outboundBody = Buffer.from(JSON.stringify(rewritten.body));
      }

      const upstreamResponse = await fetchFn(`${config.upstreamBaseUrl}${request.url}`, {
        method: request.method,
        headers: upstreamHeaders(request.headers, secrets.upstreamKey, outboundBody.length),
        body: canHaveBody(request.method) ? outboundBody : undefined,
        redirect: "manual"
      });
      response.writeHead(upstreamResponse.status, responseHeaders(upstreamResponse.headers));
      if (!upstreamResponse.body) return response.end();
      if (!shouldTrackUsage(requestUrl.pathname)) {
        return Readable.fromWeb(upstreamResponse.body).pipe(response);
      }
      const capture = createUsageCaptureTransform({
        requestModel,
        contentType: upstreamResponse.headers.get("content-type") ?? "",
        ok: upstreamResponse.ok,
        onComplete: (record) => usageStore.record({ ...record, kind: "text" })
      });
      Readable.fromWeb(upstreamResponse.body).pipe(capture).pipe(response);
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
    version: "0.2.0",
    listen: `${config.listenHost}:${config.listenPort}`,
    upstream: config.upstreamBaseUrl,
    visionModel: config.visionModel,
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

function shouldTrackUsage(pathname = "") {
  return /\/(?:v1\/)?(?:responses|chat\/completions|messages)$/.test(pathname);
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

function upstreamHeaders(input, upstreamKey, contentLength) {
  const headers = {};
  for (const [name, value] of Object.entries(input)) {
    const lower = name.toLowerCase();
    if (["authorization", "host", "connection", "content-length", "transfer-encoding"].includes(lower)) continue;
    if (Array.isArray(value)) headers[name] = value.join(", ");
    else if (value !== undefined) headers[name] = value;
  }
  headers.authorization = `Bearer ${upstreamKey}`;
  if (contentLength) headers["content-length"] = String(contentLength);
  return headers;
}

function responseHeaders(input) {
  const headers = {};
  for (const [name, value] of input.entries()) {
    if (["connection", "keep-alive", "transfer-encoding"].includes(name.toLowerCase())) continue;
    headers[name] = value;
  }
  return headers;
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
