export function resolveModelRoute(config, secrets, requestedModel) {
  const selector = requestedModel && config.modelRoutes[requestedModel]
    ? requestedModel
    : config.codexModel;
  const route = config.modelRoutes[selector];
  if (!route) throw new Error(`No model route is configured for ${requestedModel ?? selector}.`);
  if (route.provider === "deepseek") {
    return {
      selector,
      provider: "deepseek",
      upstreamModel: route.upstreamModel,
      baseUrl: config.deepseekBaseUrl,
      apiKey: secrets.deepseekKey
    };
  }
  if (route.provider === "qwen") {
    return {
      selector,
      provider: "qwen",
      upstreamModel: route.upstreamModel,
      baseUrl: config.qwenBaseUrl,
      apiKey: secrets.qwenKey
    };
  }
  throw new Error(`Unsupported provider ${route.provider}.`);
}

export async function callChatCompletions(route, payload, options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const retries = options.retries ?? 2;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchFn(`${route.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${route.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(options.timeoutMs ?? 300_000)
      });
      if (response.ok) return response;
      const errorBody = await response.text();
      const error = new Error(`${route.provider} returned HTTP ${response.status}: ${providerError(errorBody)}`);
      error.status = response.status;
      if (attempt < retries && retryable(response.status)) {
        await wait(250 * (2 ** attempt));
        continue;
      }
      throw error;
    } catch (error) {
      lastError = error;
      if (attempt < retries && error?.name !== "AbortError") {
        await wait(250 * (2 ** attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error("Provider request failed.");
}

export function modelList(config) {
  return Object.entries(config.modelRoutes).map(([id, route]) => ({
    id,
    object: "model",
    created: 0,
    owned_by: route.provider
  }));
}

function retryable(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function providerError(raw) {
  try {
    const payload = JSON.parse(raw);
    return payload?.error?.message ?? payload?.message ?? raw.slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
