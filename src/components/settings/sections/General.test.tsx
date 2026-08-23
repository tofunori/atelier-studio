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
import { cleanup, fireEvent, screen } from "@testing-library/react";
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
});
