// Settings (plan 021, partie A) : navigation, Échap, confirmations
// destructives, nav compacte ≤880 px, contrôles primitives, diagnostic.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
}));

import SettingsPage from "./Settings";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage, t } from "../lib/i18n";
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

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

describe("Settings — navigation et fermeture", () => {
  it("rend les 9 sections ; la section active porte aria-current", () => {
    renderUi(<SettingsPage {...props()} />);
    const items = document.querySelectorAll(".set-nav-item");
    expect(items.length).toBe(9);
    const active = document.querySelector('.set-nav-item[aria-current="true"]');
    expect(active?.textContent).toBe(t("settings.general"));
  });

  it("cliquer une section bascule le contenu et l'état actif", () => {
    renderUi(<SettingsPage {...props()} />);
    fireEvent.click(screen.getByText(t("settings.appearance")));
    expect(document.querySelector('.set-nav-item[aria-current="true"]')?.textContent)
      .toBe(t("settings.appearance"));
    expect(screen.getByText(t("settings.appearance-sub"))).toBeTruthy();
  });

  it("AppSnap explique le vrai raccourci global et sa destination locale", () => {
    renderUi(<SettingsPage {...props()} />);
    fireEvent.click(screen.getByText(t("settings.appsnap")));
    expect(screen.getByText(t("appsnap.card-title"))).toBeTruthy();
    expect(screen.getByText("⌥ Option")).toBeTruthy();
    expect(screen.getByText(t("appsnap.destination-auto"))).toBeTruthy();
    expect(screen.getByText(t("appsnap.local-note"))).toBeTruthy();
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

describe("Settings — actions destructives confirmées", () => {
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

describe("Settings — contrôles et diagnostic", () => {
  it("le mode de thème est un radiogroup ; choisir Sombre applique le réglage", () => {
    const p = props();
    renderUi(<SettingsPage {...p} />);
    fireEvent.click(screen.getByText(t("settings.appearance")));
    const group = document.querySelector('.set-body [role="radiogroup"]');
    expect(group).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: t("settings.theme-dark") }));
    expect(p.onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("Setup sans sidecar : notice d'avertissement (role=status), pas couleur seule", () => {
    renderUi(<SettingsPage {...props({ ws: null })} />);
    fireEvent.click(screen.getByText(t("settings.setup")));
    const notice = document.querySelector(".ui-notice--warning");
    expect(notice).toBeTruthy();
    expect(notice!.getAttribute("role")).toBe("status");
    expect(notice!.textContent).toContain(t("settings.sidecar-disconnected-notice"));
  });

  it("les vignettes de thème sont de vrais boutons focusables", () => {
    renderUi(<SettingsPage {...props()} />);
    fireEvent.click(screen.getByText(t("settings.appearance")));
    const row = document.querySelector(".theme-row") as HTMLElement;
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("aria-pressed")).toBeTruthy();
  });
});

describe("Settings — nav compacte ≤880 px", () => {
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
