import { describe, expect, it } from "vitest";
import { getProvider } from "./registry.mjs";

describe("provider registry", () => {
  it("exposes only OpenRouter-backed OpenCode models", () => {
    const provider = getProvider("opencode");
    expect(provider).toBeTruthy();
    expect(provider.models).not.toContain("opencode/north-mini-code-free");
    expect(provider.models.every((model) => model.startsWith("openrouter/"))).toBe(true);
  });
});
