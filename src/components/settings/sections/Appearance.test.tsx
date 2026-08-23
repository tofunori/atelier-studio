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
    const vignettes = screen.getAllByRole("button").filter((b) => b.classList.contains("theme-row"));
    expect(vignettes.length).toBeGreaterThan(0);
    vignettes[0].focus();
    expect(document.activeElement).toBe(vignettes[0]);
  });

  it("le fondu du streaming est sous le repli « Avancé »", () => {
    renderUi(<Appearance {...props()} />);
    expect(screen.queryByText("Fondu du texte en streaming")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Avancé/ }));
    expect(screen.getByText("Fondu du texte en streaming")).toBeInTheDocument();
  });

  it("changer la densité appelle set et onSaved", () => {
    const set = vi.fn(); const onSaved = vi.fn();
    renderUi(<Appearance {...props({ set, onSaved })} />);
    fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(set).toHaveBeenCalledWith({ density: "compact" });
    expect(onSaved).toHaveBeenCalled();
  });

  it("le format d'heure reste dans le groupe essentiel (non masqué sous Avancé, comme dans Settings.tsx:759)", () => {
    renderUi(<Appearance {...props()} />);
    expect(screen.getByText(/Format d'heure/)).toBeInTheDocument();
  });
});
