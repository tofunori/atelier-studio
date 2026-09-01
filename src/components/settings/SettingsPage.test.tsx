// SettingsPage (plan 021, partie A ; coquille lot 1, tâche 8) : navigation,
// Échap, confirmations destructives, nav compacte ≤880 px, routage. Les
// contrôles propres à chaque section vivent désormais dans
// settings/sections/*.test.tsx.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
}));

import SettingsPage from "./SettingsPage";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage, t } from "../../lib/i18n";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";

function props(over: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
  return {
    settings: { ...DEFAULT_SETTINGS },
    onChange: vi.fn(),
    onClose: vi.fn(),
    ws: null,
    ...over,
  };
}

const originalGetAnimations = Element.prototype.getAnimations;
beforeAll(() => {
  // Base UI ScrollArea consulte l'API Web Animations, absente de jsdom. Le
  // double reste volontairement local à SettingsPage pour ne pas altérer les
  // transitions de fermeture testées par les autres primitives Base UI.
  Element.prototype.getAnimations = () => [];
});
afterAll(() => {
  if (originalGetAnimations) Element.prototype.getAnimations = originalGetAnimations;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

describe("SettingsPage — navigation et fermeture", () => {
  it("rend les cinq sections (lot 1 + consignes, tâche 9) ; la section active porte aria-current", () => {
    renderUi(<SettingsPage {...props()} />);
    const items = screen.getAllByRole("button").filter((b) => b.classList.contains("set-nav-item"));
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveAttribute("aria-current", "true");
  });

  it("un deep-link vers une section fusionnée retombe sur son héritière (modeles), pas sur Général", () => {
    // Correction de revue : « providers » a fusionné dans « modeles », pas
    // dans « general » (sections.ts:resolveSection). Voir sections.test.ts
    // pour la couverture complète du repli (setup/providers → modeles,
    // review/appsnap → atelier, avance/inconnu → general).
    renderUi(<SettingsPage {...props({ initialSection: "providers" })} />);
    const items = screen.getAllByRole("button").filter((b) => b.classList.contains("set-nav-item"));
    expect(items[1]).toHaveAttribute("aria-current", "true");
  });

  it("cliquer une section bascule le contenu et l'état actif", async () => {
    renderUi(<SettingsPage {...props()} />);
    fireEvent.click(screen.getByText(t("settings.appearance")));
    expect(document.querySelector('.set-nav-item[aria-current="true"]')?.textContent)
      .toBe(t("settings.appearance"));
    // Panneau chargé en lazy depuis le refactor (React.lazy + Suspense) :
    // l'import du chunk peut dépasser le timeout par défaut de Testing
    // Library sous charge (suite complète), d'où un timeout généreux ici.
    expect(await screen.findByText(t("settings.appearance-sub"), {}, { timeout: 5000 })).toBeTruthy();
  });

  it("Échap ferme la page — mais jamais pendant une saisie", async () => {
    const p = props();
    renderUi(<SettingsPage {...p} />);
    fireEvent.click(screen.getByText(t("settings.appearance")));
    // Panneau chargé en lazy depuis le refactor : attendre la RÉSOLUTION du
    // champ de recherche avant d'agir dessus, plutôt que d'agir puis
    // d'espérer — sous charge, l'import du chunk peut dépasser le défaut.
    const search = await screen.findByPlaceholderText(t("settings.search-theme"), {}, { timeout: 5000 });
    search.focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onClose).not.toHaveBeenCalled();
    search.blur();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("Échap dans Settings ne se propage pas au raccourci global d'interruption", () => {
    const p = props();
    const globalHandler = vi.fn();
    renderUi(<SettingsPage {...p} />);
    window.addEventListener("keydown", globalHandler);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(globalHandler).not.toHaveBeenCalled();
    window.removeEventListener("keydown", globalHandler);
  });
});

describe("SettingsPage — actions destructives confirmées", () => {
  it("Restaurer les défauts demande confirmation ; refus = aucun changement", async () => {
    const p = props();
    (tauriConfirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    renderUi(<SettingsPage {...p} />);
    fireEvent.click(screen.getByText(t("action.restore-defaults")));
    await vi.waitFor(() => expect(tauriConfirm).toHaveBeenCalled());
    expect(p.onChange).not.toHaveBeenCalled();
  });

  it("Restaurer accepté remplace tous les réglages", async () => {
    const p = props({ settings: { ...DEFAULT_SETTINGS, theme: "light" as const } });
    renderUi(<SettingsPage {...p} />);
    fireEvent.click(screen.getByText(t("action.restore-defaults")));
    await vi.waitFor(() => expect(p.onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS }));
  });

  it("une panne du dialogue de confirmation bloque l'action destructive", async () => {
    const p = props();
    (tauriConfirm as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("dialog unavailable"));
    renderUi(<SettingsPage {...p} />);
    fireEvent.click(screen.getByText(t("action.restore-defaults")));
    await vi.waitFor(() => expect(tauriConfirm).toHaveBeenCalled());
    expect(p.onChange).not.toHaveBeenCalled();
  });
});

describe("SettingsPage — nav compacte ≤880 px", () => {
  it("en fenêtre étroite, la nav colonne cède la place à un select de section", () => {
    const saved = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("max-width: 880px"),
        media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    renderUi(<SettingsPage {...props()} />);
    expect(document.querySelector(".set-nav")).toBeNull();
    expect(document.querySelector(".set-nav-compact")).toBeTruthy();
    expect(document.querySelector(".set-nav-compact .custom-select")).toBeTruthy();
    Object.defineProperty(window, "matchMedia", { writable: true, value: saved });
  });

  it("en mode embarqué, la nav compacte suit la largeur de la FEUILLE (ResizeObserver) — pas celle de la fenêtre", () => {
    // Bande morte corrigée par ce lot : fenêtre large (matchMedia dit "pas
    // compact") mais feuille flottante resserrée sous 880px. Le double
    // ResizeObserver global (setup.ts) est un no-op silencieux ; on le
    // remplace ici pour capturer le callback et simuler un resize réel.
    const savedRO = globalThis.ResizeObserver;
    let capturedCallback: ResizeObserverCallback | null = null;
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) { capturedCallback = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;

    renderUi(<SettingsPage {...props({ embedded: true })} />);
    // Avant tout signal du ResizeObserver : matchMedia jsdom dit "large",
    // donc la nav colonne reste affichée (comportement de départ inchangé).
    expect(document.querySelector(".set-nav")).toBeTruthy();
    expect(capturedCallback).toBeTruthy();

    // La feuille mesure 800px (sous le seuil) alors que la fenêtre jsdom
    // resterait "large" pour matchMedia — c'est exactement la bande morte.
    act(() => {
      capturedCallback?.(
        [{ contentRect: { width: 800 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    expect(document.querySelector(".set-nav")).toBeNull();
    expect(document.querySelector(".set-nav-compact")).toBeTruthy();

    globalThis.ResizeObserver = savedRO;
  });
});
