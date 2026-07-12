import type { PendingChatAttachment } from "./types.ts";

const KEY = "atelier.pendingChatAttachments.v1";

export function loadPendingAttachments(): PendingChatAttachment[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as PendingChatAttachment[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function savePendingAttachments(items: PendingChatAttachment[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export function addPendingAttachment(item: PendingChatAttachment): PendingChatAttachment[] {
  const cur = loadPendingAttachments().filter((x) => x.fileId !== item.fileId);
  const next = [item, ...cur].slice(0, 20);
  savePendingAttachments(next);
  return next;
}

export function removePendingAttachment(fileId: string): PendingChatAttachment[] {
  const next = loadPendingAttachments().filter((x) => x.fileId !== fileId);
  savePendingAttachments(next);
  return next;
}

export function clearPendingAttachments(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
