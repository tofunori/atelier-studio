// Régression du spike Linux (run CI 31967329679) : webview vierge + miroir
// disque peuplé = projets visibles dans le rail, mais « aucun projet ouvert »
// au centre, définitivement. Le plan 064 rend ce cas ORDINAIRE en renommant
// l'identifiant de bundle, qui indexe le localStorage de WKWebView.
import { describe, expect, it } from "vitest";
import { pickActiveProjectFromDisk } from "./projectHydration";

const A = "/Users/x/Documents/Albedo";
const B = "/Users/x/Documents/Memoire";

describe("pickActiveProjectFromDisk", () => {
  it("adopte le premier projet du disque quand rien n'est sélectionné", () => {
    // LE cas du bug : webview vierge, disque plein
    expect(pickActiveProjectFromDisk(null, [A, B]))
      .toEqual({ next: A, shouldAdopt: true });
  });

  it("ne déplace JAMAIS un projet déjà actif", () => {
    // le miroir arrive de façon asynchrone : il ne doit pas changer la
    // sélection sous les pieds de l'utilisateur
    expect(pickActiveProjectFromDisk(B, [A, B]))
      .toEqual({ next: B, shouldAdopt: false });
  });

  it("ne fait rien quand le disque n'a aucun projet", () => {
    expect(pickActiveProjectFromDisk(null, [])).toEqual({ next: null, shouldAdopt: false });
  });

  it("ignore un miroir absent ou malformé plutôt que de deviner", () => {
    for (const bad of [undefined, null, "…", 42, {}]) {
      expect(pickActiveProjectFromDisk(null, bad)).toEqual({ next: null, shouldAdopt: false });
    }
  });

  it("saute les entrées vides sans planter", () => {
    expect(pickActiveProjectFromDisk(null, ["", "   ", B]))
      .toEqual({ next: B, shouldAdopt: true });
    expect(pickActiveProjectFromDisk(null, [null, 7, A]))
      .toEqual({ next: A, shouldAdopt: true });
  });

  it("un projet actif survit à un miroir vide", () => {
    // suppression du dernier projet ailleurs ≠ raison de désélectionner ici
    expect(pickActiveProjectFromDisk(A, [])).toEqual({ next: A, shouldAdopt: false });
  });
});
