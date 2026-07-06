import { describe, expect, it } from "vitest";
import { parseSseChunk, loadApiProviderConfigs } from "./openai_api.mjs";

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

describe("api provider config", () => {
  it("returns [] for a missing config file", () => {
    expect(loadApiProviderConfigs("/nonexistent/api_providers.json")).toEqual([]);
  });
});
