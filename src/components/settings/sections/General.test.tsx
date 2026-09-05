import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import General from "./General";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over: Partial<SectionProps> = {}): SectionProps {
  return {
    s: { ...DEFAULT_SETTINGS },
    set: vi.fn(),
    ws: null,
    onSaved: vi.fn(),
    ...over,
  };
}

// Motif repris de Settings.test.tsx (fakeWs/emitWs) pour simuler le sidecar.
function fakeWs() {
  const ws = new EventTarget() as WebSocket;
  Object.defineProperty(ws, "readyState", { value: WebSocket.OPEN });
  Object.defineProperty(ws, "send", { value: vi.fn() });
  return ws;
}

function emitWs(ws: WebSocket, message: unknown) {
  act(() => ws.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })));
}

describe("Section Général", () => {
  it("montre les réglages essentiels sans rien déplier", () => {
    renderUi(<General {...props()} />);
    expect(screen.getByText("Recherche web")).toBeInTheDocument();
  });

  it("garde le statut Sidecar sous le repli « Avancé »", () => {
    renderUi(<General {...props()} />);
    expect(screen.queryByText("Sidecar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Diagnostic et maintenance" }));
    expect(screen.getByText("Sidecar")).toBeInTheDocument();
  });

  it("changer un réglage appelle set ET onSaved", () => {
    const set = vi.fn();
    const onSaved = vi.fn();
    renderUi(<General {...props({ set, onSaved })} />);
    fireEvent.click(screen.getByRole("switch", { name: "Recherche web" }));
    expect(set).toHaveBeenCalledWith({ webSearch: true });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("le bloc de diagnostics (Runtime) apparaît sous « Avancé » et affiche la version reçue par le socket", () => {
    // Restauré ici (lot B1, revue de la tâche 4) : le bloc Runtime de
    // l'ex-section setup avait disparu pendant la fusion de Models.tsx.
    const ws = fakeWs();
    renderUi(<General {...props({ ws })} />);
    emitWs(ws, {
      type: "setupStatus",
      status: {
        runtime: { node: "22.4.0", version: "2.4.1", bundled: true },
        sidecar: { pid: 4242, startedAt: "", appVersion: "2.4.1", bundleHash: "abc123", dir: "/tmp/atelier" },
        providers: [],
      },
    });
    // Fermé par défaut.
    expect(screen.queryByText("2.4.1 — 22.4.0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Diagnostic et maintenance" }));
    expect(screen.getByText("2.4.1 — 22.4.0")).toBeInTheDocument();
  });

  it("fusionne Runtime et la rangée Sidecar existante au lieu de dupliquer le badge de connexion", () => {
    const ws = fakeWs();
    renderUi(<General {...props({ ws })} />);
    emitWs(ws, {
      type: "setupStatus",
      status: {
        runtime: { node: "22.4.0", version: "2.4.1", bundled: true },
        sidecar: { pid: 4242, startedAt: "", appVersion: "2.4.1", bundleHash: "abc123", dir: "/tmp/atelier" },
        providers: [],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Diagnostic et maintenance" }));
    // Une seule rangée « Sidecar » (pas une deuxième pour le diagnostic de
    // l'ex-section setup) et un seul badge « connecté ».
    expect(screen.getAllByText("Sidecar")).toHaveLength(1);
    expect(screen.getAllByText("connecté")).toHaveLength(1);
  });

  it("n'a plus de Select « provider par défaut » ni « modèle par défaut » (doublon retiré, correction C3)", () => {
    // Régression : ces contrôles écrivaient les MÊMES clés (defaultProvider,
    // defaultModel[provider]) que le segmenté et le marqueur radio de
    // Models.tsx (spec §6.1 : « les défauts se règlent là où on voit les
    // modèles »). Remplace le test « liste les modèles codex du catalogue
    // providerStatus dans le menu par défaut », dont le sujet (le Select
    // codex par défaut) a disparu de cette section.
    renderUi(<General {...props()} />);
    expect(screen.queryByRole("combobox", { name: "Provider par défaut" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Modèle Claude par défaut" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Modèle Codex par défaut" })).toBeNull();
    // L'effort par défaut du fournisseur reste ICI : réglage différent
    // (defaultEffort), pas un doublon du marqueur radio ni de la colonne
    // Effort du tableau (modelEfforts, par MODÈLE).
    expect(screen.getByRole("combobox", { name: "Effort Claude par défaut" })).toBeInTheDocument();
  });
});
