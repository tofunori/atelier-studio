import { describe, expect, it } from "vitest";
import { linkableAgentProviders, type ProviderInfo } from "./providers";

function provider(id: string, over: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id: id as ProviderInfo["id"], label: `${id[0].toUpperCase()}${id.slice(1)} Code`, kind: "cli", version: "1",
    ok: true, models: [], defaultModel: "", efforts: [], capabilities: { atelierSessionsMcp: true }, ...over,
  };
}

describe("linkableAgentProviders", () => {
  it("garde les CLI détectés qui annoncent le MCP atelier-sessions", () => {
    expect(linkableAgentProviders([
      provider("claude"),
      provider("codex", { ok: false }),
      provider("kimi", { capabilities: {} }),
      provider("grok", { kind: "api" }),
      provider("opencode"),
      provider("mistral"),
    ])).toEqual([
      { id: "claude", label: "Claude" },
      { id: "opencode", label: "OpenCode" },
    ]);
  });
});
