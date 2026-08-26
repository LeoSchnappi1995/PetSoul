import { createHash } from "node:crypto";

export function responsesToChat(body, route) {
  const toolBridge = buildToolBridge(body.tools ?? []);
  const messages = [];
  const instructions = textValue(body.instructions);
  const bridgeInstructions = toolBridge.instructions.join("\n");
  if (instructions || bridgeInstructions) {
    messages.push({
      role: "system",
      content: [instructions, bridgeInstructions].filter(Boolean).join("\n\n")
    });
  }

  const input = typeof body.input === "string"
    ? [{ role: "user", content: body.input }]
    : Array.isArray(body.input) ? body.input : [];
  for (const item of input) appendInputItem(messages, item, toolBridge);
  if (!messages.some((message) => message.role === "user" || message.role === "tool")) {
    messages.push({ role: "user", content: "Continue the task." });
  }

  const payload = {
    model: route.upstreamModel,
    messages,
    stream: Boolean(body.stream),
    ...(toolBridge.tools.length ? { tools: toolBridge.tools } : {}),
    ...(body.parallel_tool_calls !== undefined ? { parallel_tool_calls: Boolean(body.parallel_tool_calls) } : {}),
    ...(body.max_output_tokens ? { max_tokens: body.max_output_tokens } : {}),
    ...(number(body.temperature) !== undefined ? { temperature: number(body.temperature) } : {}),
    ...(number(body.top_p) !== undefined ? { top_p: number(body.top_p) } : {})
  };
  const toolChoice = mapToolChoice(body.tool_choice, toolBridge);
  if (toolChoice !== undefined) payload.tool_choice = toolChoice;
  if (payload.stream) payload.stream_options = { include_usage: true };
  return {
    payload,
    toolBridge,
    requestedModel: route.selector
  };
}

function appendInputItem(messages, item, toolBridge) {
  if (typeof item === "string") {
    messages.push({ role: "user", content: item });
    return;
  }
  if (!record(item)) return;
  const type = String(item.type ?? "");
  if (item.role) {
    const role = item.role === "developer" ? "system" : item.role;
    const content = contentText(item.content);
    if (content) messages.push({ role, content });
    return;
  }
  if (type === "function_call" || type === "custom_tool_call") {
    const originalName = String(item.name ?? "tool");
    const bridgeName = toolBridge.byOriginal.get(originalName)?.bridgeName ?? safeToolName(originalName);
    const argumentsText = type === "custom_tool_call"
      ? customInputArguments(originalName, String(item.input ?? ""))
      : validArguments(item.arguments);
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [{
        id: String(item.call_id ?? item.id ?? `call_${shortHash(argumentsText)}`),
        type: "function",
        function: { name: bridgeName, arguments: argumentsText }
      }]
    });
    return;
  }
  if (type === "function_call_output" || type === "custom_tool_call_output") {
    messages.push({
      role: "tool",
      tool_call_id: String(item.call_id ?? item.id ?? "unknown_call"),
      content: outputText(item.output)
    });
    return;
  }
  if (type.endsWith("_call_output") && item.call_id) {
    messages.push({ role: "tool", tool_call_id: String(item.call_id), content: outputText(item.output ?? item.result) });
    return;
  }
  if (type === "reasoning") {
    const summary = contentText(item.summary);
    if (summary) messages.push({ role: "assistant", content: summary });
  }
}

export function buildToolBridge(tools) {
  const converted = [];
  const byBridge = new Map();
  const byOriginal = new Map();
  const instructions = [];
  for (const tool of tools) {
    if (!record(tool) || typeof tool.name !== "string") continue;
    if (tool.type !== "function" && tool.type !== "custom") continue;
    const bridgeName = tool.type === "custom"
      ? `virtual_${safeToolName(tool.name)}`.slice(0, 64)
      : safeToolName(tool.name);
    const meta = { bridgeName, originalName: tool.name, originalType: tool.type };
    byBridge.set(bridgeName, meta);
    byOriginal.set(tool.name, meta);
    if (tool.type === "custom") {
      const field = tool.name === "apply_patch" ? "patch" : "input";
      converted.push({
        type: "function",
        function: {
          name: bridgeName,
          description: `${tool.description ?? `Call the ${tool.name} custom tool.`} Put the complete free-form tool input in the ${field} field without Markdown fences.`,
          parameters: {
            type: "object",
            properties: { [field]: { type: "string" } },
            required: [field],
            additionalProperties: false
          }
        }
      });
      instructions.push(`Tool ${bridgeName} represents Codex custom tool ${tool.name}. Its JSON ${field} value must contain the exact raw tool input.`);
    } else {
      converted.push({
        type: "function",
        function: {
          name: bridgeName,
          description: tool.description ?? "",
          parameters: record(tool.parameters) ? tool.parameters : { type: "object", properties: {} }
        }
      });
    }
  }
  return { tools: converted, byBridge, byOriginal, instructions };
}

function mapToolChoice(value, bridge) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (!record(value)) return undefined;
  if (value.type === "function" || value.type === "custom") {
    const original = value.name ?? value.function?.name;
    if (!original) return "auto";
    const name = bridge.byOriginal.get(original)?.bridgeName ?? safeToolName(original);
    return { type: "function", function: { name } };
  }
  return "auto";
}

function contentText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return textValue(value);
  return value.map((part) => {
    if (typeof part === "string") return part;
    if (!record(part)) return "";
    if (typeof part.text === "string") return part.text;
    if (typeof part.refusal === "string") return part.refusal;
    if (part.type === "input_file") return `[File input: ${part.filename ?? part.file_id ?? part.file_url ?? "unavailable"}]`;
    return "";
  }).filter(Boolean).join("\n");
}

function outputText(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("\n");
  if (record(value) && typeof value.text === "string") return value.text;
  return "";
}

function validArguments(value) {
  if (typeof value === "string") return value || "{}";
  return JSON.stringify(record(value) ? value : {});
}

function customInputArguments(name, input) {
  return JSON.stringify(name === "apply_patch" ? { patch: input } : { input });
}

function safeToolName(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9_-]/g, "_");
  if (cleaned.length <= 64) return cleaned || "tool";
  return `${cleaned.slice(0, 54)}_${shortHash(cleaned)}`;
}

function shortHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
