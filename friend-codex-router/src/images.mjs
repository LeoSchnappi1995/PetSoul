import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  return (await prepareImageSource(source, options)).hash;
}

export async function prepareImageSource(source, options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const maxImageBytes = options.maxImageBytes ?? 20 * 1024 * 1024;
  if (!source) throw new Error("Image source is missing.");
  if (source.kind === "data") {
    const bytes = decodeBase64(source.value);
    if (!bytes.length) throw new Error("Image data is empty or invalid base64.");
    enforceSize(bytes.byteLength, maxImageBytes);
    const mimeType = imageMimeType(bytes, source.mimeType);
    return {
      hash: sha256(bytes),
      source: { kind: "data", mimeType, value: bytes.toString("base64") }
    };
  }
  if (source.kind === "url") {
    try {
      const response = await fetchFn(source.value, { signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length) enforceSize(length, maxImageBytes);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("empty response body");
      enforceSize(bytes.byteLength, maxImageBytes);
      const headerType = response.headers.get("content-type")?.split(";")[0];
      const mimeType = imageMimeType(bytes, headerType);
      return {
        hash: sha256(bytes),
        source: { kind: "data", mimeType, value: bytes.toString("base64") }
      };
    } catch (error) {
      throw new Error(`Image download failed from ${safeSourceLabel(source.value)}: ${formatError(error)}`);
    }
  }
  if (source.kind === "file") {
    try {
      const bytes = await readFile(source.value);
      if (!bytes.length) throw new Error("empty file");
      enforceSize(bytes.byteLength, maxImageBytes);
      const mimeType = imageMimeType(bytes, mimeFromExtension(source.value));
      return {
        hash: sha256(bytes),
        source: { kind: "data", mimeType, value: bytes.toString("base64") }
      };
    } catch (error) {
      throw new Error(`Local image read failed for ${safeSourceLabel(source.value)}: ${formatError(error)}`);
    }
  }
  throw new Error(`Unsupported image source kind: ${source.kind}`);
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
  if (/^file:\/\//i.test(value)) {
    try { return { kind: "file", value: fileURLToPath(value) }; } catch { return { kind: "reference", value }; }
  }
  if (path.isAbsolute(value)) return { kind: "file", value };
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

function imageMimeType(bytes, hinted) {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (typeof hinted === "string" && hinted.startsWith("image/")) return hinted;
  throw new Error("Downloaded content is not a supported PNG, JPEG, GIF, or WebP image.");
}

function mimeFromExtension(value) {
  switch (path.extname(value).toLowerCase()) {
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    default: return "image/png";
  }
}

function safeSourceLabel(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.slice(0, 80)}`;
  } catch {
    return path.basename(String(value));
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
