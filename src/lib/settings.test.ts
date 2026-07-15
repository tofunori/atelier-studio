import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";

beforeEach(() => localStorage.clear());

describe("settings defaults", () => {
  it("utilise Sonnet 5 en contexte 1M et xhigh par défaut pour Claude", () => {
    expect(DEFAULT_SETTINGS.defaultModel.claude).toBe("claude-sonnet-5[1m]");
    expect(DEFAULT_SETTINGS.defaultEffort.claude).toBe("xhigh");
  });

  it("utilise GPT-5.6 Sol medium par défaut pour Codex", () => {
    expect(DEFAULT_SETTINGS.defaultModel.codex).toBe("gpt-5.6-sol");
    expect(DEFAULT_SETTINGS.defaultEffort.codex).toBe("medium");
  });

  it("migre l'ancien défaut GPT-5.5 sans écraser un autre choix explicite", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({
      defaultModel: { codex: "gpt-5.5" },
    }));
    expect(loadSettings().defaultModel.codex).toBe("gpt-5.6-sol");

    localStorage.setItem("atelier-studio.settings", JSON.stringify({
      defaultModel: { codex: "gpt-5.6-terra" },
    }));
    expect(loadSettings().defaultModel.codex).toBe("gpt-5.6-terra");
  });

  it("applique la migration Claude une seule fois", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({
      defaultModel: { claude: "claude-fable-5" },
      defaultEffort: { claude: "high" },
    }));
    expect(loadSettings()).toMatchObject({
      defaultModel: { claude: "claude-sonnet-5[1m]" },
      defaultEffort: { claude: "xhigh" },
    });

    localStorage.setItem("atelier-studio.settings", JSON.stringify({
      defaultModel: { claude: "claude-opus-4-8[1m]" },
      defaultEffort: { claude: "medium" },
    }));
    expect(loadSettings()).toMatchObject({
      defaultModel: { claude: "claude-opus-4-8[1m]" },
      defaultEffort: { claude: "medium" },
    });
  });

  it("revient au panneau Chat à chaque démarrage", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({
      activeView: "highlights",
    }));
    expect(loadSettings().activeView).toBe("chats");
  });
});
