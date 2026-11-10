import { isDiscussionContext } from "../../lib/discussions";
// Modèle de vue PUR du Research Navigator (plan 024, étape 2) — aucune
// dépendance React/DOM. Le panneau ne répond qu'à une question : « dans ce
// projet, quel travail reprendre et quelles conversations ouvrir ? ».
// Douze règles déterministes, testées dans projectNavigatorModel.test.ts.
import type { Thread } from "../../lib/ws";
import { delegatedChildrenByParent } from "../../lib/threadLinks";

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
  /** ordre DOM exact des threads visibles, sans doublon — base du shift-clic
   *  (les fils rangés sous leur parent n'y entrent pas) */
  visibleThreadIds: string[];
  /** règle 14 : fils délégués rangés sous leur parent (id du parent → fils,
   *  ordre de lancement). Absents des sections hors recherche. */
  childrenByParent: Map<string, Thread[]>;
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

/** Un parent prend la dernière activité de ses fils : il remonte quand un
 * fil travaille ou rend compte. */
function withChildrenActivity(t: Thread, children: Thread[] | undefined): Thread {
  if (!children?.length) return t;
  const latest = children.reduce((best, child) => (updatedTs(child) > updatedTs(best) ? child : best), t);
  return latest === t ? t : { ...t, updatedAt: latest.updatedAt };
}

export function deriveProjectNavigatorModel(input: NavigatorInput): ProjectNavigatorModel {
  const now = input.now ?? Date.now();
  const mode: NavigatorMode = isDiscussionContext(input.activeProject) ? "unscoped" : "project";
  const root = input.activeProject ?? "";

  // règles 1-2 : contexte strict (projet actif OU chats sans projet), avec
  // déduplication défensive par id (un thread n'apparaît jamais deux fois)
  const seen = new Set<string>();
  const context: Thread[] = [];
  for (const t of input.threads) {
    if (mode === "unscoped" ? !isDiscussionContext(threadRoot(t)) : threadRoot(t) !== root) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    context.push(t);
  }

  // règle 13 : la conversation OUVERTE est toujours listée, même si elle
  // n'appartient pas au contexte affiché — un chat sans projet ouvert depuis
  // un projet, ou un fil d'un autre projet atteint par la palette, restait
  // sinon visible à droite et INTROUVABLE à gauche. Le contexte de l'atelier
  // (galerie, onglets) n'a pas à bouger pour autant : c'est la liste qui
  // s'élargit d'une ligne, pas le projet actif qui change.
  if (input.activeId && !seen.has(input.activeId)) {
    const active = input.threads.find((t) => t.id === input.activeId);
    if (active) {
      seen.add(active.id);
      context.push(active);
    }
  }

  // règle 14 : les fils délégués (spécialistes, fils lancés par le
  // coordinateur) se rangent sous leur parent au lieu de s'aligner avec lui.
  const childrenByParent = delegatedChildrenByParent(context);
  const nestedIds = new Set([...childrenByParent.values()].flat().map((t) => t.id));
  const activity = new Map(
    context.map((t) => [t.id, updatedTs(withChildrenActivity(t, childrenByParent.get(t.id)))]),
  );
  const activityOf = (t: Thread) => activity.get(t.id) ?? updatedTs(t);

  // ordre de référence : récence (desc, stable) ou ordre manuel existant
  const byRecency = [...context].sort((a, b) => activityOf(b) - activityOf(a));
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
      childrenByParent: new Map(),
    };
  }

  // règle 5 : Épinglés = favoris du contexte uniquement (ordre des favoris)
  const pinnedThreads = input.favorites
    .map((id) => context.find((t) => t.id === id))
    .filter((t): t is Thread => !!t);

  // règle 4 : Conversations = le reste, trié par dernière activité en mode
  // récent. Le chat actif n'est plus extrait dans une section spéciale.
  const pinnedIds = new Set(pinnedThreads.map((t) => t.id));
  const rest = ordered.filter((t) => !pinnedIds.has(t.id) && !nestedIds.has(t.id));
  // Un fil ouvert est trouvable sous son parent : le parent tient lieu de
  // conversation ouverte pour la limite (règle 13).
  const activeChild = input.activeId && nestedIds.has(input.activeId)
    ? context.find((t) => t.id === input.activeId)
    : undefined;
  const openId = activeChild?.agentLink?.parentThreadId ?? input.activeId;

  // règle 12 : limite existante + décompte des masqués. La conversation
  // ouverte échappe à la limite (règle 13) : la masquer la rendrait
  // introuvable exactement comme l'exclusion de contexte.
  const shown = input.expanded ? rest : rest.slice(0, CONVERSATIONS_VISIBLE);
  if (
    openId &&
    !shown.some((t) => t.id === openId) &&
    rest.some((t) => t.id === openId)
  ) {
    shown.push(rest.find((t) => t.id === openId)!);
  }
  const hiddenCount = rest.length - shown.length;

  // règles 6-7 : buckets de récence, ou ordre manuel sans label temporel
  const conversationSections: ConversationSection[] = [];
  if (input.threadOrder === "manual") {
    if (shown.length) conversationSections.push({ key: "manual", bucket: null, threads: shown });
  } else {
    let current: RecencyBucket | null = null;
    for (const t of shown) {
      const bucket = recencyBucketAt(withChildrenActivity(t, childrenByParent.get(t.id)), now);
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
    childrenByParent,
  };
}
