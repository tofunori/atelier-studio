import { beforeEach, describe, expect, it } from "vitest";
import { bootPromotions, DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";

beforeEach(() => localStorage.clear());

describe("settings defaults", () => {
  it("utilise Opus 5 en contexte 1M et xhigh par défaut pour Claude", () => {
    expect(DEFAULT_SETTINGS.defaultModel.claude).toBe("claude-opus-5[1m]");
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
      defaultModel: { claude: "claude-sonnet-5[1m]" },
      defaultEffort: { claude: "high" },
    }));
    expect(loadSettings()).toMatchObject({
      defaultModel: { claude: "claude-opus-5[1m]" },
      defaultEffort: { claude: "high" },
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

  it("replie les surfaces secondaires du rail par défaut et persiste le dépliage", () => {
    expect(loadSettings().railMoreOpen).toBe(false);
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ railMoreOpen: true }));
    expect(loadSettings().railMoreOpen).toBe(true);
  });

  it("promeut l'ancien défaut de taille du chat (15) vers 13.5", () => {
    // profil créé avant le 2026-08-13 : il porte l'ancien défaut hérité
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ chatFontSize: 15 }));
    expect(loadSettings().chatFontSize).toBe(13.5);
  });

  it("ne touche pas une taille de chat choisie explicitement", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ chatFontSize: 17 }));
    expect(loadSettings().chatFontSize).toBe(17);
  });

  it("ne rejoue pas la promotion : un retour à 15 après coup est un choix", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ chatFontSize: 15 }));
    expect(loadSettings().chatFontSize).toBe(13.5);
    // l'utilisateur remet 15 délibérément — le prochain démarrage doit le garder
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ chatFontSize: 15 }));
    expect(loadSettings().chatFontSize).toBe(15);
  });

  it("marque aussi les promotions sans effet, pour ne pas les réexaminer", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ chatFontSize: 17 }));
    loadSettings();
    expect(JSON.parse(localStorage.getItem("atelier-studio.defaults.applied") ?? "[]"))
      .toContain("2026-08-13.chat-font-13_5");
  });

  it("un profil neuf reçoit acceptEdits par défaut (fin du bypassPermissions d'usine)", () => {
    expect(DEFAULT_SETTINGS.defaultPermissionMode).toBe("acceptEdits");
    expect(loadSettings().defaultPermissionMode).toBe("acceptEdits");
  });

  it("promeut l'ancien défaut bypassPermissions vers acceptEdits", () => {
    // profil créé avant ce plan : il porte l'ancien défaut hérité, jamais choisi
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ defaultPermissionMode: "bypassPermissions" }));
    expect(loadSettings().defaultPermissionMode).toBe("acceptEdits");
  });

  it("ne rejoue pas la promotion : un retour explicite à bypassPermissions après coup est un choix", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ defaultPermissionMode: "bypassPermissions" }));
    expect(loadSettings().defaultPermissionMode).toBe("acceptEdits");
    // l'utilisateur remet bypassPermissions délibérément — le prochain démarrage doit le garder
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ defaultPermissionMode: "bypassPermissions" }));
    expect(loadSettings().defaultPermissionMode).toBe("bypassPermissions");
  });

  it("ne touche pas un mode de permission déjà personnalisé", () => {
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ defaultPermissionMode: "plan" }));
    expect(loadSettings().defaultPermissionMode).toBe("plan");
  });

  it("migre les anciens favoris de modèles vers les réglages par provider", () => {
    localStorage.setItem("atelier-studio.favModels", JSON.stringify([
      "opencode:opencode/glm-5.2",
      "opencode:openrouter/north-mini-code:free",
      "codex:gpt-5.6-sol",
    ]));
    expect(loadSettings().favoriteModels).toEqual({
      opencode: ["opencode/glm-5.2", "openrouter/north-mini-code:free"],
      codex: ["gpt-5.6-sol"],
    });
  });

  it("expose les préférences d'affichage du travail avec leurs défauts", () => {
    localStorage.clear();
    const s = loadSettings();
    expect(s.thinkingCollapsed).toBe(true); // repliée par défaut (2026-08-21)
    expect(s.transcriptView).toBe("normal"); // vue de la transcription (2026-08-21)
    expect(s.displayTimestamps).toBe(false);
    saveSettings({ ...s, thinkingCollapsed: false, displayTimestamps: true });
    const again = loadSettings();
    expect(again.thinkingCollapsed).toBe(false);
    expect(again.displayTimestamps).toBe(true);
  });
});

describe("promotion de défaut : la valeur doit SURVIVRE au redémarrage", () => {
  it("promeut thinkingCollapsed puis le conserve au chargement suivant", () => {
    localStorage.clear();
    // Profil de Thierry : le réglage est né avec `false` et a été persisté
    // (changer de modèle réécrit tout l'objet).
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ thinkingCollapsed: false }));

    // 1er démarrage après la mise à jour : la promotion s'applique.
    expect(loadSettings().thinkingCollapsed).toBe(true);

    // 2e démarrage, SANS enregistrement entre les deux (l'app peut redémarrer
    // sans qu'aucun réglage n'ait été touché) : la valeur doit tenir.
    expect(loadSettings().thinkingCollapsed).toBe(true);
  });
});

describe("bootPromotions : les clés promues survivent au miroir disque", () => {
  it("expose les clés promues de ce chargement pour que le merge du boot les fasse gagner", () => {
    localStorage.clear();
    localStorage.setItem("atelier-studio.settings", JSON.stringify({ thinkingCollapsed: false }));
    expect(loadSettings().thinkingCollapsed).toBe(true);
    // Le handler settingsFile fusionne `{...current, ...diskSettings,
    // ...bootPromotions()}` : la promotion doit y être exposée.
    expect(bootPromotions()).toMatchObject({ thinkingCollapsed: true });
    // Simulation du merge avec un miroir disque antérieur à la promotion :
    const disk = { thinkingCollapsed: false };
    expect({ ...loadSettings(), ...disk, ...bootPromotions() }.thinkingCollapsed).toBe(true);
  });
});
