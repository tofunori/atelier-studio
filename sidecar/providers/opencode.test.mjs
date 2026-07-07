import { describe, expect, it } from "vitest";
import { normalizeOpenCodeMessage, parseOpenCodeJsonl } from "./opencode.mjs";

describe("opencode provider stream normalization", () => {
  it("normalizes the real headless JSONL event shapes", () => {
    const fixture = [
      '{"type":"step_start","timestamp":1783389776989,"sessionID":"ses_abc","part":{"type":"step-start"}}',
      '{"type":"text","timestamp":1783389776989,"sessionID":"ses_abc","part":{"type":"text","text":"OK"}}',
      '{"type":"step_finish","timestamp":1783389777044,"sessionID":"ses_abc","part":{"reason":"stop","type":"step-finish","tokens":{"total":56153,"input":56086,"output":1,"reasoning":2,"cache":{"write":0,"read":64}},"cost":0.05097910576}}',
      "",
    ].join("\n");
    const parsed = parseOpenCodeJsonl(fixture);
    expect(parsed.rest).toBe("");
    expect(parsed.events).toEqual([
      { kind: "started" },
      { kind: "delta", text: "OK" },
      {
        kind: "usage",
        sessionId: "ses_abc",
        usage: { context: 56086, output: 1, cost: 0.05097910576, turns: null },
      },
    ]);
  });

  it("normalizes individual event shapes", () => {
    expect(normalizeOpenCodeMessage({ type: "text", part: { text: "hi" } }))
      .toEqual([{ kind: "delta", text: "hi" }]);
    expect(normalizeOpenCodeMessage({ type: "reasoning", part: { text: "hm" } }))
      .toEqual([{ kind: "thinking_delta", text: "hm" }]);
    expect(normalizeOpenCodeMessage({
      type: "tool_use",
      part: {
        tool: "glob",
        callID: "call_1",
        state: { status: "completed", title: "README.md", input: { pattern: "README.md" }, output: "README.md" },
        metadata: { openrouter: { reasoning_details: [{ type: "reasoning.text", text: "je cherche" }] } },
      },
    })).toEqual([
      { kind: "thinking_delta", text: "je cherche" },
      {
        kind: "tool_update",
        id: "call_1",
        name: "glob",
        detail: "README.md",
        input: { pattern: "README.md" },
        output: "README.md",
        status: "completed",
        source: null,
      },
    ]);
    expect(normalizeOpenCodeMessage({ type: "error", error: { message: "boom" } }))
      .toEqual([{ kind: "error", message: "boom" }]);
    expect(normalizeOpenCodeMessage({ type: "unknown-future-event" })).toEqual([]);
  });

  it("buffers partial JSONL lines across chunks", () => {
    const first = parseOpenCodeJsonl('{"type":"text","part":{"te');
    expect(first.events).toEqual([]);
    const second = parseOpenCodeJsonl('xt":"hi"}}\n', first.rest);
    expect(second.events).toEqual([{ kind: "delta", text: "hi" }]);
    expect(second.rest).toBe("");
  });
});
