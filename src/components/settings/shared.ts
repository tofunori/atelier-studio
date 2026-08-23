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
