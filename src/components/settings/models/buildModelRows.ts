// Dérivation pure du tableau dense de modèles (lot B1) : fusionne le
// catalogue vivant (message providerStatus), les slugs personnalisés, les
// favoris et les efforts par modèle en une ligne par modèle. Hors de React,
// donc testable exhaustivement sans montage.
//
// Statut à DEUX états, pas trois. Le brief demandait de dériver `status`
// de `ok` ET « du champ d'authentification du catalogue » — ce champ
// n'existe pas sur `ProviderCatalogRow` (src/components/settings/shared.ts) :
// celui-ci n'expose que `ok: boolean`. La distinction fine « binaire absent »
// vs « installé mais non connecté » vit uniquement sur `SetupProvider.auth`
// (message setupStatus, un type et un canal WebSocket différents — voir
// Models.tsx:76 et sa fonction authLabel), jamais passée à cette fonction.
// Inventer un troisième état ici produirait un état toujours vide ; on
// réduit donc le type à "ready" | "absent", dérivé du seul booléen dispo.
import { effortOptionsFor } from "../../../lib/effortOrder";
import { modelDisplayLabel } from "../../../lib/modelCatalog";
import type { Settings } from "../../../lib/settings";
import type { ProviderCatalogRow } from "../shared";

export type ModelRow = {
  key: string; // "provider:modelId", identifiant stable de ligne
  provider: string;
  providerLabel: string;
  modelId: string;
  label: string; // libellé humain (modelDisplayLabel)
  isDefault: boolean; // défaut DE SON fournisseur
  isFavorite: boolean;
  effort: string; // "" = défaut du CLI
  efforts: string[]; // paliers proposés par ce fournisseur
  status: "ready" | "absent";
  version: string | null;
  custom: boolean; // slug ajouté à la main
};

export function buildModelRows(
  provs: ProviderCatalogRow[] | null,
  s: Settings,
): { rows: ModelRow[]; unavailable: ProviderCatalogRow[] } {
  const rows: ModelRow[] = [];
  const unavailable: ProviderCatalogRow[] = [];

  const defaultModel = s.defaultModel ?? {};
  const favoriteModels = s.favoriteModels ?? {};
  const modelEfforts = s.modelEfforts ?? {};
  const customModels = s.customModels ?? [];

  for (const row of provs ?? []) {
    const models = row.models ?? [];
    const customForRow = customModels.filter((c) => c.provider === row.id);
    // Un fournisseur sans aucun modèle énumérable ET sans slug personnalisé
    // n'a rien à montrer : il part dans `unavailable`. Un fournisseur au
    // catalogue vide mais portant un slug enregistré (CLI momentanément non
    // détecté, statut transitoire…) garde sa ligne — le slug reste visible
    // et supprimable, comme le rendait déjà inconditionnellement l'ancien
    // Models.tsx:585. Le laisser tomber dans `unavailable` le ferait
    // disparaître de l'écran sans que le réglage sous-jacent ne bouge :
    // corrigé après revue (2026-08-23).
    if (models.length === 0 && customForRow.length === 0) {
      unavailable.push(row);
      continue;
    }

    const status: ModelRow["status"] = row.ok ? "ready" : "absent";
    // Correction de revue (C1, 2026-08-23) : AUCUN backend n'émet "" dans
    // `efforts` (claude.rs, codex.rs, opencode.rs annoncent tous
    // ["low","medium",…] sans l'entrée Auto) — c'est le CONSOMMATEUR qui la
    // préfixe (Chat.tsx, fonction levelsFor). Sans ce préfixe ici, `effort`
    // valait "" par défaut sur chaque ligne mais aucune option "" n'existait
    // dans `efforts` : le trigger du Select de la colonne Effort s'affichait
    // vide sur TOUTES les lignes. effortOptionsFor (lib/effortOrder.ts)
    // reproduit exactement la logique de Chat.tsx:levelsFor, y compris
    // NO_AUTO_EFFORT (grok n'a pas d'Auto).
    const efforts = effortOptionsFor(row.id, row.efforts ?? []);
    const version = row.version ?? null;
    // Set une fois par fournisseur plutôt qu'un .includes() par ligne : le
    // catalogue opencode peut publier des milliers de modèles routés.
    const favorites = new Set(favoriteModels[row.id] ?? []);
    const seen = new Set<string>();

    const pushRow = (modelId: string, custom: boolean) => {
      seen.add(modelId);
      rows.push({
        key: `${row.id}:${modelId}`,
        provider: row.id,
        providerLabel: row.label,
        modelId,
        // `row.modelLabels` (Grok, Kimi, opencode…) prime sur
        // BUILTIN_MODEL_LABELS : sans lui, modelDisplayLabel retombe sur
        // l'identifiant brut pour tout modèle étiqueté dynamiquement.
        label: modelDisplayLabel(row.id, modelId, row.modelLabels),
        isDefault: modelId === defaultModel[row.id],
        isFavorite: favorites.has(modelId),
        effort: modelEfforts[`${row.id}:${modelId}`] ?? "",
        efforts,
        status,
        version,
        custom,
      });
    };

    for (const modelId of models) pushRow(modelId, false);

    // Slugs personnalisés : ajoutés seulement s'ils ne dupliquent pas un
    // modèle déjà listé par le catalogue pour ce même fournisseur.
    for (const custom of customForRow) {
      if (seen.has(custom.id)) continue;
      pushRow(custom.id, true);
    }
  }

  return { rows, unavailable };
}
