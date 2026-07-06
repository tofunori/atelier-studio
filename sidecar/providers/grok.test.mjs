import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeGrokMessage, parseGrokJsonl } from "./grok.mjs";

describe("grok provider stream normalization", () => {
  it("normalizes the real headless error fixture", () => {
    const fixture = readFileSync(new URL("./fixtures/grok-error.jsonl", import.meta.url), "utf8");
    const parsed = parseGrokJsonl(fixture);
    expect(parsed.rest).toBe("");
    expect(parsed.events).toEqual([{
      kind: "error",
      message: "Couldn't create session: Permission denied.: {\n  \"code\": \"FS_PERMISSION_DENIED\",\n  \"detail\": \"Operation not permitted (os error 1)\"\n}",
    }]);
  });

  it("normalizes Claude-style text, thinking, tool, and result events", () => {
    expect(normalizeGrokMessage({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
    })).toEqual([{ kind: "delta", text: "hi" }]);
    expect(normalizeGrokMessage({
      type: "assistant",
      message: { content: [
        { type: "thinking", thinking: "plan" },
        { type: "tool_use", name: "Bash", input: { command: "git status" } },
        { type: "text", text: "done" },
      ] },
    })).toEqual([
      { kind: "thinking", text: "plan" },
      { kind: "tool", name: "Bash", detail: "git status" },
      { kind: "text", text: "done" },
    ]);
    expect(normalizeGrokMessage({
      type: "result",
      subtype: "success",
      usage: { input_tokens: 2, output_tokens: 3 },
    })).toEqual([{
      kind: "done",
      ok: true,
      result: "",
      usage: { context: 2, output: 3, cost: null, turns: null },
    }]);
  });
});
