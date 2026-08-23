// Section Modèles (lot 1) : setup + providers + modeles fusionnées. Le
// tableau dense arrive au lot 3 ; ici on vérifie que rien n'est perdu.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage, t } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import Models from "./Models";

// Base UI ScrollArea (favoris OpenCode) consulte l'API Web Animations,
// absente de jsdom — même double que Settings.test.tsx:37-47.
const originalGetAnimations = Element.prototype.getAnimations;
beforeAll(() => {
  Element.prototype.getAnimations = () => [];
});
afterAll(() => {
  if (originalGetAnimations) Element.prototype.getAnimations = originalGetAnimations;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function fakeWs() {
  const ws = new EventTarget() as WebSocket;
  Object.defineProperty(ws, "readyState", { value: WebSocket.OPEN });
  Object.defineProperty(ws, "send", { value: vi.fn() });
  return ws;
}

function emitWs(ws: WebSocket, message: unknown) {
  act(() => ws.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })));
}

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Section Modèles", () => {
  it("réunit statut d'installation, fournisseurs et efforts sur une page", () => {
    // « Claude » apparaît plusieurs fois (rangée du catalogue providers +
    // desc de chaque modèle dans la table d'effort) — getAllByText, comme
    // task-6-report.md pour un motif identique.
    const ws = fakeWs();
    renderUi(<Models {...props({ ws })} />);
    emitWs(ws, {
      type: "providerStatus",
      providers: [{ id: "claude", label: "Claude", version: "2.4.1", ok: true, kind: "cli", models: ["claude-opus-5[1m]"] }],
    });
    expect(screen.getAllByText("Claude").length).toBeGreaterThan(0);
  });

  it("ignore une entrée de catalogue sans models au lieu de planter", () => {
    // Contrat conservé de Settings.test.tsx:159.
    const ws = fakeWs();
    renderUi(<Models {...props({ ws })} />);
    emitWs(ws, { type: "providerStatus", providers: [{ id: "aux", label: "Aux", ok: true }] });
    expect(screen.queryByText("Aux")).not.toBeNull();
  });

  it("permet de chercher et mettre un modèle OpenCode en favori", async () => {
    // Contrat conservé de Settings.test.tsx:170 — la fonctionnalité ne doit
    // pas se perdre dans la fusion (elle sera généralisée au lot 3).
    const ws = fakeWs();
    const set = vi.fn();
    renderUi(<Models {...props({ ws, set })} />);
    emitWs(ws, {
      type: "providerStatus",
      providers: [{ id: "opencode", label: "opencode", ok: true, kind: "cli", models: ["opencode/glm-5.2"] }],
    });
    const search = await screen.findByPlaceholderText(/rechercher/i);
    fireEvent.change(search, { target: { value: "glm" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /favori/i })).toBeInTheDocument());
  });

  it("sans sidecar : notice d'avertissement (role=status), pas couleur seule", () => {
    // Contrat conservé de Settings.test.tsx:142 — non porté lors de la fusion
    // setup+providers+modeles (tâche 6) ni de la migration de suite (tâche 8).
    renderUi(<Models {...props({ ws: null })} />);
    const notice = document.querySelector(".ui-notice--warning");
    expect(notice).toBeTruthy();
    expect(notice!.getAttribute("role")).toBe("status");
    expect(notice!.textContent).toContain(t("settings.sidecar-disconnected-notice"));
  });

  it("garde les fournisseurs API et les slugs sous le repli « Avancé »", () => {
    // Le brief pointait vers « fournisseurs api » (/fournisseurs api/i) :
    // absent du dictionnaire i18n — la clé réelle settings.api-providers
    // rend « Providers API (endpoint personnalisé) ». Test adapté au texte
    // réellement affiché, intention conservée (repli fermé par défaut).
    renderUi(<Models {...props()} />);
    expect(screen.queryByText(/providers api/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText(/providers api/i)).toBeInTheDocument();
  });
});
