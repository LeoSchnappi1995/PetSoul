import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class UsageStore {
  constructor(file, options = {}) {
    this.file = file;
    this.pricing = options.pricing ?? {};
    this.days = {};
    this.loaded = false;
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (this.file === ":memory:") return;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8"));
      this.days = parsed.days && typeof parsed.days === "object" ? parsed.days : {};
    } catch (error) {
      if (error?.code !== "ENOENT") this.days = {};
    }
  }

  async record(input) {
    const operation = this.queue.then(() => this.recordUnlocked(input));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async recordUnlocked(input) {
    await this.load();
    const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
    const day = localDay(timestamp);
    const model = input.model || "unknown";
    const usage = normalizeUsage(input.usage);
    const cost = finiteNumber(input.cost) ?? calculateCost(this.pricing[model], usage);
    const dayEntry = this.days[day] ??= { models: {} };
    const entry = dayEntry.models[model] ??= emptyModelUsage();
    entry.requests += 1;
    if (input.ok === false) entry.failures += 1;
    entry.inputTokens += usage.inputTokens;
    entry.outputTokens += usage.outputTokens;
    entry.totalTokens += usage.totalTokens;
    entry.cost += cost ?? 0;
    if (input.kind === "vision") entry.visionCalls += 1;
    entry.lastCalledAt = timestamp.toISOString();
    await this.persist();
    return { day, model, ...entry };
  }

  async snapshot(window = "week", now = new Date()) {
    await this.queue;
    await this.load();
    const { start, end } = windowRange(window, now);
    const models = {};
    for (const [day, dayEntry] of Object.entries(this.days)) {
      const date = parseLocalDay(day);
      if (date < start || date > end) continue;
      for (const [model, usage] of Object.entries(dayEntry.models ?? {})) {
        const target = models[model] ??= emptyModelUsage();
        mergeUsage(target, usage);
      }
    }
    const perModel = Object.entries(models)
      .map(([model, usage]) => ({ model, ...usage }))
      .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens || b.requests - a.requests);
    const total = emptyModelUsage();
    for (const item of perModel) mergeUsage(total, item);
    return {
      window,
      period: {
        start: localDay(start),
        end: localDay(end)
      },
      updatedAt: new Date().toISOString(),
      total,
      models: perModel
    };
  }

  async persist() {
    if (this.file === ":memory:") return;
    await mkdir(path.dirname(this.file), { recursive: true });
    const tempFile = `${this.file}.tmp`;
    await writeFile(tempFile, `${JSON.stringify({ version: 1, days: this.days }, null, 2)}\n`, { mode: 0o600 });
    await rename(tempFile, this.file);
  }
}

export function normalizeUsage(value = {}) {
  const inputTokens = integer(value.inputTokens ?? value.input_tokens ?? value.prompt_tokens);
  const outputTokens = integer(value.outputTokens ?? value.output_tokens ?? value.completion_tokens);
  const statedTotal = integer(value.totalTokens ?? value.total_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: statedTotal || inputTokens + outputTokens
  };
}

export function extractCost(value) {
  return finiteNumber(
    value?.cost
    ?? value?.total_cost
    ?? value?.estimated_cost
    ?? value?.usage?.cost
    ?? value?.usage?.total_cost
  );
}

function calculateCost(pricing, usage) {
  if (!pricing || typeof pricing !== "object") return undefined;
  const inputRate = finiteNumber(pricing.inputPerMillion) ?? 0;
  const outputRate = finiteNumber(pricing.outputPerMillion) ?? 0;
  return (usage.inputTokens / 1_000_000) * inputRate + (usage.outputTokens / 1_000_000) * outputRate;
}

function emptyModelUsage() {
  return {
    requests: 0,
    failures: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0,
    visionCalls: 0,
    lastCalledAt: null
  };
}

function mergeUsage(target, source) {
  for (const key of ["requests", "failures", "inputTokens", "outputTokens", "totalTokens", "cost", "visionCalls"]) {
    target[key] += Number(source[key] ?? 0);
  }
  if (source.lastCalledAt && (!target.lastCalledAt || source.lastCalledAt > target.lastCalledAt)) {
    target.lastCalledAt = source.lastCalledAt;
  }
}

function windowRange(window, now) {
  const current = startOfLocalDay(now);
  if (window === "today") return { start: current, end: current };
  if (window === "month") return { start: new Date(current.getFullYear(), current.getMonth(), 1), end: current };
  if (window === "all") return { start: new Date(2000, 0, 1), end: current };
  const weekday = current.getDay() || 7;
  const start = new Date(current);
  start.setDate(current.getDate() - weekday + 1);
  return { start, end: current };
}

function startOfLocalDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function localDay(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function integer(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
