import { describe, expect, it } from "vitest";
import { parseLinkedAgentMention } from "./linkedAgents";

describe("parseLinkedAgentMention", () => {
  it("extracts a supported agent and leaves the actual task", () => {
    expect(parseLinkedAgentMention("@Codex vérifie le contexte")).toEqual({
      provider: "codex",
      label: "Codex",
      task: "vérifie le contexte",
    });
    expect(parseLinkedAgentMention("@OpenCode: relis ceci")).toEqual({
      provider: "opencode",
      label: "OpenCode",
      task: "relis ceci",
    });
  });

  it("does not confuse files, plugins or unknown mentions with agents", () => {
    expect(parseLinkedAgentMention("regarde @src/App.tsx")).toBeNull();
    expect(parseLinkedAgentMention("utilise @visualize")).toBeNull();
    expect(parseLinkedAgentMention("@Gemini réponds")).toBeNull();
  });
});
