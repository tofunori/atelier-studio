import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const STORAGE_KEY = "atelier-studio.notifications";

type NotifyRunDoneArgs = {
  threadId: string;
  title: string;
  ok: boolean;
  summary: string;
};

type NotifyReviewArgs = {
  threadId: string;
  issues: readonly string[];
};

type EmitNotificationArgs = {
  threadId: string;
  title: string;
  body?: string;
  respectAttention: boolean;
};

export const pendingNotificationThread = new Map<number, string>();

let cachedEnabled: boolean | null = null;
let cachedPermissionGranted: boolean | null = null;
let permissionRequest: Promise<boolean> | null = null;

function readEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    cachedEnabled = stored === null ? true : stored === "1";
  } catch {
    cachedEnabled = true;
  }

  return cachedEnabled;
}

function writeEnabled(enabled: boolean): void {
  cachedEnabled = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures: callers still get the in-memory value.
  }
}

function shouldNotifyAwayFromApp(): boolean {
  return document.hidden || !document.hasFocus();
}

function truncateText(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("");
}

function nextNotificationId(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

async function resolvePermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  cachedPermissionGranted = granted;
  return granted;
}

async function emitNotification(args: EmitNotificationArgs): Promise<boolean> {
  if (!readEnabled()) return false;
  if (args.respectAttention && !shouldNotifyAwayFromApp()) return false;
  if (!(await init())) return false;

  const id = nextNotificationId();
  sendNotification({
    id,
    title: args.title,
    body: args.body,
    extra: { threadId: args.threadId },
    autoCancel: true,
  });
  pendingNotificationThread.set(id, args.threadId);
  return true;
}

export async function init(): Promise<boolean> {
  if (!readEnabled()) {
    return false;
  }

  if (cachedPermissionGranted !== null) return cachedPermissionGranted;
  if (permissionRequest) return permissionRequest;

  permissionRequest = resolvePermission().finally(() => {
    permissionRequest = null;
  });

  return permissionRequest;
}

export function setEnabled(enabled: boolean): void {
  writeEnabled(enabled);
}

export function isEnabled(): boolean {
  return readEnabled();
}

export async function notifyRunDone(args: NotifyRunDoneArgs): Promise<boolean> {
  const title = truncateText(args.title, 60);
  const summary = truncateText(args.summary, 100);
  const body = args.ok ? summary : `Échec — ${summary}`;

  return emitNotification({
    threadId: args.threadId,
    title,
    body,
    respectAttention: true,
  });
}

export async function notifyReview(args: NotifyReviewArgs): Promise<boolean> {
  const count = args.issues.length;
  const body = count > 0 ? truncateText(args.issues.join(" ; "), 100) : undefined;

  return emitNotification({
    threadId: args.threadId,
    title: `Vérification : ${count} incohérence(s)`,
    body,
    respectAttention: true,
  });
}

export async function demoNotification(): Promise<boolean> {
  return emitNotification({
    threadId: "demo",
    title: "Atelier Studio",
    body: "Notification de test",
    respectAttention: false,
  });
}
