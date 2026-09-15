import type { AgentEvent } from "./ws";

export type ThreadEvents = Record<string, AgentEvent[]>;
const EMPTY_EVENTS: AgentEvent[] = [];
const EMPTY_RECORD: ThreadEvents = {};
type Listener = () => void;

/** Bulles dont le texte grandit en direct : leur croissance est un « delta de
 * queue », pas un changement de liste. */
const LIVE_TAIL_KINDS = new Set<string>(["streaming", "thinking_live"]);

/** Vrai si `next` ne diffère de `committed` que par ses 1-2 dernières bulles
 * vivantes (même kind, mêmes places) : la liste publiée peut rester la même. */
function tailOnly(committed: AgentEvent[] | undefined, next: AgentEvent[] | undefined): boolean {
  if (!committed || !next || committed.length !== next.length || !next.length) return false;
  const n = next.length;
  const from = Math.max(0, n - 2);
  for (let i = 0; i < from; i += 1) if (committed[i] !== next[i]) return false;
  let differing = 0;
  for (let i = from; i < n; i += 1) {
    if (committed[i] === next[i]) continue;
    if (committed[i].kind !== next[i].kind || !LIVE_TAIL_KINDS.has(next[i].kind)) return false;
    differing += 1;
  }
  return differing > 0;
}

/** One store per App. Reads and functional updates are synchronous; React only
 * subscribes to the conversations a mounted view actually displays.
 *
 * Deux vues du même fil (banc chat_stream_bench, 2026-09-15) :
 * - `ref.current` / `getThread` : la vérité complète, à jour à chaque delta —
 *   pour la logique (historique, revert, export) et pour les bulles vivantes ;
 * - `getCommitted` : la liste que la timeline affiche. Elle ne change que sur
 *   un changement STRUCTUREL (événement ajouté/retiré/remplacé). Un delta qui
 *   ne fait que faire grandir la dernière bulle streaming ou pensée vivante ne
 *   notifie que les abonnés `subscribeLive` de ce fil — `Chat`, la projection
 *   des tours et la liste virtuelle gardent leur instantané au lieu de tout
 *   recalculer vingt fois par seconde. */
export function createThreadEventStore(initial: ThreadEvents = {}) {
  const ref = { current: initial };
  const committedRef = { current: initial };
  const listeners = new Map<string, Set<Listener>>();
  const liveListeners = new Map<string, Set<Listener>>();
  const all = new Set<Listener>();
  const subscribeTo = (map: Map<string, Set<Listener>>) => (id: string | null, listener: Listener) => {
    if (id == null) return () => {};
    let group = map.get(id);
    if (!group) map.set(id, group = new Set());
    group.add(listener);
    return () => { group.delete(listener); if (!group.size) map.delete(id); };
  };
  return {
    ref,
    getSnapshot: () => ref.current,
    getEmptySnapshot: () => EMPTY_RECORD,
    getThread: (id: string | null) => id ? ref.current[id] ?? EMPTY_EVENTS : EMPTY_EVENTS,
    /** Instantané de la timeline : stable pendant le streaming. */
    getCommitted: (id: string | null) => id ? committedRef.current[id] ?? EMPTY_EVENTS : EMPTY_EVENTS,
    getCommittedSnapshot: () => committedRef.current,
    /** Texte courant de la dernière bulle vivante d'un kind — lu par la bulle
     * elle-même sur le canal live ; null sans bulle de ce kind en queue. */
    liveText: (id: string | null, kind: "streaming" | "thinking_live"): string | null => {
      const events = id ? ref.current[id] : undefined;
      if (!events) return null;
      for (let i = events.length - 1; i >= Math.max(0, events.length - 2); i -= 1) {
        const event = events[i];
        if (event.kind === kind) return (event as { text?: string }).text ?? "";
      }
      return null;
    },
    subscribe: subscribeTo(listeners),
    subscribeLive: subscribeTo(liveListeners),
    subscribeAll: (listener: Listener) => { all.add(listener); return () => { all.delete(listener); }; },
    update: (update: ThreadEvents | ((previous: ThreadEvents) => ThreadEvents)) => {
      const previous = ref.current;
      const next = typeof update === "function" ? update(previous) : update;
      if (next === previous) return;
      const changed = new Set([...Object.keys(previous), ...Object.keys(next)]);
      for (const id of changed) {
        if (previous[id] === next[id] && Object.prototype.hasOwnProperty.call(previous, id) === Object.prototype.hasOwnProperty.call(next, id)) changed.delete(id);
      }
      if (!changed.size) return;
      ref.current = next;
      const structural: string[] = [];
      for (const id of changed) if (!tailOnly(committedRef.current[id], next[id])) structural.push(id);
      if (structural.length) {
        const committed = { ...committedRef.current };
        for (const id of structural) {
          if (Object.prototype.hasOwnProperty.call(next, id)) committed[id] = next[id];
          else delete committed[id];
        }
        committedRef.current = committed;
      }
      // Publish after the whole transaction: every subscriber sees one snapshot.
      const notify = new Set<Listener>();
      if (structural.length) for (const listener of all) notify.add(listener);
      for (const id of structural) for (const listener of listeners.get(id) ?? []) notify.add(listener);
      for (const id of changed) for (const listener of liveListeners.get(id) ?? []) notify.add(listener);
      for (const listener of notify) listener();
    },
  };
}
export type ThreadEventStore = ReturnType<typeof createThreadEventStore>;
