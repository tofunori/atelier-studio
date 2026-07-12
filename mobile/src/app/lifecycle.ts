/**
 * iOS / browser lifecycle signals (plan 034 F).
 * Visibility + online/offline. Does not invent stream continuity while suspended.
 */

export type LifecycleHandlers = {
  onForeground: () => void;
  onBackground: () => void;
  onOnline: () => void;
  onOffline: () => void;
};

export function installLifecycleListeners(h: LifecycleHandlers): () => void {
  const onVis = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") h.onForeground();
    else h.onBackground();
  };
  const onOnline = () => h.onOnline();
  const onOffline = () => h.onOffline();

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVis);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
  }

  return () => {
    document?.removeEventListener("visibilitychange", onVis);
    window?.removeEventListener("online", onOnline);
    window?.removeEventListener("offline", onOffline);
  };
}

export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function isNavigatorOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}
