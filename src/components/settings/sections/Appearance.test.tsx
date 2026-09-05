// Section Apparence (lot 1) : migration verbatim, groupes Thème / Couleurs /
// Typographie / Mise en page + repli Avancé (fondu, horodatages).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { SectionProps } from "../shared";
import Appearance from "./Appearance";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Section Apparence", () => {
  it("le mode de thème reste un radiogroup (contrat conservé du plan 021)", () => {
    renderUi(<Appearance {...props()} />);
    expect(screen.getByRole("radiogroup", { name: /thème/i })).toBeInTheDocument();
  });

  it("les vignettes de thème restent de vrais boutons focusables", () => {
    renderUi(<Appearance {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser l’interface" }));
    const vignettes = screen.getAllByRole("button").filter((b) => b.classList.contains("theme-row"));
    expect(vignettes.length).toBeGreaterThan(0);
    vignettes[0].focus();
    expect(document.activeElement).toBe(vignettes[0]);
  });

  it("garde le thème courant visible et permet de rechercher les autres sans perdre son choix", () => {
    const set = vi.fn();
    renderUi(<Appearance {...props({ set })} />);
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser l’interface" }));
    expect(screen.queryByRole("button", { name: /Nord/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Autres thèmes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un thème…" }), { target: { value: "Nord" } });
    expect(screen.getByRole("button", { name: /Atelier \(défaut\)/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Nord/ }));
    expect(set).toHaveBeenCalledWith({ themePreset: "nord", theme: "dark" });
  });

  it("le fondu est accessible dans Affichage des conversations", () => {
    renderUi(<Appearance {...props()} />);
    expect(screen.queryByText("Fondu du texte en streaming")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Affichage des conversations" }));
    expect(screen.getByText("Fondu du texte en streaming")).toBeInTheDocument();
  });

  it("changer la densité appelle set et onSaved", () => {
    const set = vi.fn(); const onSaved = vi.fn();
    renderUi(<Appearance {...props({ set, onSaved })} />);
    fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(set).toHaveBeenCalledWith({ density: "compact" });
    expect(onSaved).toHaveBeenCalled();
  });

  it("le format d'heure est disponible dans Affichage des conversations", () => {
    renderUi(<Appearance {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Affichage des conversations" }));
    expect(screen.getByText(/Format d'heure/)).toBeInTheDocument();
  });
});
