import assert from "node:assert/strict";
import test from "node:test";
import { chatToResponses } from "../src/protocol/chat-to-responses.mjs";
import { responsesToChat } from "../src/protocol/responses-to-chat.mjs";

const route = { selector: "DeepSeek/deepseek-chat", upstreamModel: "deepseek-chat" };

test("Responses messages and tools convert to Chat Completions", () => {
  const converted = responsesToChat({
    model: route.selector,
    instructions: "You are a coding agent.",
    input: [{ role: "user", content: [{ type: "input_text", text: "Patch the file" }] }],
    tools: [
      {
        type: "function",
        name: "read_file",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
      },
      {
        type: "custom",
        name: "apply_patch",
        description: "Apply a patch"
      }
    ],
    stream: true
  }, route);
  assert.equal(converted.payload.model, "deepseek-chat");
  assert.equal(converted.payload.stream, true);
  assert.equal(converted.payload.messages[0].role, "system");
  assert.equal(converted.payload.messages.at(-1).content, "Patch the file");
  assert.equal(converted.payload.tools.length, 2);
  const applyPatch = converted.payload.tools.find((item) => item.function.name === "virtual_apply_patch");
  assert.deepEqual(applyPatch.function.parameters.required, ["patch"]);
});

test("Responses tool history converts back into assistant and tool chat messages", () => {
  const converted = responsesToChat({
    model: route.selector,
    input: [
      { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{\"path\":\"a.txt\"}" },
      { type: "function_call_output", call_id: "call_1", output: "hello" },
      { type: "custom_tool_call", call_id: "call_2", name: "apply_patch", input: "*** Begin Patch" },
      { type: "custom_tool_call_output", call_id: "call_2", output: "Done" }
    ],
    tools: [
      { type: "function", name: "read_file", parameters: { type: "object", properties: {} } },
      { type: "custom", name: "apply_patch" }
    ]
  }, route);
  const assistants = converted.payload.messages.filter((item) => item.role === "assistant" && item.tool_calls);
  const toolOutputs = converted.payload.messages.filter((item) => item.role === "tool");
  assert.equal(assistants[0].tool_calls[0].function.name, "read_file");
  assert.equal(toolOutputs[0].role, "tool");
  assert.equal(assistants[1].tool_calls[0].function.name, "virtual_apply_patch");
  assert.equal(JSON.parse(assistants[1].tool_calls[0].function.arguments).patch, "*** Begin Patch");
});

test("Chat text response converts to a Responses object", () => {
  const context = responsesToChat({ model: route.selector, input: "Hello" }, route);
  const response = chatToResponses({
    model: "deepseek-chat",
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Hi" } }],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
  }, context);
  assert.equal(response.object, "response");
  assert.equal(response.model, route.selector);
  assert.equal(response.output_text, "Hi");
  assert.equal(response.output[0].content[0].type, "output_text");
  assert.equal(response.usage.total_tokens, 12);
});

test("virtual apply_patch function converts to a custom_tool_call", () => {
  const context = responsesToChat({
    model: route.selector,
    input: "Patch it",
    tools: [{ type: "custom", name: "apply_patch" }]
  }, route);
  const response = chatToResponses({
    choices: [{
      finish_reason: "tool_calls",
      message: {
        content: null,
        tool_calls: [{
          id: "tool_1",
          type: "function",
          function: { name: "virtual_apply_patch", arguments: "{\"patch\":\"*** Begin Patch\\n*** End Patch\"}" }
        }]
      }
    }]
  }, context);
  assert.equal(response.output[0].type, "custom_tool_call");
  assert.equal(response.output[0].name, "apply_patch");
  assert.match(response.output[0].input, /Begin Patch/);
});
