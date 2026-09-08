import type { AgentEvent } from "./ws";

export type ThreadEvents = Record<string, AgentEvent[]>;
const EMPTY_EVENTS: AgentEvent[] = [];
const EMPTY_RECORD: ThreadEvents = {};
type Listener = () => void;

/** One store per App. Reads and functional updates are synchronous; React only
 * subscribes to the conversations a mounted view actually displays. */
export function createThreadEventStore(initial: ThreadEvents = {}) {
  const ref = { current: initial };
  const listeners = new Map<string, Set<Listener>>();
  const all = new Set<Listener>();
  return {
    ref,
    getSnapshot: () => ref.current,
    getEmptySnapshot: () => EMPTY_RECORD,
    getThread: (id: string | null) => id ? ref.current[id] ?? EMPTY_EVENTS : EMPTY_EVENTS,
    subscribe: (id: string | null, listener: Listener) => {
      if (id == null) return () => {};
      let group = listeners.get(id);
      if (!group) listeners.set(id, group = new Set());
      group.add(listener);
      return () => { group.delete(listener); if (!group.size) listeners.delete(id); };
    },
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
      // Publish after the whole transaction: every subscriber sees one snapshot.
      const notify = new Set(all);
      for (const id of changed) for (const listener of listeners.get(id) ?? []) notify.add(listener);
      for (const listener of notify) listener();
    },
  };
}
export type ThreadEventStore = ReturnType<typeof createThreadEventStore>;
