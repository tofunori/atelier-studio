import { createContext, useContext, useEffect, useRef } from "react";

export type SearchTarget = { label: string; request: number } | null;
export const SettingsSearchTarget = createContext<SearchTarget>(null);

/** Runs after a lazy section and its disclosure have actually mounted. */
export function useSettingsTarget(label?: string) {
  const target = useContext(SettingsSearchTarget);
  const ref = useRef<HTMLDivElement>(null);
  const matches = !!label && target?.label === label;
  useEffect(() => {
    if (!matches) return;
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.scrollIntoView?.({ block: "center" });
      const control = el.querySelector<HTMLElement>('[role="slider"], input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)');
      (control ?? el).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [matches, target?.request]);
  return { ref, matches };
}
