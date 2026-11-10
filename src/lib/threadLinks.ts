import type { Thread } from "./ws";

export type LinkedConversation = {
  thread: Thread;
  /** `unlinkThread` always targets the child side of the stored relation. */
  childThreadId: string;
  paused: boolean;
  /** Direction viewed from the current conversation. */
  direction: "parent" | "child";
};

export type ContinuityTreeNode = {
  thread: Thread;
  children: ContinuityTreeNode[];
};

export type ConversationContinuity = {
  root: ContinuityTreeNode;
  activePathIds: Set<string>;
  size: number;
};

export type ConversationFamily = {
  /** Stable identity for transient cross-row highlighting. */
  id: string;
  root: ContinuityTreeNode;
  size: number;
};

/** Direct conversation relations only. The storage model stays directional,
 * while the product UI deliberately presents a symmetric relationship. */
export function linkedConversations(
  threads: Thread[],
  threadId: string,
): LinkedConversation[] {
  const current = threads.find((thread) => thread.id === threadId);
  if (!current) return [];

  const related: LinkedConversation[] = [];
  if (current.agentLink) {
    const source = threads.find(
      (thread) => thread.id === current.agentLink?.parentThreadId,
    );
    if (source) {
      related.push({
        thread: source,
        childThreadId: current.id,
        paused: current.agentLink.paused,
        direction: "parent",
      });
    }
  }

  for (const candidate of threads) {
    if (candidate.agentLink?.parentThreadId !== current.id) continue;
    related.push({
      thread: candidate,
      childThreadId: candidate.id,
      paused: candidate.agentLink.paused,
      direction: "child",
    });
  }

  return related;
}

/** Project a thread's whole connected agentLink component as a rooted tree.
 * The persisted model already guarantees at most one parent per thread; this
 * projection adds cycle/orphan guards so corrupt local data cannot hang UI. */
export function conversationContinuity(
  threads: Thread[],
  threadId: string,
): ConversationContinuity | null {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const active = byId.get(threadId);
  if (!active) return null;

  let root = active;
  const ancestors = new Set([active.id]);
  while (root.agentLink?.parentThreadId) {
    const parent = byId.get(root.agentLink.parentThreadId);
    if (!parent || ancestors.has(parent.id)) break;
    ancestors.add(parent.id);
    root = parent;
  }

  const childrenByParent = new Map<string, Thread[]>();
  for (const thread of threads) {
    const parentId = thread.agentLink?.parentThreadId;
    if (!parentId || !byId.has(parentId)) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(thread);
    childrenByParent.set(parentId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => {
      const leftCreated = left.agentLink?.createdAt ?? left.updatedAt ?? "";
      const rightCreated = right.agentLink?.createdAt ?? right.updatedAt ?? "";
      return leftCreated.localeCompare(rightCreated) || left.id.localeCompare(right.id);
    });
  }

  const visited = new Set<string>();
  function build(thread: Thread): ContinuityTreeNode {
    visited.add(thread.id);
    const children = (childrenByParent.get(thread.id) ?? [])
      .filter((candidate) => !visited.has(candidate.id))
      .map(build);
    return { thread, children };
  }
  const tree = build(root);
  if (visited.size < 2) return null;

  const activePathIds = new Set<string>();
  let cursor: Thread | undefined = active;
  const pathGuard = new Set<string>();
  while (cursor && !pathGuard.has(cursor.id)) {
    pathGuard.add(cursor.id);
    activePathIds.add(cursor.id);
    if (cursor.id === root.id) break;
    cursor = cursor.agentLink?.parentThreadId
      ? byId.get(cursor.agentLink.parentThreadId)
      : undefined;
  }

  return { root: tree, activePathIds, size: visited.size };
}

function flattenTree(root: ContinuityTreeNode): ContinuityTreeNode[] {
  const nodes: ContinuityTreeNode[] = [];
  const visit = (node: ContinuityTreeNode) => {
    nodes.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return nodes;
}

/** Assign one shared family projection to every connected conversation.
 * Identity comes from the persisted root rather than sidebar order, so a new
 * reply can reorder rows without breaking transient family highlighting. */
export function conversationFamilies(
  threads: Thread[],
): Map<string, ConversationFamily> {
  const visited = new Set<string>();
  const families: Array<{ root: ContinuityTreeNode; nodes: ContinuityTreeNode[] }> = [];

  for (const thread of threads) {
    if (visited.has(thread.id)) continue;
    const continuity = conversationContinuity(threads, thread.id);
    if (!continuity) continue;
    const nodes = flattenTree(continuity.root);
    nodes.forEach((node) => visited.add(node.thread.id));
    families.push({ root: continuity.root, nodes });
  }

  const byThread = new Map<string, ConversationFamily>();
  families.forEach((entry) => {
    const family: ConversationFamily = {
      id: entry.root.thread.id,
      root: entry.root,
      size: entry.nodes.length,
    };
    entry.nodes.forEach((node) => byThread.set(node.thread.id, family));
  });
  return byThread;
}

export function linkedConversationForProvider(
  threads: Thread[],
  threadId: string,
  provider: string,
): LinkedConversation | undefined {
  return linkedConversations(threads, threadId).find(
    (relation) => relation.thread.provider === provider,
  );
}

export type LinkedAgentSummary = {
  id: string;
  provider: string;
  title: string;
  paused: boolean;
  direction: "parent" | "child";
  /** Fil délégué à un spécialiste (`@NomCourt`) : son nom pour le panneau
   * des agents de l'en-tête. */
  specialiste?: { nom: string; nomCourt: string };
  /** Tour en cours dans ce fil, et depuis quand (horloge du chat). */
  running?: boolean;
  since?: number | null;
  updatedAt?: string;
};

/** Conversations liées au fil actif, telles que l'en-tête du chat les liste. */
export function linkedAgentSummaries(
  threads: Thread[],
  threadId: string | null,
  workingSince?: Record<string, number | null>,
): LinkedAgentSummary[] {
  if (!threadId) return [];
  return linkedConversations(threads, threadId).map((relation) => {
    const thread = relation.thread;
    const summary: LinkedAgentSummary = {
      id: thread.id,
      provider: thread.provider === "opencode"
        ? "OpenCode"
        : thread.provider.charAt(0).toUpperCase() + thread.provider.slice(1),
      title: thread.title,
      paused: relation.paused,
      direction: relation.direction,
    };
    const specialiste = relation.direction === "child" ? thread.consigne?.specialiste : undefined;
    if (specialiste) {
      const since = workingSince?.[thread.id] ?? null;
      Object.assign(summary, {
        specialiste: { nom: specialiste.nom, nomCourt: specialiste.nomCourt },
        running: since != null || thread.status === "running",
        since,
        updatedAt: thread.updatedAt,
      });
    }
    return summary;
  });
}

/** Fil confié par son parent (spécialiste délégué, ou fil lancé par la
 * conversation qui coordonne). Coordinateur et fils, 2026-11-09 : ces fils
 * se rangent SOUS leur parent dans la colonne et n'ont pas d'onglet à eux. */
export function isDelegatedThread(thread: Thread): boolean {
  return !!thread.agentLink && !!thread.delegue && typeof thread.delegue === "object";
}

/** Parent sous lequel ranger `thread`, s'il est un fil délégué dont le parent
 * est connu et n'est pas lui-même rangé (un seul niveau). */
export function nestingParentId(
  thread: Thread,
  byId: ReadonlyMap<string, Thread>,
): string | null {
  if (!isDelegatedThread(thread)) return null;
  const parent = byId.get(thread.agentLink!.parentThreadId);
  if (!parent || parent.id === thread.id || isDelegatedThread(parent)) return null;
  return parent.id;
}

/** Fils délégués de chaque parent présent dans `threads`, du plus ancien au
 * plus récent (ordre de lancement : Fil A, Fil B, Fil C). */
export function delegatedChildrenByParent(threads: Thread[]): Map<string, Thread[]> {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const children = new Map<string, Thread[]>();
  for (const thread of threads) {
    const parentId = nestingParentId(thread, byId);
    if (!parentId) continue;
    const list = children.get(parentId) ?? [];
    list.push(thread);
    children.set(parentId, list);
  }
  for (const list of children.values()) {
    list.sort((left, right) =>
      (left.agentLink?.createdAt ?? "").localeCompare(right.agentLink?.createdAt ?? "")
      || left.id.localeCompare(right.id));
  }
  return children;
}

/** État d'un fil délégué, tel que la colonne l'écrit sous son parent. */
export type DelegatedState = "running" | "queued" | "waiting" | "review" | "done";

export function delegatedState(thread: Thread, running: boolean, unread: boolean): DelegatedState {
  if (running || thread.status === "running") return "running";
  if (typeof thread.rapportA === "string" && thread.rapportA) return unread ? "review" : "done";
  // Pas encore de session : la tâche attend son tour dans la boîte aux lettres.
  if (!thread.sessionId) return "queued";
  // Le fil s'est arrêté sans rendre compte : il pose une question ou bloque.
  return "waiting";
}
