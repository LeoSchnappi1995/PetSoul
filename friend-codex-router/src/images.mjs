import { createHash } from "node:crypto";

const imageTypePattern = /image/i;

export function findLatestUserMessage(body) {
  for (const field of ["input", "messages"]) {
    const value = body?.[field];
    if (!Array.isArray(value)) continue;
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const item = value[index];
      if (isRecord(item) && item.role === "user") return item;
    }
  }
  return undefined;
}

export function extractText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (!isRecord(value)) return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  return "";
}

export function collectImageEntries(root, latestUserMessage) {
  const entries = [];
  walk(root, undefined, undefined, false);
  return entries;

  function walk(value, parent, key, insideLatestUser) {
    const currentInsideLatest = insideLatestUser || value === latestUserMessage;
    if (isImageNode(value)) {
      entries.push({
        node: value,
        parent,
        key,
        isLatestUser: currentInsideLatest,
        source: imageSource(value)
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, value, index, currentInsideLatest));
      return;
    }
    if (!isRecord(value)) return;
    for (const [childKey, child] of Object.entries(value)) {
      walk(child, value, childKey, currentInsideLatest);
    }
  }
}

export function isImageNode(value) {
  if (!isRecord(value)) return false;
  const type = typeof value.type === "string" ? value.type : "";
  if (imageTypePattern.test(type)) {
    return Boolean(imageSource(value));
  }
  if (isRecord(value.source)) {
    const mediaType = typeof value.source.media_type === "string" ? value.source.media_type : "";
    return mediaType.startsWith("image/") && Boolean(imageSource(value));
  }
  return false;
}

export function imageSource(node) {
  if (!isRecord(node)) return undefined;
  const imageUrl = isRecord(node.image_url) ? node.image_url.url : node.image_url;
  if (typeof imageUrl === "string" && imageUrl) return classifyStringSource(imageUrl, node);
  if (typeof node.url === "string" && node.url) return classifyStringSource(node.url, node);
  if (typeof node.image_base64 === "string" && node.image_base64) {
    return base64Source(node.image_base64, node.media_type ?? node.mime_type);
  }
  if (typeof node.base64 === "string" && node.base64) {
    return base64Source(node.base64, node.media_type ?? node.mime_type);
  }
  if (isRecord(node.source)) {
    if (typeof node.source.data === "string" && node.source.data) {
      return base64Source(node.source.data, node.source.media_type);
    }
    if (typeof node.source.url === "string" && node.source.url) {
      return classifyStringSource(node.source.url, node.source);
    }
  }
  if (typeof node.file_id === "string" && node.file_id) {
    return { kind: "file_id", value: node.file_id };
  }
  return undefined;
}

export async function fingerprintImage(source, options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const maxImageBytes = options.maxImageBytes ?? 20 * 1024 * 1024;
  if (!source) throw new Error("Image source is missing.");
  if (source.kind === "data") {
    const bytes = decodeBase64(source.value);
    enforceSize(bytes.byteLength, maxImageBytes);
    return sha256(bytes);
  }
  if (source.kind === "url") {
    try {
      const response = await fetchFn(source.value, { signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length) enforceSize(length, maxImageBytes);
      const bytes = Buffer.from(await response.arrayBuffer());
      enforceSize(bytes.byteLength, maxImageBytes);
      return sha256(bytes);
    } catch {
      return sha256(Buffer.from(`url:${source.value}`));
    }
  }
  return sha256(Buffer.from(`${source.kind}:${source.value}`));
}

export function sourceAsVisionUrl(source) {
  if (source.kind === "url") return source.value;
  if (source.kind === "data") {
    return `data:${source.mimeType ?? "image/png"};base64,${stripDataUrlPrefix(source.value)}`;
  }
  throw new Error(`Unsupported vision source kind: ${source.kind}`);
}

export function replacementNode(originalNode, text) {
  const originalType = typeof originalNode?.type === "string" ? originalNode.type : "";
  return {
    type: originalType.startsWith("input_") ? "input_text" : "text",
    text
  };
}

export function replaceEntry(entry, replacement) {
  if (!entry.parent) throw new Error("Cannot replace a root image node.");
  entry.parent[entry.key] = replacement;
}

function classifyStringSource(value, node) {
  if (value.startsWith("data:image/")) {
    const match = value.match(/^data:([^;,]+);base64,(.*)$/s);
    return match
      ? { kind: "data", mimeType: match[1], value: match[2] }
      : { kind: "data", mimeType: node.media_type ?? node.mime_type, value };
  }
  if (/^https?:\/\//i.test(value)) return { kind: "url", value };
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 128) {
    return base64Source(value, node.media_type ?? node.mime_type);
  }
  return { kind: "reference", value };
}

function base64Source(value, mimeType) {
  return { kind: "data", mimeType: typeof mimeType === "string" ? mimeType : "image/png", value: stripDataUrlPrefix(value) };
}

function stripDataUrlPrefix(value) {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
}

function decodeBase64(value) {
  return Buffer.from(stripDataUrlPrefix(value).replace(/\s+/g, ""), "base64");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function enforceSize(size, max) {
  if (size > max) throw new Error(`Image exceeds ${max} bytes.`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
