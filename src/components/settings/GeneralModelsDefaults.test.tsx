// Invariant croisé (correction de revue C3, lot B1) : `defaultProvider` et
// `defaultModel[provider]` ne se règlent QUE depuis Modèles (spec §6.1) —
// General.tsx a perdu son Select équivalent. Un test qui ne monte que
// Models.tsx (comme Models.test.tsx:120 « ne rend qu'UNE liste de
// fournisseurs ») ne peut PAS voir ce doublon : il lui faut les deux
// sections dans le même DOM, ce que fait ce fichier.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage, t } from "../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import type { SectionProps } from "./shared";
import General from "./sections/General";
import Models from "./sections/Models";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over: Partial<SectionProps> = {}): SectionProps {
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws: null, onSaved: vi.fn(), ...over };
}

describe("Général × Modèles — le fournisseur/modèle de départ ne se règle qu'une fois", () => {
  it("aucun Select « provider par défaut » dans General, un seul segmenté dans Models", () => {
    const s = { ...DEFAULT_SETTINGS };
    renderUi(<><General {...props({ s })} /><Models {...props({ s })} /></>);

    // Ni Select (General) ni deuxième contrôle du même réglage.
    expect(screen.queryByRole("combobox", { name: t("settings.default-provider") })).toBeNull();
    // Le segmenté de Models est un radiogroup ARIA (SegmentedControl), pas
    // un combobox — les deux sections montées ensemble ne doivent en
    // révéler qu'UN SEUL au total.
    expect(screen.getAllByRole("radiogroup", { name: t("settings.default-provider") })).toHaveLength(1);
  });

  it("aucun Select « modèle par défaut » dans General (doublon du marqueur radio de la table)", () => {
    // Libellés en dur, PAS tirés de t("settings.default-claude-model" / …) :
    // ces deux clés i18n sont supprimées avec les Select qu'elles
    // nommaient (correction de revue, round 2) — un test qui vérifie
    // l'ABSENCE d'un contrôle n'a pas besoin que sa clé existe encore.
    const s = { ...DEFAULT_SETTINGS };
    renderUi(<><General {...props({ s })} /><Models {...props({ s })} /></>);
    expect(screen.queryByRole("combobox", { name: "Modèle Claude par défaut" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Modèle Codex par défaut" })).toBeNull();
  });

  it("changer le fournisseur de départ depuis Models() écrit bien defaultProvider (pas de contrôle mort ailleurs)", () => {
    const set = vi.fn();
    const s = { ...DEFAULT_SETTINGS };
    renderUi(<><General {...props({ s, set })} /><Models {...props({ s, set })} /></>);
    const [group] = screen.getAllByRole("radiogroup", { name: t("settings.default-provider") });
    const codex = within(group).getByRole("radio", { name: "Codex" });
    fireEvent.click(codex);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ defaultProvider: "codex" }));
  });
});
