import { describe, expect, it } from "vitest";
import { getProvider } from "./registry.mjs";

describe("provider registry", () => {
  it("exposes the current Codex app-server model catalog", () => {
    const provider = getProvider("codex");
    expect(provider).toBeTruthy();
    expect(provider.defaultModel).toBe("gpt-5.5");
    expect(provider.models).toEqual(["gpt-5.5", "gpt-5.1-codex-max", "gpt-5.1-codex"]);
    expect(provider.capabilities).toMatchObject({ resume: true, steering: true, goals: true });
  });

  it("exposes only OpenRouter-backed OpenCode models", () => {
    const provider = getProvider("opencode");
    expect(provider).toBeTruthy();
    expect(provider.models).not.toContain("opencode/north-mini-code-free");
    expect(provider.models.every((model) => model.startsWith("openrouter/"))).toBe(true);
  });
});
