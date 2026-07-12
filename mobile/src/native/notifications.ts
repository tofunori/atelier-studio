/**
 * Opt-in notifications — minimal lock-screen content by default (plan 034 H).
 * Permission requested only on first enable, never at cold start.
 */

export type NotifKind = "done" | "error" | "interaction";

export type NotificationPrefs = {
  /** Master switch — default false (opt-in). */
  enabled: boolean;
  onDone: boolean;
  onError: boolean;
  onInteraction: boolean;
  /**
   * When false (default): title only generic, no prompt/scientific detail.
   * When true: allow thread title in body (still no full prompt).
   */
  showThreadTitle: boolean;
  permission: NotificationPermission | "unsupported";
};

const PREFS_KEY = "atelier.notifPrefs.v1";

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  enabled: false,
  onDone: true,
  onError: true,
  onInteraction: true,
  showThreadTitle: false,
  permission: "default",
};

export function loadNotifPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIF_PREFS };
    const v = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { ...DEFAULT_NOTIF_PREFS, ...v };
  } catch {
    return { ...DEFAULT_NOTIF_PREFS };
  }
}

export function saveNotifPrefs(p: NotificationPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function notificationSupported(): boolean {
  return typeof Notification !== "undefined";
}

/** First contextual need only. */
export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export type NotifyPayload = {
  kind: NotifKind;
  threadId: string;
  threadTitle?: string;
  /** Never include full prompt or secrets. */
  safeSummary?: string;
  requestId?: string;
  projectId?: string;
};

/**
 * Build lock-screen safe title/body.
 * Default: generic labels only.
 */
export function buildNotifContent(
  prefs: NotificationPrefs,
  p: NotifyPayload,
): { title: string; body: string } | null {
  if (!prefs.enabled) return null;
  if (p.kind === "done" && !prefs.onDone) return null;
  if (p.kind === "error" && !prefs.onError) return null;
  if (p.kind === "interaction" && !prefs.onInteraction) return null;

  const title =
    p.kind === "done"
      ? "Atelier — terminé"
      : p.kind === "error"
        ? "Atelier — erreur"
        : "Atelier — action requise";

  let body = "Ouvrir pour voir le détail";
  if (prefs.showThreadTitle && p.threadTitle) {
    body = p.threadTitle.slice(0, 80);
  }
  // Never put safeSummary with potential scientific content unless showThreadTitle
  // and even then only short generic
  if (prefs.showThreadTitle && p.safeSummary && p.kind === "interaction") {
    body = `${body} · interaction`;
  }

  return { title, body };
}

export async function showLocalNotification(
  prefs: NotificationPrefs,
  p: NotifyPayload,
): Promise<boolean> {
  const content = buildNotifContent(prefs, p);
  if (!content) return false;
  if (!notificationSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const tag = `atelier-${p.kind}-${p.threadId}-${p.requestId ?? ""}`;
  try {
    const n = new Notification(content.title, {
      body: content.body,
      tag,
      // silent not set — OS default
      data: {
        deepLink: buildDeepLink({
          threadId: p.threadId,
          requestId: p.requestId,
          projectId: p.projectId,
        }),
      },
    });
    n.onclick = () => {
      try {
        window.focus();
        const link = (n as Notification & { data?: { deepLink?: string } }).data?.deepLink;
        if (link) {
          window.dispatchEvent(new CustomEvent("atelier-deeplink", { detail: { url: link } }));
        }
      } catch {
        /* ignore */
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function buildDeepLink(opts: {
  threadId?: string;
  projectId?: string;
  requestId?: string;
}): string {
  const u = new URL("atelier://open");
  if (opts.projectId) u.searchParams.set("projectId", opts.projectId);
  if (opts.threadId) u.searchParams.set("threadId", opts.threadId);
  if (opts.requestId) u.searchParams.set("requestId", opts.requestId);
  return u.toString();
}

export type DeepLinkTarget = {
  projectId?: string;
  threadId?: string;
  requestId?: string;
};

export function parseDeepLink(url: string): DeepLinkTarget | null {
  try {
    // atelier://open?threadId=... or https://...
    const normalized = url.replace(/^atelier:/, "https://atelier.local");
    const u = new URL(normalized);
    if (u.hostname !== "open" && u.pathname !== "/open" && !u.searchParams.has("threadId")) {
      // atelier://open → hostname open
      if (u.host !== "open" && !url.includes("threadId")) return null;
    }
    return {
      projectId: u.searchParams.get("projectId") ?? undefined,
      threadId: u.searchParams.get("threadId") ?? undefined,
      requestId: u.searchParams.get("requestId") ?? undefined,
    };
  } catch {
    return null;
  }
}
