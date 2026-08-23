// Types partagés entre les sections de réglages (lot 1). Déplacés depuis
// Settings.tsx (l'ancien fichier garde sa propre copie jusqu'à sa suppression
// en tâche 8). Un seul écart volontaire : `ApiProviderRow.modelReasoning` est
// resserré de `Record<string, any>` (Settings.tsx:82) vers
// `Record<string, unknown>` — `any` désactivait le typage en aval sans raison.
import type { Settings } from "../../lib/settings";

/** Props que la coquille passe à CHAQUE section. Une section ne reçoit
 *  jamais l'objet de props complet de la page. */
export type SectionProps = {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  ws: WebSocket | null;
  /** À appeler après tout changement : déclenche la pastille « Enregistré ». */
  onSaved: () => void;
  projects?: string[];
};

export type ProviderCatalogRow = {
  id: string;
  label: string;
  version: string | null;
  ok: boolean;
  kind?: "cli" | "api";
  models?: string[];
  defaultModel?: string | null;
  efforts?: string[];
  /** Libellés officiels par modèle (Grok, Kimi, opencode…) — sert de
   *  priorité à `modelDisplayLabel` sur BUILTIN_MODEL_LABELS. Champ frère
   *  de `ProviderInfo.modelLabels` (src/lib/providers.ts) : déjà présent au
   *  runtime dans le payload providerStatus, seul le typage manquait ici. */
  modelLabels?: Record<string, string>;
};

export type ApiProviderRow = {
  id: string;
  label: string;
  baseURL: string;
  protocol: "openai" | "anthropic";
  models: string[];
  defaultModel: string;
  keySet: boolean;
  apiKeyEnv?: string | null;
  modelReasoning?: Record<string, unknown>;
};

// Statut de l'ancienne section « setup » (message WebSocket setupStatus).
// Deux consommateurs partagent ce type (lot B1, tâche 4 puis correction) :
// Models.tsx enrichit ses lignes « Non disponibles » avec `providers`
// (auth, commande de login) ; General.tsx affiche `runtime`/`sidecar` dans
// son repli Avancé. Défini ici plutôt que dupliqué dans les deux fichiers —
// même principe que ProviderCatalogRow/ApiProviderRow ci-dessus.
export type SetupProvider = {
  id: string;
  label: string;
  kind: "cli" | "api";
  installed: boolean;
  version: string | null;
  binPath: string | null;
  auth: string;
  models: number;
  defaultModel?: string | null;
  modelError?: string | null;
  /** Commande de login annoncée par le harnais (Kimi, plan 046). */
  loginCommand?: string | null;
};

export type SetupStatus = {
  runtime: { node: string; version: string; bundled: boolean };
  sidecar: { pid: number; startedAt: string; appVersion: string; bundleHash: string; dir: string };
  providers: SetupProvider[];
};
