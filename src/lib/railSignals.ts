// Signaux du rail (2026-10-21, piste B « Signaux + À traiter »). Le coin
// d'une puce ne porte plus que l'état de ses fils, avec quatre mots :
//   wait   — un fil attend ta réponse (autorisation, question, spécialiste
//            en pause faute d'échanges) ;
//   fail   — un tour s'est terminé en échec et tu ne l'as pas vu ;
//   run    — un agent travaille ;
//   unread — une réponse est arrivée et tu ne l'as pas lue.
// La couleur du projet a quitté ce coin pour son icône : un point qui ne
// signale rien ressemblait trop à une alerte (trois sur quatre, capture
// Thierry 2026-10-21).
import { useSyncExternalStore } from "react";
import type { AgentEvent, Thread } from "./ws";
import type { ThreadEvents } from "./threadEventStore";

import { SIGNAL_LABEL, type RailSignal } from "./railSignalLabel";

export { SIGNAL_LABEL, type RailSignal };

/** Priorité d'une puce qui agrège plusieurs fils : ce qui t'attend d'abord. */
const RANK: Record<RailSignal, number> = { wait: 4, fail: 3, run: 2, unread: 1 };

export function strongest(signals: Iterable<RailSignal | null | undefined>): RailSignal | null {
  let best: RailSignal | null = null;
  for (const signal of signals) if (signal && (!best || RANK[signal] > RANK[best])) best = signal;
  return best;
}

export type PendingRequest = { reason: "permission" | "question" | "paused"; label: string; at: number | null };
export type ThreadAttention = { pending: PendingRequest | null; failed: boolean };

const QUIET: ThreadAttention = { pending: null, failed: false };
const FAILED: ThreadAttention = { pending: null, failed: true };
/** Au-delà, une demande restée en suspens a forcément été suivie d'un tour. */
const SCAN_LIMIT = 400;

/** Lit la queue d'un fil : une demande sans réponse depuis le dernier tour,
 * ou un dernier tour en échec. Une autorisation restée `null` AVANT la fin
 * d'un tour est périmée (le tour a continué ou s'est arrêté sans elle).
 * Un message retenu (budget d'échanges d'un spécialiste épuisé, #94) part
 * pendant le tour et reste « paused » après sa fin : on le cherche jusqu'au
 * dernier message de l'utilisateur, qui recharge le budget et le relance.
 * Seul le côté expéditeur compte, pour ne pas le signaler deux fois. */
export function scanThreadEvents(events: readonly AgentEvent[] | undefined): ThreadAttention {
  if (!events?.length) return QUIET;
  const stop = Math.max(0, events.length - SCAN_LIMIT);
  let ended: ThreadAttention | null = null;
  for (let i = events.length - 1; i >= stop; i -= 1) {
    const event = events[i] as AgentEvent & { ts?: number };
    if (event.kind === "agent_message" && event.direction === "sent" && event.status === "paused") {
      const name = event.peerTitle?.split(" · ")[0] || event.peerProvider || "Spécialiste";
      return { pending: { reason: "paused", label: name, at: event.ts ?? null }, failed: false };
    }
    if (event.kind === "user") break;
    if (ended) continue;
    if (event.kind === "permission" && event.answered == null) {
      return { pending: { reason: "permission", label: event.toolName, at: event.ts ?? null }, failed: false };
    }
    if (event.kind === "interaction" && event.state === "pending") {
      return { pending: { reason: "question", label: event.title, at: event.ts ?? null }, failed: false };
    }
    if (event.kind === "done") ended = event.ok === false ? FAILED : QUIET;
    if (event.kind === "error") ended = FAILED;
  }
  return ended ?? QUIET;
}

/** Libellé d'une demande, pour l'infobulle d'un projet et la boîte. */
export function pendingTitle(pending: PendingRequest): string {
  if (pending.reason === "permission") return `Autorisation : ${pending.label}`;
  if (pending.reason === "paused") return `${pending.label} en pause`;
  return pending.label || "Question de l’agent";
}

export type AttentionMap = Record<string, ThreadAttention>;

export function attentionFromEvents(events: ThreadEvents): AttentionMap {
  const out: AttentionMap = {};
  for (const [id, list] of Object.entries(events)) {
    const attention = scanThreadEvents(list);
    if (attention !== QUIET) out[id] = attention;
  }
  return out;
}

function attentionKey(map: AttentionMap) {
  return Object.keys(map).sort().map((id) => {
    const a = map[id];
    return `${id}:${a.pending ? `${a.pending.reason}/${a.pending.label}` : ""}:${a.failed ? 1 : 0}`;
  }).join("|");
}

type AttentionSource = {
  subscribeAll: (listener: () => void) => () => void;
  getCommittedSnapshot: () => ThreadEvents;
};

const caches = new WeakMap<AttentionSource, { snapshot: ThreadEvents; key: string; value: AttentionMap }>();

/** Attention par fil, abonnée aux changements STRUCTURELS du store
 * (pas aux deltas de stream) ; même objet tant que rien ne change, pour que
 * le rail mémoïsé ne se redessine pas à chaque événement. */
export function readAttention(store: AttentionSource): AttentionMap {
  const snapshot = store.getCommittedSnapshot();
  const cached = caches.get(store);
  if (cached?.snapshot === snapshot) return cached.value;
  const value = attentionFromEvents(snapshot);
  const key = attentionKey(value);
  if (cached && cached.key === key) {
    cached.snapshot = snapshot;
    return cached.value;
  }
  caches.set(store, { snapshot, key, value });
  return value;
}

export function useThreadAttention(store: AttentionSource): AttentionMap {
  return useSyncExternalStore(store.subscribeAll, () => readAttention(store), () => readAttention(store));
}

/** Signal d'un fil. Le fil affiché n'est jamais « non lu » ni « en échec » :
 * tu le regardes. Une demande en attente reste visible même là (elle
 * réclame une action, pas un regard). */
export function threadSignal(
  thread: Pick<Thread, "id" | "status">,
  attention: ThreadAttention | undefined,
  unread: ReadonlySet<string>,
  activeId: string | null,
): RailSignal | null {
  if (attention?.pending) return "wait";
  const seen = thread.id === activeId;
  if (!seen && unread.has(thread.id) && attention?.failed) return "fail";
  if (thread.status === "running") return "run";
  if (!seen && unread.has(thread.id)) return "unread";
  return null;
}


/** Ce que montre le rail, agrégé depuis les fils (cf. Rail, RailSignals). */
export type RailSignalSummary = {
  projects: Record<string, RailSignal>;
  threads: Record<string, RailSignal>;
  notes: Record<string, string[]>;
  discussions: number;
};

export function summarizeRail(
  allThreads: readonly Thread[],
  attention: AttentionMap,
  unread: ReadonlySet<string>,
  activeId: string | null,
  isDiscussion: (root: string | null | undefined) => boolean,
): RailSignalSummary {
  const byProject: Record<string, RailSignal[]> = {};
  const threads: Record<string, RailSignal> = {};
  const notes: Record<string, string[]> = {};
  let discussions = 0;
  for (const th of allThreads) {
    const signal = threadSignal(th, attention[th.id], unread, activeId);
    if (!signal) continue;
    threads[th.id] = signal;
    if (isDiscussion(th.projectRoot)) {
      if (signal !== "run") discussions += 1;
      continue;
    }
    (byProject[th.projectRoot] ??= []).push(signal);
    const pending = attention[th.id]?.pending;
    const what = pending ? pendingTitle(pending) : SIGNAL_LABEL[signal];
    (notes[th.projectRoot] ??= []).push(`${what} — « ${th.title?.trim() || "Sans titre"} »`);
  }
  const projects: Record<string, RailSignal> = {};
  for (const [root, list] of Object.entries(byProject)) projects[root] = strongest(list)!;
  return { projects, threads, notes, discussions };
}
