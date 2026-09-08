import { useCallback, useSyncExternalStore } from "react";
import type { ThreadEventStore } from "../lib/threadEventStore";

export function useThreadEvents(store: ThreadEventStore, threadId: string | null) {
  const subscribe = useCallback((notify: () => void) => store.subscribe(threadId, notify), [store, threadId]);
  const snapshot = useCallback(() => store.getThread(threadId), [store, threadId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
const noSubscription = () => () => {};
/** The home feed reads all conversations only while it is actually displayed. */
export function useHomeThreadEvents(store: ThreadEventStore, visible: boolean) {
  const snapshot = visible ? store.getSnapshot : store.getEmptySnapshot;
  return useSyncExternalStore(visible ? store.subscribeAll : noSubscription, snapshot, snapshot);
}
