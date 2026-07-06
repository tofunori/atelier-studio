import { describe, expect, it } from "vitest";
import { parseSseChunk, parseAnthropicSseChunk, loadApiProviderConfigs } from "./openai_api.mjs";

describe("openai-compatible SSE parsing", () => {
  it("parses content deltas and [DONE]", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Bon"}}]}',
      'data: {"choices":[{"delta":{"content":"jour"}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    const { events, rest } = parseSseChunk(sse);
    expect(rest).toBe("");
    expect(events).toEqual([
      { kind: "delta", text: "Bon" },
      { kind: "delta", text: "jour" },
    ]);
  });

  it("parses reasoning deltas (OpenRouter/DeepSeek)", () => {
    const { events } = parseSseChunk('data: {"choices":[{"delta":{"reasoning":"hmm"}}]}\n');
    expect(events).toEqual([{ kind: "thinking_delta", text: "hmm" }]);
  });

  it("parses final usage frame", () => {
    const { events } = parseSseChunk(
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n',
    );
    expect(events).toEqual([{
      kind: "usage",
      usage: { context: 10, output: 5, cost: null, turns: null },
    }]);
  });

  it("buffers partial SSE lines across chunks", () => {
    const first = parseSseChunk('data: {"choices":[{"delta":{"con');
    expect(first.events).toEqual([]);
    const second = parseSseChunk('tent":"hi"}}]}\n', first.rest);
    expect(second.events).toEqual([{ kind: "delta", text: "hi" }]);
  });

  it("surfaces provider error frames", () => {
    const { events } = parseSseChunk('data: {"error":{"message":"quota exceeded"}}\n');
    expect(events).toEqual([{ kind: "error", message: "quota exceeded" }]);
  });
});

describe("anthropic-compatible SSE parsing", () => {
  it("parses text and thinking deltas", () => {
    const sse = [
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Bonjour"}}',
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");
    const { events, rest } = parseAnthropicSseChunk(sse);
    expect(rest).toBe("");
    expect(events).toEqual([
      { kind: "thinking_delta", text: "hmm" },
      { kind: "delta", text: "Bonjour" },
    ]);
  });

  it("merges usage across message_start and message_delta", () => {
    const start = parseAnthropicSseChunk(
      'data: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":0}}}\n',
    );
    expect(start.events).toEqual([{ kind: "usage", usage: { context: 12, output: 0, cost: null, turns: null } }]);
    const delta = parseAnthropicSseChunk(
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n',
    );
    expect(delta.events).toEqual([{ kind: "usage", usage: { context: null, output: 7, cost: null, turns: null } }]);
  });

  it("surfaces error frames", () => {
    const { events } = parseAnthropicSseChunk(
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n',
    );
    expect(events).toEqual([{ kind: "error", message: "Overloaded" }]);
  });
});

describe("api provider config", () => {
  it("returns [] for a missing config file", () => {
    expect(loadApiProviderConfigs("/nonexistent/api_providers.json")).toEqual([]);
  });
});
