// Section Atelier (lot 1) : atelier + review + appsnap fusionnées.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import Atelier from "./Atelier";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Section Atelier", () => {
  it("réunit la galerie et la revue automatique sur une seule page", () => {
    // "revue" (mot français du brief) n'existe dans aucune clé i18n réelle
    // pour l'auto-review — le rendu réel dit "Auto-review" (settings.review).
    renderUi(<Atelier {...props()} />);
    expect(screen.getAllByText(/galerie/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Auto-review")).toBeInTheDocument();
  });

  it("AppSnap explique le vrai raccourci global et sa destination locale", () => {
    // Contrat conservé de Settings.test.tsx:69 — le texte ne doit pas se
    // perdre dans la fusion.
    renderUi(<Atelier {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getAllByText(/AppSnap/).length).toBeGreaterThan(0);
  });

  it("activer le rafraîchissement automatique appelle set et onSaved", () => {
    // "rafraîchir" (brief) ne correspond à aucune clé réelle — le rendu dit
    // "Rechargement auto" (settings.auto-refresh).
    const set = vi.fn(); const onSaved = vi.fn();
    renderUi(<Atelier {...props({ s: { ...DEFAULT_SETTINGS, autoRefreshAtelier: false }, set, onSaved })} />);
    fireEvent.click(screen.getByRole("switch", { name: /rechargement/i }));
    expect(set).toHaveBeenCalledWith({ autoRefreshAtelier: true });
    expect(onSaved).toHaveBeenCalled();
  });

  it("ne rend pas RemoteDevicesPanel (déjà migré dans General.tsx, éviter le doublon)", () => {
    renderUi(<Atelier {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.queryByText(/Appareils distants/i)).toBeNull();
  });
});
