import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class VisionCache {
  constructor(file, options = {}) {
    this.file = file;
    this.maxEntries = options.maxEntries ?? 500;
    this.entries = new Map();
    this.loaded = false;
    this.stats = { hits: 0, misses: 0, writes: 0, corruptions: 0 };
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (this.file === ":memory:") return;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8"));
      for (const [key, value] of Object.entries(parsed.entries ?? {})) {
        if (isCacheEntry(value)) this.entries.set(key, value);
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      this.stats.corruptions += 1;
      this.entries.clear();
    }
  }

  key(hash, promptVersion) {
    return `${promptVersion}:${hash}`;
  }

  async get(hash, promptVersion) {
    await this.load();
    const key = this.key(hash, promptVersion);
    const entry = this.entries.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return undefined;
    }
    this.stats.hits += 1;
    entry.lastUsedAt = new Date().toISOString();
    return { ...entry };
  }

  async set(hash, promptVersion, value) {
    await this.load();
    const now = new Date().toISOString();
    const entry = {
      hash,
      promptVersion,
      summary: value.summary,
      model: value.model,
      createdAt: value.createdAt ?? now,
      lastUsedAt: now
    };
    this.entries.set(this.key(hash, promptVersion), entry);
    this.trim();
    this.stats.writes += 1;
    await this.persist();
    return { ...entry };
  }

  async persist() {
    if (this.file === ":memory:") return;
    await mkdir(path.dirname(this.file), { recursive: true });
    const tempFile = `${this.file}.tmp`;
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(this.entries)
    };
    await writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    await rename(tempFile, this.file);
  }

  trim() {
    if (this.entries.size <= this.maxEntries) return;
    const ordered = [...this.entries.entries()].sort((a, b) =>
      String(a[1].lastUsedAt).localeCompare(String(b[1].lastUsedAt))
    );
    for (const [key] of ordered.slice(0, this.entries.size - this.maxEntries)) {
      this.entries.delete(key);
    }
  }

  snapshot() {
    return {
      entries: this.entries.size,
      ...this.stats
    };
  }
}

function isCacheEntry(value) {
  return value
    && typeof value === "object"
    && typeof value.hash === "string"
    && typeof value.promptVersion === "string"
    && typeof value.summary === "string";
}
