import { describe, expect, it } from "vitest";
import { parseInteractionFromWire } from "./interactionTypes.ts";

describe("parseInteractionFromWire", () => {
  it("parses approval pending", () => {
    const p = parseInteractionFromWire({
      kind: "interaction",
      requestId: "req-1",
      interactionType: "approval",
      title: "Write?",
      state: "pending",
    });
    expect(p?.requestId).toBe("req-1");
    expect(p?.state).toBe("pending");
  });

  it("null if not interaction", () => {
    expect(parseInteractionFromWire({ kind: "text" })).toBeNull();
  });
});
