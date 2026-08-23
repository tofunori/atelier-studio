// Section Général (lot 1) : migration verbatim de general + avance, avec le
// repli « Avancé » et la remontée onSaved.
//
// Écarts volontaires par rapport au gabarit du plan (task-5-brief.md) :
// - le texte "Recherche web" n'existe dans aucune clé i18n réelle ; la
//   rangée websearch réelle (Settings.tsx:559-561) rend
//   t("settings.web-search") = "Web search Codex" (fr) — le test s'adapte.
// - "Format d'heure" n'appartient PAS à la vraie section « avance »
//   (Settings.tsx:1251-1290 = Sidecar, images collées, appareils distants) ;
//   il vit dans « apparence » → tâche 6. Le test du repli Avancé vérifie donc
//   la rangée Sidecar, réellement présente ici.
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
    expect(screen.getByText("Web search Codex")).toBeInTheDocument();
  });

  it("garde le statut Sidecar sous le repli « Avancé »", () => {
    renderUi(<General {...props()} />);
    expect(screen.queryByText("Sidecar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText("Sidecar")).toBeInTheDocument();
  });

  it("changer un réglage appelle set ET onSaved", () => {
    const set = vi.fn();
    const onSaved = vi.fn();
    renderUi(<General {...props({ set, onSaved })} />);
    fireEvent.click(screen.getByRole("switch", { name: "Web search Codex" }));
    expect(set).toHaveBeenCalledWith({ webSearch: true });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("liste les modèles codex du catalogue providerStatus dans le menu par défaut", async () => {
    // Régression : providerModels("codex") ne doit pas se limiter au modèle
    // déjà sélectionné une fois le catalogue chargé (coordinateur, ronde 2).
    const ws = fakeWs();
    renderUi(<General {...props({ ws })} />);
    emitWs(ws, {
      type: "providerStatus",
      providers: [{ id: "codex", label: "Codex", ok: true, kind: "cli", models: ["gpt-5-codex", "gpt-5-codex-mini"] }],
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Modèle Codex par défaut" }));
    expect(await screen.findByRole("option", { name: "gpt-5-codex" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "gpt-5-codex-mini" })).toBeInTheDocument();
  });
});
