// Invariant croisé (correction de revue C3, lot B1) : `defaultProvider` et
// `defaultModel[provider]` ne se règlent QUE depuis Modèles (spec §6.1) —
// General.tsx a perdu son Select équivalent. Un test qui ne monte que
// Models.tsx (comme Models.test.tsx:120 « ne rend qu'UNE liste de
// fournisseurs ») ne peut PAS voir ce doublon : il lui faut les deux
// sections dans le même DOM, ce que fait ce fichier.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
  it("un seul contrôle « provider par défaut » au total, et c'est un Select (dans Models)", () => {
    // Changement 2026-08-24 : le segmenté Claude/Codex devient un Select,
    // comme les autres rangées à choix unique de la page (Langue, Effort,
    // Mode de permission). Motif mesuré, pas esthétique : la pastille
    // ACTIVE du segmenté se peignait en rgb(30,33,36) SUR un rail en
    // rgb(44,47,52) — le sélectionné était plus sombre que son fond, donc
    // lu comme « désactivé » en thème sombre. L'invariant que ce fichier
    // protège est inchangé : UN seul contrôle pour ce réglage, et il vit
    // dans Models.
    const s = { ...DEFAULT_SETTINGS };
    renderUi(<><General {...props({ s })} /><Models {...props({ s })} /></>);

    // Plus aucun segmenté pour ce réglage, nulle part.
    expect(screen.queryByRole("radiogroup", { name: t("settings.default-provider") })).toBeNull();
    // Exactement un combobox, et il est rendu par Models (General n'en a
    // jamais eu depuis la correction C3 du lot B1).
    expect(screen.getAllByRole("combobox", { name: t("settings.default-provider") })).toHaveLength(1);
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

  it("changer le fournisseur de départ depuis Models() écrit bien defaultProvider (pas de contrôle mort ailleurs)", async () => {
    const set = vi.fn();
    const s = { ...DEFAULT_SETTINGS };
    renderUi(<><General {...props({ s, set })} /><Models {...props({ s, set })} /></>);
    const trigger = screen.getByRole("combobox", { name: t("settings.default-provider") });
    fireEvent.click(trigger);
    // Même séquence que Select.test.tsx:36 — le popup Base UI valide sur
    // pointerdown/pointerup, un `click` seul ne sélectionne rien.
    const option = await screen.findByRole("option", { name: "Codex" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
    await waitFor(() => expect(set).toHaveBeenCalledWith(expect.objectContaining({ defaultProvider: "codex" })));
  });
});
