import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLanguageSetting, setLanguage, t } from "./i18n";

describe("t — accord des « (s) »", () => {
  const initial = getLanguageSetting();
  beforeEach(() => setLanguage("fr"));
  afterEach(() => setLanguage(initial));
  it("accorde sur la variable numérique qui précède", () => {
    expect(t("context.files", { count: 1 })).toBe("1 fichier");
    expect(t("context.files", { count: 0 })).toBe("0 fichier");
    expect(t("context.files", { count: 3 })).toBe("3 fichiers");
    expect(t("kernel.lines-changed", { n: 2 })).toBe("2 lignes changées");
  });
  it("suit la variable la plus proche quand il y en a plusieurs", () => {
    expect(t("settings.api-detect-count", { total: 5, sel: 1 })).toBe("5 modèles détectés · 1 sélectionné");
  });
  it("anglais : seul 1 est singulier", () => {
    setLanguage("en");
    expect(t("context.files", { count: 1 })).not.toContain("(s)");
  });
  it("laisse le gabarit intact sans nombre", () => {
    expect(t("settings.api-models-count")).toBe("modèle(s)");
  });
});
