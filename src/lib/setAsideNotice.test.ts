import { describe, expect, it } from "vitest";
import { setAsideMessage } from "./setAsideNotice";
import { t } from "./i18n";

describe("avis de mise de côté (Restaurer, Rembobiner)", () => {
  it("rien mis de côté : pas d'avis", () => {
    expect(setAsideMessage(null, "restore")).toBeNull();
    expect(setAsideMessage(undefined, "rewind")).toBeNull();
    expect(setAsideMessage("", "restore")).toBeNull();
  });

  it("Corbeille : nomme le fichier", () => {
    expect(setAsideMessage("/Users/thierry/.Trash/donnees 2.csv", "restore"))
      .toBe(t("git.set-aside-trash", { name: "donnees 2.csv" }));
  });

  it("repli .git/atelier-trash : donne le chemin complet, que Thierry ne trouverait pas seul", () => {
    const path = "/Users/thierry/these/.git/atelier-trash/donnees.csv";
    expect(setAsideMessage(path, "restore")).toBe(t("git.set-aside-folder", { path }));
  });

  it("rembobinage : dit que les retouches sont copiées, et où", () => {
    expect(setAsideMessage("/Users/thierry/.Trash/Atelier rembobinage 1a2b3c4d", "rewind"))
      .toContain("Atelier rembobinage 1a2b3c4d");
    const repli = "/Users/thierry/these/.git/atelier-trash/Atelier rembobinage 1a2b3c4d";
    expect(setAsideMessage(repli, "rewind")).toContain(repli);
  });
});
