import {
  collectImageEntries,
  extractText,
  findLatestUserMessage,
  prepareImageSource,
  replacementNode,
  replaceEntry
} from "./images.mjs";

const explicitReanalysisPattern = /(?:重新|再(?:仔细)?看|再分析|放大|局部|细节|读(?:取)?(?:图中|图片里的)?字|识别文字|ocr|reanaly[sz]e|look again|inspect again|zoom|read the text)/i;

export async function rewriteRequestWithVision(body, options) {
  const cloned = structuredClone(body);
  const latestUser = findLatestUserMessage(cloned);
  const latestUserText = extractText(latestUser?.content ?? latestUser);
  const entries = collectImageEntries(cloned, latestUser);
  const metrics = {
    imagesFound: entries.length,
    newVisionCalls: 0,
    cacheHits: 0,
    placeholders: 0,
    explicitReanalysis: explicitReanalysisPattern.test(latestUserText)
  };
  if (!entries.length) return { body: cloned, metrics };

  for (const entry of entries) {
    try {
      const prepared = await prepareImageSource(entry.source, {
        fetchFn: options.fetchFn,
        maxImageBytes: options.maxImageBytes,
        timeoutMs: options.imageFetchTimeoutMs
      });
      entry.hash = prepared.hash;
      entry.preparedSource = prepared.source;
      entry.cached = await options.cache.get(entry.hash, options.promptVersion);
      if (entry.cached) metrics.cacheHits += 1;
    } catch (error) {
      entry.fingerprintError = formatError(error);
    }
  }

  const analysisTargets = chooseAnalysisTargets(entries, metrics.explicitReanalysis, options.maxAutoVisionPerRequest ?? 1);
  for (const entry of analysisTargets) {
    if (!entry.source || entry.source.kind === "file_id" || entry.source.kind === "reference") continue;
    try {
      const result = await options.analyze({
        source: entry.preparedSource ?? entry.source,
        prompt: buildVisionPrompt(latestUserText, metrics.explicitReanalysis),
        force: metrics.explicitReanalysis,
        hash: entry.hash
      });
      entry.cached = await options.cache.set(entry.hash, options.promptVersion, result);
      metrics.newVisionCalls += 1;
    } catch (error) {
      entry.analysisError = formatError(error);
    }
  }

  for (const entry of entries) {
    let text;
    if (entry.cached) {
      text = cachedSummaryText(entry);
    } else if (entry.analysisError) {
      metrics.placeholders += 1;
      text = `[图片理解失败 image_id=${shortHash(entry.hash)}] ${entry.analysisError}`;
    } else if (entry.fingerprintError) {
      metrics.placeholders += 1;
      text = `[图片未分析] 无法安全读取图片：${entry.fingerprintError}`;
    } else {
      metrics.placeholders += 1;
      const reason = entry.isLatestUser ? "本轮自动视觉预算已用完" : "历史图片没有缓存摘要";
      text = `[图片未分析 image_id=${shortHash(entry.hash)}] ${reason}；如需查看，请明确要求重新分析该图片。`;
    }
    replaceEntry(entry, replacementNode(entry.node, text));
  }

  return { body: cloned, metrics };
}

function chooseAnalysisTargets(entries, explicitReanalysis, limit) {
  if (explicitReanalysis) {
    const latestCurrent = [...entries].reverse().find((entry) => entry.isLatestUser && entry.hash);
    const latestAny = [...entries].reverse().find((entry) => entry.hash);
    return latestCurrent ? [latestCurrent] : latestAny ? [latestAny] : [];
  }
  return entries.filter((entry) => entry.isLatestUser && entry.hash && !entry.cached).slice(0, limit);
}

function buildVisionPrompt(userText, explicitReanalysis) {
  const task = userText.trim().slice(0, 4000);
  if (explicitReanalysis) {
    return `Re-analyze the image for the user's targeted follow-up. Pay special attention to the requested region, OCR, or detail. User follow-up:\n${task || "Inspect the image again."}`;
  }
  return `Analyze this newly attached image once so a text-only coding agent can continue the task without receiving the raw image again. Preserve visible text, layout, objects, relationships, and uncertainty. User request:\n${task || "Describe the image."}`;
}

function cachedSummaryText(entry) {
  return `[视觉理解缓存 image_id=${shortHash(entry.hash)} model=${entry.cached.model ?? "unknown"}]\n${entry.cached.summary}\n[/视觉理解缓存]`;
}

function shortHash(hash) {
  return hash ? `sha256:${hash.slice(0, 16)}` : "unknown";
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
