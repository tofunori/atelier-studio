// Research Home (plan 017) — couche de sélection PURE : dérive le modèle de
// vue de l'accueil depuis les états déjà présents dans App. Aucune donnée
// inventée : chaque libellé décrit un record (« terminé », « interrompu »,
// « usage enregistré »), jamais un jugement (« validé », « réussi »).
// `now` est injecté (testabilité, aucune horloge cachée).
//
// Préconditions d'appel (App) : `recentFiles` est déjà scopé au projet actif
// (chemins relatifs au projet) ; les threads, eux, sont TOUS passés et filtrés
// ici par projectRoot.
import type { AgentEvent, Thread } from "./ws";

export type HomeThreadStatus = "running" | "done" | "interrupted" | "idle";

/** Date relative structurée — la traduction appartient au rendu. */
export type HomeRelativeDate =
  | { kind: "now" }
  | { kind: "minutes"; n: number }
  | { kind: "hours"; n: number }
  | { kind: "days"; n: number }
  | { kind: "date"; iso: string };

export type HomeContinueItem = {
  threadId: string;
  projectRoot: string;
  title: string;
  provider: string;
  status: HomeThreadStatus;
  /** ISO brut du record — exposé en date complète accessible ; null si invalide */
  updatedAtIso: string | null;
  relative: HomeRelativeDate | null;
  /** ms écoulées si un tour tourne (workingSince) */
  runningForMs: number | null;
  /** dernière action ENREGISTRÉE : résultat done, message d'erreur ou dernier outil */
  lastAction: string | null;
  /** usage enregistré disponible pour ce thread (plan 010) */
  hasUsage: boolean;
};

export type HomeAttentionItem = {
  /** clé stable de liste */
  key: string;
  kind: "sidecar" | "atelier" | "thread";
  /** 3 = connexion coupée, 2 = serveur atelier en erreur, 1 = thread interrompu */
  severity: 3 | 2 | 1;
  threadId?: string;
  projectRoot?: string;
  /** titre du thread concerné (kind: thread) */
  title?: string;
  /** message du record, tronqué — jamais reformulé en diagnostic */
  detail?: string;
  /** récence pour le tri (ms epoch) ; les conditions présentes valent `now` */
  at: number;
};

export type HomeArtefactKind = "figure" | "document" | "code" | "data" | "other";

export type HomeArtefact = {
  /** chemin relatif projet — clé stable et cible d'ouverture Atelier */
  rel: string;
  name: string;
  /** dossier parent (source) ; "" à la racine */
  dir: string;
  kind: HomeArtefactKind;
};

/** Connexion sidecar en trois états : `connecting` = démarrage à froid (jamais
 * connecté encore) — un état de CHARGEMENT, pas une panne ; `disconnected` =
 * connexion perdue après avoir été établie — une vraie condition À traiter. */
export type HomeSidecarState = "ready" | "connecting" | "disconnected";

export type ResearchHomeModel =
  | { state: "no-project" }
  | {
      state: "project";
      projectRoot: string;
      projectName: string;
      /** chemin abrégé (~/…) pour le secondaire tronqué */
      projectPath: string;
      /** connexion sidecar dégradée (perdue — pas le démarrage) */
      degraded: boolean;
      /** démarrage à froid : threads pas encore chargés — squelette sobre */
      loading: boolean;
      hasThreads: boolean;
      continueItem: HomeContinueItem | null;
      /** max 3, sévérité puis récence ; ne duplique jamais continueItem */
      attention: HomeAttentionItem[];
      /** max 6, ordre = récence fournie par recentFiles */
      artefacts: HomeArtefact[];
    };

export type ResearchHomeInputs = {
  activeProject: string | null;
  /** nom d'affichage résolu par App (projMeta) ; défaut = dernier segment */
  projectName?: string | null;
  threads: Thread[];
  events: Record<string, AgentEvent[] | undefined>;
  workingSince: Record<string, number | null | undefined>;
  usageByThread: Record<string, unknown>;
  /** fichiers récemment ouverts (ordre = récence) — filtrés ICI par `files` */
  recentFiles: string[];
  /** liste des fichiers du projet actif : les artefacts d'un autre projet
   * (chemin absent de cette liste) sont exclus */
  files: string[];
  sidecar: HomeSidecarState;
  /** texte de la bannière start_atelier si le serveur galerie est en erreur */
  atelierError: string | null;
  now: number;
};

export const HOME_MAX_ATTENTION = 3;
export const HOME_MAX_ARTEFACTS = 6;

const FUTURE_TOLERANCE_MS = 60_000;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function parseWhen(iso: string | null | undefined, now: number): { iso: string | null; relative: HomeRelativeDate | null; at: number | null } {
  if (!iso) return { iso: null, relative: null, at: null };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { iso, relative: null, at: null };
  const delta = now - t;
  // horloge du record en avance (import, TZ) : on borne au présent sans inventer
  if (delta < -FUTURE_TOLERANCE_MS) return { iso, relative: { kind: "now" }, at: now };
  if (delta < MIN) return { iso, relative: { kind: "now" }, at: t };
  if (delta < HOUR) return { iso, relative: { kind: "minutes", n: Math.floor(delta / MIN) }, at: t };
  if (delta < DAY) return { iso, relative: { kind: "hours", n: Math.floor(delta / HOUR) }, at: t };
  if (delta < 7 * DAY) return { iso, relative: { kind: "days", n: Math.floor(delta / DAY) }, at: t };
  return { iso, relative: { kind: "date", iso }, at: t };
}

function firstLine(text: string, max = 120): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  const clean = line.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Dernier record significatif du thread — jamais réinterprété. */
function lastRecord(evts: AgentEvent[] | undefined): { kind: "done"; ok: boolean; text: string | null } | { kind: "error"; text: string } | { kind: "tool"; text: string } | null {
  if (!evts?.length) return null;
  for (let i = evts.length - 1; i >= 0; i--) {
    const e = evts[i];
    if (e.kind === "done") return { kind: "done", ok: e.ok !== false, text: e.result ? firstLine(e.result) : null };
    if (e.kind === "error") return { kind: "error", text: firstLine(e.message) };
    if (e.kind === "tool") return { kind: "tool", text: e.name };
  }
  return null;
}

function threadStatus(t: Thread, workingSince: number | null | undefined, rec: ReturnType<typeof lastRecord>): HomeThreadStatus {
  if (workingSince != null || t.status === "running") return "running";
  if (rec?.kind === "error") return "interrupted";
  if (rec?.kind === "done") return rec.ok ? "done" : "interrupted";
  return t.status === "done" ? "done" : "idle";
}

const EXT_KINDS: Record<string, HomeArtefactKind> = {};
for (const e of ["pdf", "png", "jpg", "jpeg", "svg", "gif", "webp", "tif", "tiff", "eps"]) EXT_KINDS[e] = "figure";
for (const e of ["md", "tex", "txt", "doc", "docx", "bib", "rtf", "html"]) EXT_KINDS[e] = "document";
for (const e of ["py", "r", "jl", "js", "ts", "tsx", "jsx", "mjs", "sh", "c", "cpp", "rs", "m", "ipynb"]) EXT_KINDS[e] = "code";
for (const e of ["csv", "tsv", "parquet", "nc", "h5", "hdf5", "json", "geojson", "xlsx", "zarr"]) EXT_KINDS[e] = "data";

export function artefactKind(rel: string): HomeArtefactKind {
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return EXT_KINDS[ext] ?? "other";
}

function shortPath(root: string): string {
  return root.replace(/^\/Users\/[^/]+/, "~");
}

export function deriveResearchHomeModel(inputs: ResearchHomeInputs): ResearchHomeModel {
  const { activeProject, now } = inputs;
  if (!activeProject) return { state: "no-project" };

  const projThreads = inputs.threads.filter((t) => t.projectRoot === activeProject);

  // ---- Continuer : un tour en cours passe devant le dernier thread terminé
  const decorated = projThreads.map((t) => {
    const ws = inputs.workingSince[t.id] ?? null;
    const rec = lastRecord(inputs.events[t.id]);
    const status = threadStatus(t, ws, rec);
    const when = parseWhen(t.updatedAt, now);
    return { t, ws, rec, status, when };
  });
  const running = decorated
    .filter((d) => d.status === "running")
    .sort((a, b) => (b.ws ?? 0) - (a.ws ?? 0) || a.t.id.localeCompare(b.t.id));
  const byRecency = [...decorated].sort((a, b) => {
    const ta = a.when.at ?? -Infinity;
    const tb = b.when.at ?? -Infinity;
    return tb - ta || a.t.id.localeCompare(b.t.id); // tri stable : départage par id
  });
  const chosen = running[0] ?? byRecency[0] ?? null;

  const continueItem: HomeContinueItem | null = chosen
    ? {
        threadId: chosen.t.id,
        projectRoot: chosen.t.projectRoot,
        title: chosen.t.title || chosen.t.id.slice(0, 8),
        provider: chosen.t.provider,
        status: chosen.status,
        updatedAtIso: chosen.when.iso,
        relative: chosen.when.relative,
        runningForMs: chosen.status === "running" && chosen.ws != null ? Math.max(0, now - chosen.ws) : null,
        lastAction: chosen.rec?.text ?? null,
        hasUsage: chosen.t.id in inputs.usageByThread,
      }
    : null;

  // ---- À traiter : sévérité puis récence, max 3, rien si vide.
  // `connecting` (démarrage à froid) n'est PAS une alerte — c'est du chargement.
  const attention: HomeAttentionItem[] = [];
  if (inputs.sidecar === "disconnected") {
    attention.push({ key: "sidecar", kind: "sidecar", severity: 3, at: now });
  }
  if (inputs.atelierError) {
    attention.push({ key: "atelier", kind: "atelier", severity: 2, detail: firstLine(inputs.atelierError), at: now });
  }
  for (const d of decorated) {
    if (d.status !== "interrupted") continue;
    // pas de doublon : le thread déjà mis en avant dans Continuer n'occupe pas
    // un des trois emplacements d'À traiter (son statut y est déjà visible)
    if (d.t.id === continueItem?.threadId) continue;
    attention.push({
      key: `thread:${d.t.id}`,
      kind: "thread",
      severity: 1,
      threadId: d.t.id,
      projectRoot: d.t.projectRoot,
      title: d.t.title || d.t.id.slice(0, 8),
      detail: d.rec?.kind === "error" || d.rec?.kind === "done" ? d.rec.text ?? undefined : undefined,
      at: d.when.at ?? 0,
    });
  }
  attention.sort((a, b) => b.severity - a.severity || b.at - a.at || a.key.localeCompare(b.key));
  const attentionCapped = attention.slice(0, HOME_MAX_ATTENTION);

  // ---- Artefacts récents : ordre d'entrée (déjà par récence), clé stable =
  // rel ; les chemins absents du projet actif (autre projet) sont exclus ICI
  const inProject = new Set(inputs.files);
  const artefacts: HomeArtefact[] = inputs.recentFiles
    .filter((rel) => inProject.has(rel))
    .slice(0, HOME_MAX_ARTEFACTS)
    .map((rel) => {
      const segs = rel.split("/");
      const name = segs[segs.length - 1] || rel;
      return { rel, name, dir: segs.slice(0, -1).join("/"), kind: artefactKind(rel) };
    });

  const projectName = inputs.projectName || activeProject.split("/").filter(Boolean).pop() || activeProject;

  return {
    state: "project",
    projectRoot: activeProject,
    projectName,
    projectPath: shortPath(activeProject),
    degraded: inputs.sidecar === "disconnected",
    // démarrage à froid sans threads chargés : squelette, pas de faux vide
    loading: inputs.sidecar === "connecting" && projThreads.length === 0,
    hasThreads: projThreads.length > 0,
    continueItem,
    attention: attentionCapped,
    artefacts,
  };
}
