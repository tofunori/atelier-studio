import { useEffect, useMemo, useState } from "react";
import type { ProjectChatTab } from "../components/chat/ProjectChatTabs";

export const CHAT_TABS_KEY = "atelier-studio.open-chat-tabs.v1";
type Tabs = { open: string[]; pinned: string[] };
type Registry = Record<string, Tabs>;
const EMPTY: Tabs = { open: [], pinned: [] };
function read(): Registry {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CHAT_TABS_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
      if (!entry || !Array.isArray(entry.open) || !Array.isArray(entry.pinned)) return [];
      const open = [...new Set<string>(entry.open.filter((id: unknown) => typeof id === "string"))];
      return [[key, { open, pinned: [...new Set<string>(entry.pinned.filter((id: unknown) => typeof id === "string" && open.includes(id)))] }]];
    }));
  } catch { return {}; }
}

/** Only navigation state is persisted; closing never mutates the thread store. */
export function useOpenChatTabs(project: string | null, activeId: string | null, chats: ProjectChatTab[]) {
  const [registry, setRegistry] = useState<Registry>(read);
  const stored = project ? registry[project] ?? EMPTY : EMPTY;
  const activeKnown = activeId != null && chats.some(chat => chat.id === activeId);
  const state = useMemo(() => activeKnown && !stored.open.includes(activeId!)
    ? { ...stored, open: [...stored.open, activeId!] } : stored, [stored, activeKnown, activeId]);
  // Selection from the sidebar also opens a tab. Missing records during startup
  // do not erase persisted tabs; the backend may still be loading its list.
  useEffect(() => {
    if (project && state !== stored) setRegistry(current => ({ ...current, [project]: state }));
  }, [project, state, stored]);
  useEffect(() => {
    try { localStorage.setItem(CHAT_TABS_KEY, JSON.stringify(registry)); } catch { /* session remains usable */ }
  }, [registry]);
  const openChats = useMemo(() => {
    const byId = new Map(chats.map(chat => [chat.id, chat]));
    return [...state.open.filter(id => state.pinned.includes(id)), ...state.open.filter(id => !state.pinned.includes(id))]
      .flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  }, [chats, state]);
  const save = (next: Tabs) => {
    if (project) setRegistry(current => ({ ...current, [project]: next }));
  };
  const close = (ids: string[]) => {
    const removed = new Set(ids.filter(id => !state.pinned.includes(id)));
    const remaining = openChats.filter(chat => !removed.has(chat.id));
    save({ ...state, open: state.open.filter(id => !removed.has(id)) });
    if (!activeId || !removed.has(activeId)) return activeId;
    const index = openChats.findIndex(chat => chat.id === activeId);
    return remaining[Math.min(index, remaining.length - 1)]?.id ?? null;
  };
  const togglePin = (id: string) => save({
    open: state.open.includes(id) ? state.open : [...state.open, id],
    pinned: state.pinned.includes(id) ? state.pinned.filter(key => key !== id) : [...state.pinned, id],
  });
  return { openChats, pinnedIds: state.pinned, close, togglePin };
}
