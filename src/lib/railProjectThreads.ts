// Fils récents du projet actif, montrés sous sa puce dans la barre compacte
// (2026-11-12, option A « Fils du projet »). Pur : aucune dépendance React.
// Hors de l'entrée : seul le rail, chargé à la demande, l'importe.
import type { Thread } from "./ws";
import { delegatedChildrenByParent, delegatedState, type DelegatedState } from "./threadLinks";
import { strongest, type RailSignal } from "./railSignals";

/** Marques sous la puce : au-delà, la colonne dépliée prend le relais. */
export const RAIL_PROJECT_THREADS = 4;

const ts = (thread: Thread) => {
  const value = Date.parse(thread.updatedAt ?? "");
  return Number.isFinite(value) ? value : 0;
};

export type RailProjectThread = {
  thread: Thread;
  /** fils délégués rangés sous lui (spécialistes, fils du coordinateur) */
  children: Thread[];
  /** dernière activité, enfants compris (ms) */
  at: number;
};

/** Conversations du projet, les plus récentes d'abord, sans les épinglées
 * (déjà en haut du rail) ni les fils délégués (rangés sous leur parent).
 * La conversation ouverte reste toujours visible, quitte à prendre la
 * dernière place. */
export function railProjectThreads(
  threads: readonly Thread[],
  root: string,
  opts: { activeId?: string | null; pinned?: ReadonlySet<string>; limit?: number } = {},
): RailProjectThread[] {
  const limit = opts.limit ?? RAIL_PROJECT_THREADS;
  const own = threads.filter((thread) => thread.projectRoot === root);
  const childrenByParent = delegatedChildrenByParent(own);
  const nested = new Set([...childrenByParent.values()].flat().map((thread) => thread.id));
  const rows = own
    .filter((thread) => !nested.has(thread.id) && !opts.pinned?.has(thread.id))
    .map((thread) => {
      const children = childrenByParent.get(thread.id) ?? [];
      return { thread, children, at: Math.max(ts(thread), ...children.map(ts)) };
    })
    .sort((a, b) => b.at - a.at);
  const shown = rows.slice(0, limit);
  if (opts.activeId) {
    const active = own.find((thread) => thread.id === opts.activeId);
    // un fil délégué ouvert se retrouve par son parent
    const openId = active && nested.has(active.id)
      ? [...childrenByParent].find(([, list]) => list.some((child) => child.id === active.id))?.[0]
      : active?.id;
    const open = openId ? rows.find((row) => row.thread.id === openId) : undefined;
    if (open && !shown.includes(open) && shown.length) shown[shown.length - 1] = open;
  }
  return shown;
}

/** Sous-fils montrés sous une marque : au-delà, « +n » déplie la colonne. */
export const RAIL_CHILD_THREADS = 3;

/** État d'un sous-fil dans le rail : celui de la colonne (En cours, En file,
 * Attend ta réponse, À relire, Terminé), plus l'échec que le rail signale. */
export type RailChildState = DelegatedState | "fail";

export type RailChildThread = { thread: Thread; state: RailChildState };

export function railChildState(thread: Thread, signal?: RailSignal | null): RailChildState {
  if (signal === "fail") return "fail";
  if (signal === "wait") return "waiting";
  return delegatedState(thread, signal === "run", signal === "unread");
}

/** Sous-fils d'une marque (2026-11-15, variante A « Branches ») : même règle
 * que la colonne dépliée, sans la bascule. Montrés tant que la famille est
 * ouverte ou qu'un sous-fil n'est pas terminé ; au plus `limit`, l'ouvert
 * d'abord, puis ceux qui ne sont pas terminés, dans l'ordre de lancement. */
export function railChildThreads(
  row: RailProjectThread,
  opts: { activeId?: string | null; signals?: Record<string, RailSignal>; limit?: number } = {},
): { shown: RailChildThread[]; hidden: number } {
  const all = row.children.map((thread) => ({ thread, state: railChildState(thread, opts.signals?.[thread.id]) }));
  const open = row.thread.id === opts.activeId || all.some(({ thread }) => thread.id === opts.activeId);
  if (!all.length || (!open && all.every(({ state }) => state === "done"))) return { shown: [], hidden: 0 };
  const limit = opts.limit ?? RAIL_CHILD_THREADS;
  const rank = (child: RailChildThread) => child.thread.id === opts.activeId ? 0 : child.state === "done" ? 2 : 1;
  const keep = new Set(all.map((child, index) => ({ child, index }))
    .sort((a, b) => rank(a.child) - rank(b.child) || a.index - b.index)
    .slice(0, limit).map(({ child }) => child));
  return { shown: all.filter((child) => keep.has(child)), hidden: all.length - keep.size };
}

/** Signal d'une marque : le sien, plus celui des sous-fils qui n'ont pas
 * leur propre ligne (un sous-fil caché qui attend se lit sur son parent). */
export function rowSignal(
  row: RailProjectThread,
  signals?: Record<string, RailSignal>,
  shown: ReadonlySet<string> = new Set(),
): RailSignal | null {
  return strongest([row.thread, ...row.children.filter((child) => !shown.has(child.id))]
    .map((thread) => signals?.[thread.id]));
}
