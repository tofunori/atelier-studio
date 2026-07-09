// Helper de render du plan 015 : monte un composant avec l'environnement que
// l'app réelle suppose (localStorage propre, matchMedia, scrollIntoView) —
// il n'existe aucun provider React global dans Atelier (i18n et settings sont
// des modules), donc pas de wrapper de contexte artificiel.
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { resetFixtureSeq } from "./fixtures";

/** APIs absentes de jsdom que le code produit utilise. */
export function installDomPolyfills(): void {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

/** État de départ déterministe pour chaque test (fixtures + storage). */
export function resetTestState(): void {
  localStorage.clear();
  resetFixtureSeq();
}

export function renderUi(ui: ReactElement): RenderResult {
  installDomPolyfills();
  return render(ui);
}
