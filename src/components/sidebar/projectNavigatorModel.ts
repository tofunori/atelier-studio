// Modèle de vue PUR du Research Navigator (plan 024, étape 2) — aucune
// dépendance React/DOM. Le panneau ne répond qu'à une question : « dans ce
// projet, quel travail reprendre et quelles conversations ouvrir ? ».
// Douze règles déterministes, testées dans projectNavigatorModel.test.ts.
import type { Thread } from "../../lib/ws";

export type RecencyBucket = "today" | "yesterday" | "last7" | "older";
export type NavigatorMode = "project" | "unscoped";

export type ConversationSection = {
  /** clé stable de rendu : bucket temporel, "manual" ou "results" */
  key: RecencyBucket | "manual" | "results";
  /** bucket temporel à afficher en label ; null = pas de label (manual/results) */
  bucket: RecencyBucket | null;
  threads: Thread[];
};

export type ProjectNavigatorModel = {
  mode: NavigatorMode;
  /** identité locale du header — null en mode chats sans projet */
  identity: { root: string; name: string } | null;
  pinnedThreads: Thread[];
  conversationSections: ConversationSection[];
  /** recherche active : Résultats remplace Épinglés/Conversations */
  searching: boolean;
  /** conversations masquées par la limite (hors recherche) */
  hiddenCount: number;
  /** ordre DOM exact des threads visibles, sans doublon — base du shift-clic */
  visibleThreadIds: string[];
};

export type NavigatorInput = {
  activeProject: string | null;
  activeId: string | null;
  threads: Thread[];
  favorites: string[];
  threadOrder: "recent" | "manual";
  query: string;
  /** état « afficher plus » unique du contexte courant */
  expanded: boolean;
  /** horloge injectée (déterminisme des buckets) */
  now?: number;
};

/** Limite historique de conversations visibles avant « plus anciennes ». */
export const CONVERSATIONS_VISIBLE = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

function threadRoot(t: Thread): string {
  return typeof (t as { projectRoot?: unknown }).projectRoot === "string"
    ? (t as { projectRoot: string }).projectRoot
    : "";
}

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/** Bucket de récence ; dates invalides → older, sans crash (règle 11). */
export function recencyBucketAt(thread: Thread, now: number): RecencyBucket {
  const ts = Date.parse(thread.updatedAt);
  if (!Number.isFinite(ts)) return "older";
  const ageDays = Math.floor(
    (startOfLocalDay(new Date(now)) - startOfLocalDay(new Date(ts))) / DAY_MS,
  );
  if (ageDays <= 0) return "today";
  if (ageDays === 1) return "yesterday";
  if (ageDays < 7) return "last7";
  return "older";
}

/** Comparaison insensible à la casse et aux accents, sans dépendance (règle 9). */
export function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function threadTitleRaw(t: Thread): string {
  const raw = (t as { title?: unknown }).title;
  return typeof raw === "string" && raw.trim() ? raw : "Sans titre";
}

function updatedTs(t: Thread): number {
  const ts = Date.parse(t.updatedAt);
  return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
}

export function deriveProjectNavigatorModel(input: NavigatorInput): ProjectNavigatorModel {
  const now = input.now ?? Date.now();
  const mode: NavigatorMode = input.activeProject ? "project" : "unscoped";
  const root = input.activeProject ?? "";

  // règles 1-2 : contexte strict (projet actif OU chats sans projet), avec
  // déduplication défensive par id (un thread n'apparaît jamais deux fois)
  const seen = new Set<string>();
  const context: Thread[] = [];
  for (const t of input.threads) {
    if (threadRoot(t) !== root) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    context.push(t);
  }

  // ordre de référence : récence (desc, stable) ou ordre manuel existant
  const byRecency = [...context].sort((a, b) => updatedTs(b) - updatedTs(a));
  const ordered =
    input.threadOrder === "manual"
      ? [...context].sort((a, b) =>
          ((a as { createdAt?: string }).createdAt ?? a.updatedAt ?? "").localeCompare(
            (b as { createdAt?: string }).createdAt ?? b.updatedAt ?? "",
          ),
        )
      : byRecency;

  const identity =
    mode === "project"
      ? { root, name: root.split("/").filter(Boolean).pop() ?? root }
      : null;

  // règle 8 : recherche active → une section Résultats unique, sans
  // Épinglés, sans doublon, sans limite
  const query = normalizeQuery(input.query.trim());
  if (query) {
    const results = ordered.filter((t) => normalizeQuery(threadTitleRaw(t)).includes(query));
    return {
      mode,
      identity,
      pinnedThreads: [],
      conversationSections: [{ key: "results", bucket: null, threads: results }],
      searching: true,
      hiddenCount: 0,
      visibleThreadIds: results.map((t) => t.id),
    };
  }

  // règle 5 : Épinglés = favoris du contexte uniquement (ordre des favoris)
  const pinnedThreads = input.favorites
    .map((id) => context.find((t) => t.id === id))
    .filter((t): t is Thread => !!t);

  // règle 4 : Conversations = le reste, trié par dernière activité en mode
  // récent. Le chat actif n'est plus extrait dans une section spéciale.
  const pinnedIds = new Set(pinnedThreads.map((t) => t.id));
  const rest = ordered.filter((t) => !pinnedIds.has(t.id));

  // règle 12 : limite existante + décompte des masqués
  const shown = input.expanded ? rest : rest.slice(0, CONVERSATIONS_VISIBLE);
  const hiddenCount = rest.length - shown.length;

  // règles 6-7 : buckets de récence, ou ordre manuel sans label temporel
  const conversationSections: ConversationSection[] = [];
  if (input.threadOrder === "manual") {
    if (shown.length) conversationSections.push({ key: "manual", bucket: null, threads: shown });
  } else {
    let current: RecencyBucket | null = null;
    for (const t of shown) {
      const bucket = recencyBucketAt(t, now);
      if (bucket !== current) {
        conversationSections.push({ key: bucket, bucket, threads: [] });
        current = bucket;
      }
      conversationSections[conversationSections.length - 1].threads.push(t);
    }
  }

  // règle 10 : ordre DOM exact, aucun doublon par construction
  const visibleThreadIds = [
    ...pinnedThreads.map((t) => t.id),
    ...shown.map((t) => t.id),
  ];

  return {
    mode,
    identity,
    pinnedThreads,
    conversationSections,
    searching: false,
    hiddenCount,
    visibleThreadIds,
  };
}
