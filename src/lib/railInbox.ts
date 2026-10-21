// Contenu de la boîte « À traiter » (piste B, 2026-10-21) : chargé avec le
// panneau, à l'ouverture seulement — le budget d'entrée JS est plein.
import type { Thread } from "./ws";
import { pendingTitle, threadSignal, type AttentionMap } from "./railSignals";

export type InboxGroup = "wait" | "done" | "fail";
export type InboxItem = {
  id: string;
  group: InboxGroup;
  /** absent pour une conversion d'article */
  threadId?: string;
  projectRoot?: string;
  title: string;
  detail: string;
  at: number | null;
  icon: "permission" | "question" | "paused" | "done" | "fail";
};

const GROUP_ORDER: Record<InboxGroup, number> = { wait: 0, fail: 1, done: 2 };

export function projectLabel(root: string | undefined, isDiscussion: boolean) {
  if (isDiscussion) return "Discussion libre";
  return root?.split("/").filter(Boolean).pop() || "Sans projet";
}

/** Ce qui t'attend, fil par fil. Les fils affichés et ceux en cours sans
 * demande n'y figurent pas : la boîte ne liste que ce qui réclame un geste. */
export function buildInbox(
  threads: readonly Thread[],
  attention: AttentionMap,
  unread: ReadonlySet<string>,
  activeId: string | null,
  isDiscussion: (root: string | undefined) => boolean,
): InboxItem[] {
  const items: InboxItem[] = [];
  for (const thread of threads) {
    const signal = threadSignal(thread, attention[thread.id], unread, activeId);
    if (!signal || signal === "run") continue;
    const title = thread.title?.trim() || "Sans titre";
    const project = projectLabel(thread.projectRoot, isDiscussion(thread.projectRoot));
    const updated = Date.parse(thread.updatedAt);
    const base = { threadId: thread.id, projectRoot: thread.projectRoot, at: Number.isFinite(updated) ? updated : null };
    if (signal === "wait") {
      const pending = attention[thread.id]!.pending!;
      items.push({
        ...base, id: `wait:${thread.id}`, group: "wait", icon: pending.reason,
        title: pendingTitle(pending),
        detail: `${title} · ${project}`,
        at: pending.at ?? base.at,
      });
    } else {
      items.push({
        ...base, id: `${signal}:${thread.id}`, group: signal === "fail" ? "fail" : "done",
        icon: signal === "fail" ? "fail" : "done",
        title, detail: `${signal === "fail" ? "Tour en échec" : "Réponse terminée"} · ${project}`,
      });
    }
  }
  return items.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || (b.at ?? 0) - (a.at ?? 0));
}

/** « il y a 3 min » en court, chiffres alignés côté rendu. */
export function shortAge(at: number | null, now = Date.now()): string {
  if (at == null) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
}
