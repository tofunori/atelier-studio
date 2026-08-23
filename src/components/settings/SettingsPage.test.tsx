// SettingsPage (plan 021, partie A ; coquille lot 1, tâche 8) : navigation,
// Échap, confirmations destructives, nav compacte ≤880 px, routage. Les
// contrôles propres à chaque section vivent désormais dans
// settings/sections/*.test.tsx.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

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
  it("rend les quatre sections ; la section active porte aria-current", () => {
    renderUi(<SettingsPage {...props()} />);
    const items = screen.getAllByRole("button").filter((b) => b.classList.contains("set-nav-item"));
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveAttribute("aria-current", "true");
  });

  it("un deep-link vers une section supprimée retombe sur Général", () => {
    renderUi(<SettingsPage {...props({ initialSection: "providers" })} />);
    const items = screen.getAllByRole("button").filter((b) => b.classList.contains("set-nav-item"));
    expect(items[0]).toHaveAttribute("aria-current", "true");
  });

  it("cliquer une section bascule le contenu et l'état actif", async () => {
    renderUi(<SettingsPage {...props()} />);
    fireEvent.click(screen.getByText(t("settings.appearance")));
    expect(document.querySelector('.set-nav-item[aria-current="true"]')?.textContent)
      .toBe(t("settings.appearance"));
    // Panel chargé en lazy (React.lazy + Suspense) : le contenu apparaît de
    // façon asynchrone après le clic.
    expect(await screen.findByText(t("settings.appearance-sub"))).toBeTruthy();
  });

  it("Échap ferme la page — mais jamais pendant une saisie", () => {
    const p = props();
    renderUi(<SettingsPage {...p} />);
    fireEvent.click(screen.getByText(t("settings.appearance")));
    const search = document.querySelector(".theme-search") as HTMLInputElement;
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
});
