import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ThreadEventStore } from "../lib/threadEventStore";

/** La timeline lit l'instantané COMMITTED : un delta de streaming qui ne fait
 * que faire grandir la dernière bulle ne la re-rend pas (voir threadEventStore). */
export function useThreadEvents(store: ThreadEventStore, threadId: string | null) {
  const subscribe = useCallback((notify: () => void) => store.subscribe(threadId, notify), [store, threadId]);
  const snapshot = useCallback(() => store.getCommitted(threadId), [store, threadId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
const noSubscription = () => () => {};
/** The home feed reads all conversations only while it is actually displayed. */
export function useHomeThreadEvents(store: ThreadEventStore, visible: boolean) {
  const snapshot = visible ? store.getCommittedSnapshot : store.getEmptySnapshot;
  return useSyncExternalStore(visible ? store.subscribeAll : noSubscription, snapshot, snapshot);
}

/** Store du fil affiché, posé par ThreadChat. Absent (tests, aperçus) : les
 * bulles vivantes retombent sur le texte de leur événement. */
export const ThreadEventStoreContext = createContext<ThreadEventStore | null>(null);

/** Texte courant d'une bulle vivante (streaming / pensée), abonné au canal
 * live du fil : c'est la SEULE chose qui se re-rend à chaque delta. Sans
 * store, sans fil ou sans bulle de ce kind en queue : `fallback`. */
export function useLiveTailText(
  threadId: string | null,
  kind: "streaming" | "thinking_live",
  fallback: string,
): string {
  const store = useContext(ThreadEventStoreContext);
  const subscribe = useCallback(
    (notify: () => void) => (store ? store.subscribeLive(threadId, notify) : noSubscription()),
    [store, threadId],
  );
  const snapshot = useCallback(
    () => (store ? store.liveText(threadId, kind) ?? fallback : fallback),
    [store, threadId, kind, fallback],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
