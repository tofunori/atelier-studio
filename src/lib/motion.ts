import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

/** Also updates a mounted timeline when the system preference changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
