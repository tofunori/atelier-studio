import { describe, expect, it } from "vitest";
import { modePourFournisseur } from "./modeApresPlan";

const CLAUDE = ["default", "acceptEdits", "plan", "bypassPermissions", "auto"];
const CODEX = ["default", "acceptEdits", "plan", "bypassPermissions"];

describe("modePourFournisseur", () => {
  it("garde Auto chez Claude", () => {
    expect(modePourFournisseur("auto", CLAUDE)).toBe("auto");
  });
  it("replie Auto sur Éditions auto ailleurs, jamais sur l'accès complet", () => {
    expect(modePourFournisseur("auto", CODEX)).toBe("acceptEdits");
    expect(modePourFournisseur("auto", ["bypassPermissions", "default"])).toBe("default");
  });
  it("laisse passer les autres modes et un catalogue inconnu", () => {
    expect(modePourFournisseur("bypassPermissions", CODEX)).toBe("bypassPermissions");
    expect(modePourFournisseur("auto", undefined)).toBe("auto");
    expect(modePourFournisseur("auto", [])).toBe("auto");
  });
});
