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
    // Un fournisseur sans aucun modèle énumérable n'a rien à montrer dans le
    // tableau dense : il part dans `unavailable` plutôt que de produire des
    // lignes vides. Couvre à la fois « CLI non ok » (grok du test) et
    // « catalogue incomplet, models absent » (aux du test).
    if (models.length === 0) {
      unavailable.push(row);
      continue;
    }

    const status: ModelRow["status"] = row.ok ? "ready" : "absent";
    const efforts = row.efforts ?? [];
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
        label: modelDisplayLabel(row.id, modelId),
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
    for (const custom of customModels) {
      if (custom.provider !== row.id || seen.has(custom.id)) continue;
      pushRow(custom.id, true);
    }
  }

  return { rows, unavailable };
}
