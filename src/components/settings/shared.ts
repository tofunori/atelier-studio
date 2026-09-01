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
  /** Racine du projet actif — seul consommateur : le bouton Reformuler de
   *  Consignes.tsx (tâche 11), pour le `cwd` du tour un-coup qui reformule.
   *  Absent/vide = aucun projet actif ; les adaptateurs Rust (codex, claude)
   *  ont déjà leur propre repli pour ce cas, même chemin que les autres
   *  tours un-coup (`commit_message`, `title_conversation`). */
  projectRoot?: string;
  /** Vrai sous le seuil ≤880px de la feuille modale (calculé UNE fois par
   *  la coquille SettingsPage — ResizeObserver sur la feuille en mode
   *  embarqué, matchMedia sur la fenêtre sinon). Une section qui a besoin
   *  d'un repli visuel lit CE champ plutôt que de recalculer sa propre
   *  mesure : un second ResizeObserver sur le même élément peut diverger
   *  silencieusement du premier (lot B1, tâche 5). Optionnel pour ne pas
   *  casser les tests qui construisent un SectionProps à la main sans ce
   *  champ (défaut implicite : non replié). */
  narrow?: boolean;
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
  /** Routes opencode découpées en Rust (lot B2) : `id` reste la chaîne
   *  exacte envoyée au CLI (identique à l'entrée `models` de même indice),
   *  `gateway`/`vendor`/`leaf`/`free` sont dérivés pour l'affichage.
   *  `vendor` est toujours PRÉSENT côté Rust (jamais omis — `None` se
   *  sérialise en `null`, vérifié par le test
   *  `vendor_absent_se_serialise_en_null_jamais_omis` côté Rust), d'où
   *  `string | null` plutôt qu'un `?`. Absent des autres fournisseurs. */
  routes?: { id: string; gateway: string; vendor: string | null; leaf: string; free: boolean }[];
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
