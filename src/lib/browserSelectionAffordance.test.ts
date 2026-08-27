// Option A (maquette « Signaler la sélection », 2026-08-27) : la sélection ne
// fait apparaître AUCUN élément — le bouton « ajouter au chat » déjà présent
// passe à l'accent et devient plein. La pilule orange précédente criait et
// décalait la barre de 180 px en apparaissant.
//
// Le motif accent + icône PLEINE est celui que le système a déjà tranché pour
// les bascules actives de la galerie : un contour discret y était invisible en
// thème sombre. On ne réinvente pas cette décision.
import { describe, expect, it } from "vitest";
import { chatButtonState } from "./browserSelectionAffordance";

describe("chatButtonState", () => {
  it("sans sélection : ghost, icône en contour, infobulle « page »", () => {
    const s = chatButtonState(false);
    expect(s.className).toBe("ghost");
    expect(s.filled).toBe(false);
    expect(s.titleKey).toBe("action.search-web-add");
  });

  it("avec sélection : accent, icône pleine, infobulle « sélection »", () => {
    const s = chatButtonState(true);
    expect(s.className).toBe("ghost has-selection");
    expect(s.filled).toBe(true);
    expect(s.titleKey).toBe("browser.add-selection");
  });

  it("les deux états gardent la MÊME largeur — aucun décalage de la barre", () => {
    // invariant structurel : même élément, mêmes classes de taille, seul le
    // remplissage et la couleur changent. Si un jour une classe ajoutait du
    // padding, ce test doit être revu en connaissance de cause.
    const a = chatButtonState(false).className.split(" ");
    const b = chatButtonState(true).className.split(" ");
    expect(b.filter((c) => !a.includes(c))).toEqual(["has-selection"]);
  });
});
