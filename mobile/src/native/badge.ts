/**
 * App icon badge — consistent reset after real consultation (plan 034 H).
 */

const KEY = "atelier.badgeCount.v1";

export function getBadgeCount(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(KEY) || 0));
  } catch {
    return 0;
  }
}

export function setBadgeCount(n: number): void {
  const v = Math.max(0, Math.floor(n));
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* ignore */
  }
  void applyBadge(v);
}

export function incrementBadge(by = 1): number {
  const n = getBadgeCount() + by;
  setBadgeCount(n);
  return n;
}

/** Call when user actually opens the related thread/interaction. */
export function clearBadge(): void {
  setBadgeCount(0);
}

async function applyBadge(n: number): Promise<void> {
  try {
    if (typeof navigator !== "undefined") {
      const nav = navigator as Navigator & {
        setAppBadge?: (n?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      if (n <= 0 && nav.clearAppBadge) await nav.clearAppBadge();
      else if (nav.setAppBadge) await nav.setAppBadge(n);
    }
  } catch {
    /* unsupported */
  }
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_badge_count", { count: n }).catch(() => undefined);
    }
  } catch {
    /* optional */
  }
}
