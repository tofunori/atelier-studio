import { describe, expect, it } from "vitest";
import { modelDisplayLabel } from "./modelCatalog";

describe("modelDisplayLabel", () => {
  it("conserve les libellés intégrés connus", () => {
    expect(modelDisplayLabel("codex", "gpt-5.6-sol")).toBe("GPT-5.6 Sol");
  });

  it("retire les préfixes techniques des modèles OpenCode", () => {
    expect(modelDisplayLabel("opencode", "openrouter/z-ai/glm-5.2")).toBe("GLM 5.2");
    expect(modelDisplayLabel("opencode", "opencode/claude-fable-5")).toBe("Claude Fable 5");
    expect(modelDisplayLabel("opencode", "openrouter/cohere/north-mini-code:free"))
      .toBe("North Mini Code · Free");
  });

  it("laisse les ids inconnus des autres providers intacts", () => {
    expect(modelDisplayLabel("custom", "org/model-x")).toBe("org/model-x");
  });
});
