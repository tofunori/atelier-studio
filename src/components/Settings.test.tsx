// Settings (plan 021, partie A) : navigation, Échap, confirmations
// destructives, nav compacte ≤880 px, contrôles primitives, diagnostic.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

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

function fakeWs() {
  const ws = new EventTarget() as WebSocket;
  Object.defineProperty(ws, "readyState", { value: WebSocket.OPEN });
  Object.defineProperty(ws, "send", { value: vi.fn() });
  return ws;
}

function emitWs(ws: WebSocket, message: unknown) {
  act(() => ws.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })));
}

const originalGetAnimations = Element.prototype.getAnimations;
beforeAll(() => {
  // Base UI ScrollArea consulte l'API Web Animations, absente de jsdom. Le
  // double reste volontairement local à Settings pour ne pas altérer les
  // transitions de fermeture testées par les autres primitives Base UI.
  Element.prototype.getAnimations = () => [];
});
afterAll(() => {
  if (originalGetAnimations) Element.prototype.getAnimations = originalGetAnimations;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});

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
    expect(screen.getByText(t("appsnap.accessibility"))).toBeTruthy();
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

  it("Providers ignore une entrée auxiliaire sans models au lieu de planter", () => {
    const ws = fakeWs();
    renderUi(<SettingsPage {...props({ ws, initialSection: "providers" })} />);
    emitWs(ws, {
      type: "apiProviders",
      providers: [{ id: "byteplus-images", hasApiKey: true }],
    });
    expect(screen.getByRole("heading", { name: t("settings.providers") })).toBeTruthy();
    expect(screen.queryByText("byteplus-images")).toBeNull();
  });

  it("permet de chercher et mettre un modèle OpenCode en favori", async () => {
    const ws = fakeWs();
    const p = props({ ws, initialSection: "providers" });
    renderUi(<SettingsPage {...p} />);
    emitWs(ws, {
      type: "providerStatus",
      providers: [{
        id: "opencode", label: "OpenCode", version: "1.18.3", ok: true, kind: "cli",
        models: ["opencode/glm-5.2", "opencode/claude-fable-5"],
        defaultModel: "opencode/glm-5.2", efforts: [],
      }],
    });

    await waitFor(() => expect(screen.getByText("GLM 5.2")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(t("settings.model-search")), {
      target: { value: "Fable" },
    });
    expect(screen.queryByText("GLM 5.2")).toBeNull();
    const favoriteButton = screen.getByLabelText(t("action.add-favorite"));
    expect(favoriteButton).toHaveAttribute("data-slot", "toggle");
    expect(favoriteButton.className).toContain("tw:border-transparent");
    fireEvent.click(favoriteButton);
    expect(p.onChange).toHaveBeenCalledWith(expect.objectContaining({
      favoriteModels: { opencode: ["opencode/claude-fable-5"] },
    }));
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
