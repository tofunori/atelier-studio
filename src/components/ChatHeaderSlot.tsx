import { useSyncExternalStore } from "react";

// TopBar owns the position; Chat retains the live controls and notice state.
let host: HTMLDivElement | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => host;
const setHost = (element: HTMLDivElement | null) => {
  if (host === element) return;
  host = element;
  listeners.forEach(listener => listener());
};
export function ChatHeaderSlot() {
  return <div className="topbar-chat-actions" ref={setHost} />;
}
export function useChatHeaderHost() {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
