// Fils récents du projet actif, montrés sous sa puce dans la barre compacte
// (2026-11-12, option A « Fils du projet »). Pur : aucune dépendance React.
// Hors de l'entrée : seul le rail, chargé à la demande, l'importe.
import type { Thread } from "./ws";
import { delegatedChildrenByParent } from "./threadLinks";
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

/** Signal d'une marque : un fil délégué qui attend se lit sur son parent. */
export function rowSignal(row: RailProjectThread, signals?: Record<string, RailSignal>): RailSignal | null {
  return strongest([row.thread, ...row.children].map((thread) => signals?.[thread.id]));
}
