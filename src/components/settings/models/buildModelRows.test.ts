// Dérivation des lignes de modèles (lot B1) : fusionne catalogue, slugs
// personnalisés, favoris et efforts. Pure, donc testable sans montage.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import type { ProviderCatalogRow } from "../shared";
import { buildModelRows } from "./buildModelRows";

const claude: ProviderCatalogRow = {
  id: "claude", label: "Claude Code", version: "2.4.1", ok: true, kind: "cli",
  models: ["claude-opus-5[1m]", "claude-sonnet-5[1m]"],
  defaultModel: "claude-opus-5[1m]", efforts: ["low", "high", "xhigh"],
};

describe("buildModelRows", () => {
  it("produit une ligne par modèle du catalogue", () => {
    const { rows } = buildModelRows([claude], { ...DEFAULT_SETTINGS });
    expect(rows.map((r) => r.modelId)).toEqual(["claude-opus-5[1m]", "claude-sonnet-5[1m]"]);
  });

  it("marque comme défaut le modèle retenu POUR CE FOURNISSEUR", () => {
    const s = { ...DEFAULT_SETTINGS, defaultModel: { ...DEFAULT_SETTINGS.defaultModel, claude: "claude-sonnet-5[1m]" } };
    const { rows } = buildModelRows([claude], s);
    expect(rows.filter((r) => r.isDefault).map((r) => r.modelId)).toEqual(["claude-sonnet-5[1m]"]);
  });

  it("un seul défaut par fournisseur, même si deux fournisseurs coexistent", () => {
    const codex: ProviderCatalogRow = {
      id: "codex", label: "Codex", version: "0.58", ok: true, kind: "cli",
      models: ["gpt-5.6-sol"], defaultModel: "gpt-5.6-sol", efforts: ["medium"],
    };
    const { rows } = buildModelRows([claude, codex], { ...DEFAULT_SETTINGS });
    const parProvider = rows.filter((r) => r.isDefault).map((r) => r.provider);
    expect(new Set(parProvider).size).toBe(parProvider.length);
  });

  it("reporte les favoris de TOUS les fournisseurs, pas seulement opencode", () => {
    const s = { ...DEFAULT_SETTINGS, favoriteModels: { claude: ["claude-sonnet-5[1m]"] } };
    const { rows } = buildModelRows([claude], s);
    expect(rows.find((r) => r.modelId === "claude-sonnet-5[1m]")?.isFavorite).toBe(true);
    expect(rows.find((r) => r.modelId === "claude-opus-5[1m]")?.isFavorite).toBe(false);
  });

  it("reporte l'effort par modèle depuis la clé « provider:modelId »", () => {
    const s = { ...DEFAULT_SETTINGS, modelEfforts: { "claude:claude-opus-5[1m]": "xhigh" } };
    const { rows } = buildModelRows([claude], s);
    expect(rows.find((r) => r.modelId === "claude-opus-5[1m]")?.effort).toBe("xhigh");
  });

  it("ajoute les slugs personnalisés et les marque comme tels", () => {
    const s = { ...DEFAULT_SETTINGS, customModels: [{ provider: "claude", id: "claude-experimental" }] };
    const { rows } = buildModelRows([claude], s);
    const custom = rows.find((r) => r.modelId === "claude-experimental");
    expect(custom?.custom).toBe(true);
  });

  it("sépare les fournisseurs indisponibles au lieu de les mêler aux lignes", () => {
    const grok: ProviderCatalogRow = { id: "grok", label: "Grok CLI", version: null, ok: false, kind: "cli", models: [] };
    const { rows, unavailable } = buildModelRows([claude, grok], { ...DEFAULT_SETTINGS });
    expect(rows.every((r) => r.provider !== "grok")).toBe(true);
    expect(unavailable.map((p) => p.id)).toEqual(["grok"]);
  });

  it("ne plante pas sur un catalogue nul ni sur une entrée sans models", () => {
    expect(() => buildModelRows(null, { ...DEFAULT_SETTINGS })).not.toThrow();
    const aux: ProviderCatalogRow = { id: "aux", label: "Aux", version: null, ok: true };
    expect(() => buildModelRows([aux], { ...DEFAULT_SETTINGS })).not.toThrow();
  });

  it("les clés de ligne sont uniques et stables", () => {
    const { rows } = buildModelRows([claude], { ...DEFAULT_SETTINGS });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows[0].key).toBe("claude:claude-opus-5[1m]");
  });

  // --- Compléments (hors gabarit du brief) ---

  it("ne duplique pas un slug personnalisé déjà présent au catalogue", () => {
    const s = { ...DEFAULT_SETTINGS, customModels: [{ provider: "claude", id: "claude-opus-5[1m]" }] };
    const { rows } = buildModelRows([claude], s);
    expect(rows.filter((r) => r.modelId === "claude-opus-5[1m]").length).toBe(1);
    expect(rows.find((r) => r.modelId === "claude-opus-5[1m]")?.custom).toBe(false);
  });

  it("réduit le statut à deux états dérivés de `ok`, sans en inventer un troisième", () => {
    // ok:false malgré le nom du fixture précédent (grokOk) qui induisait en
    // erreur — renommé après revue.
    const grokNotOk: ProviderCatalogRow = {
      id: "grok", label: "Grok CLI", version: "1.0", ok: false, kind: "cli",
      models: ["grok-4"], efforts: [],
    };
    const { rows } = buildModelRows([claude, grokNotOk], { ...DEFAULT_SETTINGS });
    expect(rows.find((r) => r.provider === "claude")?.status).toBe("ready");
    expect(rows.find((r) => r.provider === "grok")?.status).toBe("absent");
  });

  it("habille les modèles Grok/opencode avec leur libellé officiel (modelLabels dynamique)", () => {
    // Grok n'a aucun libellé en dur (src/lib/modelCatalog.ts) : sans le
    // troisième argument de modelDisplayLabel, le libellé retombe sur
    // l'identifiant brut. Régression découverte en revue.
    const grok: ProviderCatalogRow = {
      id: "grok", label: "Grok CLI", version: "1.0", ok: true, kind: "cli",
      models: ["grok-4.6"], efforts: [],
      modelLabels: { "grok-4.6": "Grok 4.6" },
    };
    const { rows } = buildModelRows([grok], { ...DEFAULT_SETTINGS });
    expect(rows.find((r) => r.modelId === "grok-4.6")?.label).toBe("Grok 4.6");
  });

  it("garde le slug personnalisé visible même si le catalogue du fournisseur est vide", () => {
    // Un fournisseur momentanément non détecté (CLI absent, statut
    // transitoire) ne doit pas faire disparaître un slug enregistré :
    // Models.tsx le rendait déjà inconditionnellement avant cette fonction.
    // Régression découverte en revue.
    const grokVide: ProviderCatalogRow = {
      id: "grok", label: "Grok CLI", version: null, ok: false, kind: "cli", models: [],
    };
    const s = { ...DEFAULT_SETTINGS, customModels: [{ provider: "grok", id: "grok-experimental" }] };
    const { rows, unavailable } = buildModelRows([grokVide], s);
    const row = rows.find((r) => r.modelId === "grok-experimental");
    expect(row?.custom).toBe(true);
    expect(unavailable.map((p) => p.id)).toEqual([]);
  });

  // --- Correction de revue C1 (2026-08-23) : le trigger Effort était vide
  // sur chaque ligne. Fixtures réalistes (AUCUN backend n'émet "" dans
  // `efforts` — claude.rs, codex.rs, opencode.rs) : ce sont ces fixtures-là,
  // pas la logique, qui masquaient le défaut initialement.

  it("préfixe l'option Auto (\"\") absente du catalogue brut, pour un fournisseur normal", () => {
    const { rows } = buildModelRows([claude], { ...DEFAULT_SETTINGS });
    // Fixture `claude` : efforts: ["low", "high", "xhigh"] — jamais "" en entrée.
    expect(rows[0].efforts).toEqual(["", "low", "high", "xhigh"]);
    // Sans le préfixe, `effort` (qui vaut "" par défaut, aucun override) ne
    // correspondrait à AUCUNE option du Select — trigger vide au chargement.
    expect(rows[0].effort).toBe("");
    expect(rows[0].efforts).toContain(rows[0].effort);
  });

  it("NE préfixe PAS l'option Auto pour un fournisseur NO_AUTO_EFFORT (grok) au catalogue chargé", () => {
    const grok: ProviderCatalogRow = {
      id: "grok", label: "Grok CLI", version: "1.0", ok: true, kind: "cli",
      models: ["grok-4.6"], efforts: ["low", "medium", "high", "xhigh"],
    };
    const { rows } = buildModelRows([grok], { ...DEFAULT_SETTINGS });
    expect(rows[0].efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(rows[0].efforts).not.toContain("");
  });

  // Piège opencode (lot B2, hors périmètre ici) : identifiants routés,
  // potentiellement des milliers. La fonction doit rester robuste et rapide.
  it("reste rapide et correct sur un catalogue de plusieurs milliers d'entrées (opencode routé)", () => {
    const many = Array.from({ length: 5000 }, (_, i) => `openrouter/z-ai/glm-5.2-${i}`);
    const opencode: ProviderCatalogRow = {
      id: "opencode", label: "OpenCode", version: "0.9", ok: true, kind: "cli",
      models: many, defaultModel: many[0], efforts: [],
    };
    const s = {
      ...DEFAULT_SETTINGS,
      favoriteModels: { opencode: [many[10], many[4000]] },
    };
    const start = performance.now();
    const { rows, unavailable } = buildModelRows([opencode], s);
    const elapsed = performance.now() - start;

    expect(rows.length).toBe(5000);
    expect(unavailable.length).toBe(0);
    expect(new Set(rows.map((r) => r.key)).size).toBe(5000);
    expect(rows.filter((r) => r.isFavorite).length).toBe(2);
    // Généreux mais suffisant pour attraper une régression quadratique :
    // 5000 entrées ne devraient jamais approcher la seconde.
    expect(elapsed).toBeLessThan(1000);
  });
});
