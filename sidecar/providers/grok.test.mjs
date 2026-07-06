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

  it("normalizes the real success fixture (thought/text deltas + end)", () => {
    const fixture = readFileSync(new URL("./fixtures/grok-success.jsonl", import.meta.url), "utf8");
    const parsed = parseGrokJsonl(fixture);
    expect(parsed.rest).toBe("");
    const kinds = new Set(parsed.events.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["thinking_delta", "delta", "done"]));
    const text = parsed.events.filter((e) => e.kind === "delta").map((e) => e.text).join("");
    expect(text).toBe("OK-FIXTURE");
    const done = parsed.events.at(-1);
    expect(done.kind).toBe("done");
    expect(done.ok).toBe(true);
    expect(done.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("normalizes individual real event shapes", () => {
    expect(normalizeGrokMessage({ type: "thought", data: "hm" }))
      .toEqual([{ kind: "thinking_delta", text: "hm" }]);
    expect(normalizeGrokMessage({ type: "text", data: "hi" }))
      .toEqual([{ kind: "delta", text: "hi" }]);
    expect(normalizeGrokMessage({ type: "end", stopReason: "EndTurn", sessionId: "s1", requestId: "r1" }))
      .toEqual([{
        kind: "done", ok: true, sessionId: "s1", result: "",
        usage: { context: 0, output: 0, cost: null, turns: null },
      }]);
    expect(normalizeGrokMessage({ type: "unknown-future-event" })).toEqual([]);
  });

  it("buffers partial JSONL lines across chunks", () => {
    const first = parseGrokJsonl('{"type":"text","da');
    expect(first.events).toEqual([]);
    const second = parseGrokJsonl('ta":"hi"}\n', first.rest);
    expect(second.events).toEqual([{ kind: "delta", text: "hi" }]);
    expect(second.rest).toBe("");
  });
});
