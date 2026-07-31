import { describe, expect, it } from "vitest";
import { codexSupportsFastMode, modelDisplayLabel } from "./modelCatalog";

describe("modelDisplayLabel", () => {
  it("conserve les libellés intégrés connus", () => {
    expect(modelDisplayLabel("codex", "gpt-5.6-sol")).toBe("GPT-5.6 Sol");
    expect(modelDisplayLabel("claude", "claude-opus-5")).toBe("Opus 5");
  });

  it("retire les préfixes techniques des modèles OpenCode", () => {
    expect(modelDisplayLabel("opencode", "openrouter/z-ai/glm-5.2")).toBe("GLM 5.2");
    expect(modelDisplayLabel("opencode", "opencode/claude-fable-5")).toBe("Claude Fable 5");
    expect(modelDisplayLabel("opencode", "kimi-for-coding/k3")).toBe("Kimi K3");
    expect(modelDisplayLabel("opencode", "openrouter/cohere/north-mini-code:free"))
      .toBe("North Mini Code · Free");
  });

  it("laisse les ids inconnus des autres providers intacts", () => {
    expect(modelDisplayLabel("custom", "org/model-x")).toBe("org/model-x");
  });
});

describe("codexSupportsFastMode", () => {
  it("reconnaît les modèles Codex qui annoncent le niveau priority", () => {
    expect(codexSupportsFastMode("gpt-5.6-sol")).toBe(true);
    expect(codexSupportsFastMode("gpt-5.6-terra")).toBe(true);
    expect(codexSupportsFastMode("gpt-5.6-luna")).toBe(true);
    expect(codexSupportsFastMode("gpt-5.5")).toBe(true);
  });

  it("refuse les modèles Codex sans service_tier et les ids inconnus", () => {
    // service_tiers vide dans le catalogue codex-cli
    expect(codexSupportsFastMode("gpt-5.1-codex")).toBe(false);
    expect(codexSupportsFastMode("gpt-5.1-codex-max")).toBe(false);
    expect(codexSupportsFastMode("gpt-5.4-mini")).toBe(false);
    // modèles d'autres providers : jamais de niveau Fast
    expect(codexSupportsFastMode("claude-opus-5")).toBe(false);
    expect(codexSupportsFastMode("")).toBe(false);
  });
});
