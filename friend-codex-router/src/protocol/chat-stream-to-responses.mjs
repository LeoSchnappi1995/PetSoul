import { randomUUID } from "node:crypto";
import { messageItem, responseObject, responseUsage, toolCallItem } from "./chat-to-responses.mjs";

export async function streamChatAsResponses(upstreamResponse, response, context) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });

  let sequence = 0;
  const responseId = `resp_${randomUUID().replace(/-/g, "")}`;
  let providerModel;
  let usage = responseUsage();
  let finishReason;
  let text = "";
  let textState;
  let nextOutputIndex = 0;
  const toolStates = new Map();
  const output = [];

  const initial = responseObject({
    id: responseId,
    model: context.requestedModel,
    output: [],
    outputText: "",
    usage,
    status: "in_progress",
    incompleteReason: null
  });
  send("response.created", { response: initial });
  send("response.in_progress", { response: initial });

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of upstreamResponse.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, boundary).replace(/\r$/, "");
      buffer = buffer.slice(boundary + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let payload;
      try { payload = JSON.parse(data); } catch { continue; }
      providerModel = payload.model ?? providerModel;
      if (payload.usage) usage = responseUsage(payload.usage);
      const choice = payload.choices?.[0];
      if (!choice) continue;
      finishReason = choice.finish_reason ?? finishReason;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content) {
        if (!textState) {
          textState = {
            id: `msg_${randomUUID().replace(/-/g, "")}`,
            outputIndex: nextOutputIndex++
          };
          send("response.output_item.added", {
            output_index: textState.outputIndex,
            item: { id: textState.id, type: "message", status: "in_progress", role: "assistant", phase: "final_answer", content: [] }
          });
          send("response.content_part.added", {
            item_id: textState.id,
            output_index: textState.outputIndex,
            content_index: 0,
            part: { type: "output_text", text: "", annotations: [], logprobs: [] }
          });
        }
        text += delta.content;
        send("response.output_text.delta", {
          item_id: textState.id,
          output_index: textState.outputIndex,
          content_index: 0,
          delta: delta.content,
          logprobs: []
        });
      }
      for (const callDelta of delta.tool_calls ?? []) {
        const index = Number(callDelta.index ?? 0);
        let state = toolStates.get(index);
        if (!state) {
          state = {
            id: callDelta.id ?? `call_${randomUUID().replace(/-/g, "")}`,
            name: callDelta.function?.name ?? "",
            arguments: "",
            itemId: undefined,
            outputIndex: undefined,
            meta: undefined
          };
          toolStates.set(index, state);
        }
        if (callDelta.id) state.id = callDelta.id;
        if (callDelta.function?.name) state.name = callDelta.function.name;
        if (state.name && !state.itemId) {
          state.meta = context.toolBridge.byBridge.get(state.name);
          state.itemId = `${state.meta?.originalType === "custom" ? "ctc" : "fc"}_${randomUUID().replace(/-/g, "")}`;
          state.outputIndex = nextOutputIndex++;
          send("response.output_item.added", {
            output_index: state.outputIndex,
            item: inProgressToolItem(state)
          });
        }
        const argumentsDelta = callDelta.function?.arguments;
        if (typeof argumentsDelta === "string" && argumentsDelta) {
          state.arguments += argumentsDelta;
          if (state.itemId && state.meta?.originalType !== "custom") {
            send("response.function_call_arguments.delta", {
              item_id: state.itemId,
              output_index: state.outputIndex,
              delta: argumentsDelta
            });
          }
        }
      }
    }
  }

  if (textState) {
    const item = messageItem(text, textState.id);
    send("response.output_text.done", {
      item_id: textState.id,
      output_index: textState.outputIndex,
      content_index: 0,
      text,
      logprobs: []
    });
    send("response.content_part.done", {
      item_id: textState.id,
      output_index: textState.outputIndex,
      content_index: 0,
      part: item.content[0]
    });
    send("response.output_item.done", { output_index: textState.outputIndex, item });
    output[textState.outputIndex] = item;
  }

  for (const state of [...toolStates.values()].sort((a, b) => a.outputIndex - b.outputIndex)) {
    if (!state.itemId) continue;
    const final = toolCallItem({
      id: state.id,
      function: { name: state.name, arguments: state.arguments }
    }, context.toolBridge);
    if (!final) continue;
    final.id = state.itemId;
    if (state.meta?.originalType === "custom") {
      send("response.custom_tool_call_input.done", {
        item_id: state.itemId,
        output_index: state.outputIndex,
        input: final.input
      });
    } else {
      send("response.function_call_arguments.done", {
        item_id: state.itemId,
        output_index: state.outputIndex,
        name: final.name,
        arguments: final.arguments
      });
    }
    send("response.output_item.done", { output_index: state.outputIndex, item: final });
    output[state.outputIndex] = final;
  }

  const status = finishReason === "length" ? "incomplete" : "completed";
  const completed = responseObject({
    id: responseId,
    model: context.requestedModel,
    output: output.filter(Boolean),
    outputText: text,
    usage,
    status,
    incompleteReason: status === "incomplete" ? "max_output_tokens" : null
  });
  send(status === "completed" ? "response.completed" : "response.incomplete", { response: completed });
  response.end();
  return {
    model: context.requestedModel ?? providerModel,
    usage,
    ok: true,
    output: completed.output
  };

  function send(type, payload) {
    sequence += 1;
    const event = { type, sequence_number: sequence, ...payload };
    response.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
}

function inProgressToolItem(state) {
  if (state.meta?.originalType === "custom") {
    return {
      id: state.itemId,
      type: "custom_tool_call",
      status: "in_progress",
      call_id: state.id,
      name: state.meta.originalName,
      input: ""
    };
  }
  return {
    id: state.itemId,
    type: "function_call",
    status: "in_progress",
    call_id: state.id,
    name: state.meta?.originalName ?? state.name,
    arguments: ""
  };
}
