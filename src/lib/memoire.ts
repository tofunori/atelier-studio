/** Mémoire de projet (chantier 3 du plan rattrapage-claude-science) : le
 *  magasin vit côté Rust (`memories.json`). Ce module parle au backend par
 *  les messages ws `memory*` ; chaque réponse revient par l'événement
 *  fenêtre `memoire-reponse` (sidecarRelays), corrélée par requestId. */
import { t } from "./i18n";

export type OrigineSouvenir = {
  kind: "manual" | "agent" | "extraction" | "claude-science";
  threadId?: string;
  threadTitle?: string;
  file?: string;
  sourceId?: string;
  sourceProject?: string;
  evidence?: "stated" | "observed" | "inferred";
};

export type Souvenir = {
  id: string;
  /** "" = valable pour tous les projets. */
  projectRoot: string;
  text: string;
  origin: OrigineSouvenir;
  createdAt: string;
  updatedAt: string;
  supersededBy?: string;
  edited?: boolean;
};

export type ProjetClaudeScience = {
  /** "" = souvenirs sans projet dans Claude Science. */
  id: string;
  name: string;
  count: number;
  imported: number;
  /** Projet d'Atelier qui a reçu le dernier import, s'il y en a eu un. */
  projectRoot: string | null;
};

export type ReponseMemoire = {
  type?: string;
  requestId?: string;
  ok?: boolean;
  error?: string;
  items?: Souvenir[];
  total?: number;
  counts?: Record<string, number>;
  memory?: Souvenir;
  removed?: number;
  base?: string;
  projects?: ProjetClaudeScience[];
  added?: number;
  updated?: number;
  unchanged?: number;
};

export const EVENT_MEMOIRE = "memoire-reponse";
const SOCKET_OPEN = 1;

/** Envoie une requête `memory*` et attend sa réponse (30 s au plus : la
 *  lecture de la base de Claude Science peut prendre un moment). */
export function demanderMemoire(ws: WebSocket | null, type: string, payload: Record<string, unknown> = {}): Promise<ReponseMemoire> {
  if (!ws || ws.readyState !== SOCKET_OPEN) return Promise.resolve({ ok: false, error: t("memoire.offline") });
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (r: ReponseMemoire) => {
      window.clearTimeout(timer);
      window.removeEventListener(EVENT_MEMOIRE, onEvent);
      resolve(r);
    };
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as ReponseMemoire | undefined;
      if (detail?.requestId === requestId) finish(detail);
    };
    const timer = window.setTimeout(() => finish({ ok: false, error: t("memoire.timeout") }), 30_000);
    window.addEventListener(EVENT_MEMOIRE, onEvent);
    try { ws.send(JSON.stringify({ ...payload, type, requestId })); }
    catch { finish({ ok: false, error: t("memoire.offline") }); }
  });
}

/** Les erreurs du backend sont des codes ; le reste passe tel quel. */
export function messageErreur(code: string | undefined): string {
  switch (code) {
    case "memory_empty": return t("memoire.error-empty");
    case "memory_too_long": return t("memoire.error-too-long");
    case "memory_unknown": return t("memoire.error-unknown");
    default: return code || t("memoire.error");
  }
}

/** Dernier segment d'une racine, pour l'afficher. */
export function nomDeProjet(root: string): string {
  if (!root) return t("memoire.all-projects");
  const parts = root.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || root;
}

export function libelleOrigine(o: OrigineSouvenir): string {
  switch (o.kind) {
    case "claude-science": return o.sourceProject ? t("memoire.origin-cs-project", { projet: o.sourceProject }) : t("memoire.origin-cs");
    case "agent": return t("memoire.origin-agent");
    case "extraction": return t("memoire.origin-extraction");
    default: return t("memoire.origin-manual");
  }
}

/** Projet d'Atelier proposé par défaut pour un projet de Claude Science :
 *  celui de l'import précédent, sinon un projet dont le nom partage un mot
 *  avec lui (« Analyses Feux-Albédo » → `.../Chapitre1-Albedo`), sinon
 *  « ne pas importer ». `null` = ne pas importer. */
export function cibleParDefaut(projet: ProjetClaudeScience, projets: string[]): string | null {
  if (projet.projectRoot !== null && projet.projectRoot !== undefined) return projet.projectRoot;
  const mots = (s: string) => new Set(
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 4),
  );
  const cherches = mots(projet.name);
  if (cherches.size === 0) return null;
  const trouve = projets.find((root) => [...mots(nomDeProjet(root))].some((m) => cherches.has(m)));
  return trouve ?? null;
}
