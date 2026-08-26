import { randomUUID } from "node:crypto";
import { normalizeUsage } from "../usage-store.mjs";

export function chatToResponses(payload, context) {
  const choice = payload?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const output = [];
  const text = messageText(message.content);
  if (text) output.push(messageItem(text));
  for (const call of message.tool_calls ?? []) {
    const item = toolCallItem(call, context.toolBridge);
    if (item) output.push(item);
  }
  const usage = responseUsage(payload?.usage);
  const response = responseObject({
    id: `resp_${randomUUID().replace(/-/g, "")}`,
    model: context.requestedModel,
    output,
    outputText: text,
    usage,
    status: choice.finish_reason === "length" ? "incomplete" : "completed",
    incompleteReason: choice.finish_reason === "length" ? "max_output_tokens" : null
  });
  return response;
}

export function responseObject(input) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: input.id,
    object: "response",
    created_at: now,
    completed_at: input.status === "completed" ? now : null,
    status: input.status,
    error: null,
    incomplete_details: input.incompleteReason ? { reason: input.incompleteReason } : null,
    instructions: null,
    model: input.model,
    output: input.output,
    output_text: input.outputText ?? "",
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: null,
    store: false,
    temperature: null,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: null,
    truncation: "disabled",
    usage: input.usage
  };
}

export function responseUsage(value) {
  const usage = normalizeUsage(value);
  return {
    input_tokens: usage.inputTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: usage.outputTokens,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: usage.totalTokens
  };
}

export function messageItem(text, id = `msg_${randomUUID().replace(/-/g, "")}`) {
  return {
    id,
    type: "message",
    status: "completed",
    role: "assistant",
    phase: "final_answer",
    content: [{ type: "output_text", text, annotations: [], logprobs: [] }]
  };
}

export function toolCallItem(call, bridge) {
  const name = call?.function?.name;
  if (!name) return undefined;
  const meta = bridge.byBridge.get(name);
  const callId = String(call.id ?? `call_${randomUUID().replace(/-/g, "")}`);
  const argumentsText = String(call.function?.arguments ?? "{}");
  if (meta?.originalType === "custom") {
    const args = parseArguments(argumentsText);
    const input = meta.originalName === "apply_patch" ? args.patch : args.input;
    return {
      id: `ctc_${randomUUID().replace(/-/g, "")}`,
      type: "custom_tool_call",
      status: "completed",
      call_id: callId,
      name: meta.originalName,
      input: typeof input === "string" ? input : ""
    };
  }
  return {
    id: `fc_${randomUUID().replace(/-/g, "")}`,
    type: "function_call",
    status: "completed",
    call_id: callId,
    name: meta?.originalName ?? name,
    arguments: argumentsText
  };
}

function parseArguments(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function messageText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => typeof item === "string" ? item : item?.text ?? "").filter(Boolean).join("\n");
}
