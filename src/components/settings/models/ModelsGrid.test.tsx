// Tableau dense des modèles (lot B1) : colonnes comparables, actions sur la
// ligne. Présentationnel — aucune connaissance du socket ni des réglages.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage, t } from "../../../lib/i18n";
import type { ModelRow } from "./buildModelRows";
import { ModelsGrid } from "./ModelsGrid";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

const row = (over: Partial<ModelRow> = {}): ModelRow => ({
  key: "claude:opus", provider: "claude", providerLabel: "Claude Code",
  modelId: "claude-opus-5[1m]", label: "Opus 5 · 1M", isDefault: false,
  isFavorite: false, effort: "", efforts: ["", "low", "high"], status: "ready",
  version: "2.4.1", custom: false, ...over,
});

function props(over = {}) {
  return {
    rows: [row()], onSetDefault: vi.fn(), onToggleFavorite: vi.fn(),
    onSetEffort: vi.fn(), filter: "", onFilterChange: vi.fn(), ...over,
  };
}

describe("ModelsGrid", () => {
  it("rend un tableau avec un en-tête nommé pour chaque colonne", () => {
    renderUi(<ModelsGrid {...props()} />);
    const table = screen.getByRole("table");
    const entetes = within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(entetes).toContain("Modèle");
    expect(entetes).toContain("Fournisseur");
  });

  it("une ligne par modèle, identifiée par son libellé", () => {
    renderUi(<ModelsGrid {...props({ rows: [row(), row({ key: "claude:sonnet", modelId: "s", label: "Sonnet 5" })] })} />);
    expect(screen.getAllByRole("row").length).toBe(3); // en-tête + 2
  });

  it("le marqueur de défaut est un contrôle nommé, pas une pastille muette", () => {
    const onSetDefault = vi.fn();
    renderUi(<ModelsGrid {...props({ onSetDefault })} />);
    const marqueur = screen.getByRole("radio", { name: /défaut/i });
    fireEvent.click(marqueur);
    expect(onSetDefault).toHaveBeenCalledWith(expect.objectContaining({ modelId: "claude-opus-5[1m]" }));
  });

  it("le favori est un interrupteur à état accessible", () => {
    const onToggleFavorite = vi.fn();
    renderUi(<ModelsGrid {...props({ rows: [row({ isFavorite: true })], onToggleFavorite })} />);
    const etoile = screen.getByRole("button", { name: /favori/i });
    expect(etoile).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(etoile);
    expect(onToggleFavorite).toHaveBeenCalled();
  });

  it("le filtre remonte la saisie sans filtrer lui-même", () => {
    const onFilterChange = vi.fn();
    renderUi(<ModelsGrid {...props({ onFilterChange })} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "opus" } });
    expect(onFilterChange).toHaveBeenCalledWith("opus");
  });

  it("annonce le compte de lignes affichées", () => {
    renderUi(<ModelsGrid {...props({ rows: [row(), row({ key: "k2" })] })} />);
    expect(screen.getByText(/2 modèles/)).toBeInTheDocument();
  });

  it("radiogroup : un seul arrêt de tabulation par groupe, la flèche bas déplace la sélection", () => {
    const onSetDefault = vi.fn();
    const rows = [
      row({ key: "claude:opus", modelId: "opus", label: "Opus", isDefault: true }),
      row({ key: "claude:sonnet", modelId: "sonnet", label: "Sonnet" }),
      row({ key: "claude:haiku", modelId: "haiku", label: "Haiku" }),
    ];
    renderUi(<ModelsGrid {...props({ rows, onSetDefault })} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // un seul radio du groupe est un arrêt de tabulation (roving tabindex) —
    // celui de la ligne par défaut, ici Opus.
    const tabbables = radios.filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabbables).toHaveLength(1);
    expect(tabbables[0]).toHaveAttribute("aria-label", expect.stringContaining("Opus"));

    tabbables[0].focus();
    fireEvent.keyDown(tabbables[0], { key: "ArrowDown" });
    expect(onSetDefault).toHaveBeenCalledWith(expect.objectContaining({ modelId: "sonnet" }));
  });

  it("sans aucune ligne, dit pourquoi au lieu de rendre un tableau vide", () => {
    renderUi(<ModelsGrid {...props({ rows: [] })} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/aucun modèle/i)).toBeInTheDocument();
  });

  // Tâche 5 : repli en cartes sous le seuil de la feuille modale.
  it("compact=true : aucun tableau, une carte par modèle", () => {
    renderUi(<ModelsGrid {...props({
      rows: [row(), row({ key: "claude:sonnet", modelId: "s", label: "Sonnet 5" })],
      compact: true,
    })} />);
    expect(screen.queryByRole("table")).toBeNull();
    // toujours une ligne par modèle, identifiée par son libellé.
    expect(screen.getByText("Opus 5 · 1M")).toBeInTheDocument();
    expect(screen.getByText("Sonnet 5")).toBeInTheDocument();
  });

  it("compact=true : cliquer le favori appelle onToggleFavorite", () => {
    const onToggleFavorite = vi.fn();
    renderUi(<ModelsGrid {...props({
      rows: [row({ isFavorite: true })], onToggleFavorite, compact: true,
    })} />);
    const etoile = screen.getByRole("button", { name: /favori/i });
    expect(etoile).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(etoile);
    expect(onToggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ modelId: "claude-opus-5[1m]" }));
  });

  it("compact=true : le marqueur de défaut reste un radio, cliquer appelle onSetDefault", () => {
    const onSetDefault = vi.fn();
    renderUi(<ModelsGrid {...props({ onSetDefault, compact: true })} />);
    const marqueur = screen.getByRole("radio", { name: /défaut/i });
    fireEvent.click(marqueur);
    expect(onSetDefault).toHaveBeenCalledWith(expect.objectContaining({ modelId: "claude-opus-5[1m]" }));
  });

  it("compact=true : la navigation aux flèches du radiogroup survit au repli en cartes", () => {
    const onSetDefault = vi.fn();
    const rows = [
      row({ key: "claude:opus", modelId: "opus", label: "Opus", isDefault: true }),
      row({ key: "claude:sonnet", modelId: "sonnet", label: "Sonnet" }),
      row({ key: "claude:haiku", modelId: "haiku", label: "Haiku" }),
    ];
    renderUi(<ModelsGrid {...props({ rows, onSetDefault, compact: true })} />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    const tabbables = radios.filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabbables).toHaveLength(1);
    expect(tabbables[0]).toHaveAttribute("aria-label", expect.stringContaining("Opus"));

    tabbables[0].focus();
    fireEvent.keyDown(tabbables[0], { key: "ArrowDown" });
    expect(onSetDefault).toHaveBeenCalledWith(expect.objectContaining({ modelId: "sonnet" }));
  });

  it("filtre actif sans résultat : message de recherche, pas « aucun fournisseur » (correction de revue)", () => {
    // Avant : le même message générique (« aucun fournisseur actif
    // n'expose de modèle ») s'affichait que ce soit vraiment vide OU juste
    // que le filtre ne trouve rien — trompeur dans le second cas.
    renderUi(<ModelsGrid {...props({ rows: [], filter: "zzz-introuvable" })} />);
    expect(screen.queryByText(/aucun fournisseur actif/i)).toBeNull();
    expect(screen.getByText(t("settings.model-no-match"))).toBeInTheDocument();
  });
});
