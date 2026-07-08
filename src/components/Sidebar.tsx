import { useEffect, useRef, useState } from "react";
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { Thread } from "../lib/ws";
import { PROJ_COLORS } from "./Rail";
import { wsSend } from "../lib/wsBus";
import { t } from "../lib/i18n";
const tr = t; // alias : t est masqué par les threads dans les .map
import { PlusIcon, ProviderIcon, ResumeIcon, SettingsIcon, SidebarIcon } from "./icons";

type Menu = { x: number; y: number; threadId: string };
type RecencyBucket = "today" | "yesterday" | "last7" | "older";
export type RecencyRow =
  | { kind: "section"; bucket: RecencyBucket }
  | { kind: "thread"; thread: Thread };

const DAY_MS = 24 * 60 * 60 * 1000;

// titre lisible : un titre qui est un chemin absolu devient "…/nom-de-fichier"
function niceTitle(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const title = raw || "Sans titre";
  const m = /^(\/[\w~. -]+(?:\/[\w~. -]+)+)([\s\S]*)$/.exec(title);
  if (!m) return title;
  const base = m[1].split("/").filter(Boolean).pop() ?? m[1];
  const rest = m[2].trim();
  return rest ? `${base} — ${rest.slice(0, 40)}` : base;
}

function threadRoot(t: Thread): string {
  return typeof (t as any).projectRoot === "string" ? (t as any).projectRoot : "";
}

export function rawThreadTitle(t: Thread): string {
  const raw = (t as any).title;
  return typeof raw === "string" && raw.trim() ? raw : "Sans titre";
}

export function threadTitle(t: Thread): string {
  return niceTitle(rawThreadTitle(t));
}

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function threadRecencyBucket(thread: Thread): RecencyBucket {
  const ts = Date.parse(thread.updatedAt);
  if (!Number.isFinite(ts)) return "older";
  const ageDays = Math.floor((startOfLocalDay(new Date()) - startOfLocalDay(new Date(ts))) / DAY_MS);
  if (ageDays <= 0) return "today";
  if (ageDays === 1) return "yesterday";
  if (ageDays < 7) return "last7";
  return "older";
}

export function recencyLabelKey(bucket: RecencyBucket) {
  switch (bucket) {
    case "today": return "sidebar.recency.today";
    case "yesterday": return "sidebar.recency.yesterday";
    case "last7": return "sidebar.recency.last7";
    case "older": return "sidebar.recency.older";
  }
}

export function withRecencySections(threads: Thread[]): RecencyRow[] {
  const rows: RecencyRow[] = [];
  let current: RecencyBucket | null = null;
  for (const thread of threads) {
    const bucket = threadRecencyBucket(thread);
    if (bucket !== current) {
      rows.push({ kind: "section", bucket });
      current = bucket;
    }
    rows.push({ kind: "thread", thread });
  }
  return rows;
}

export const PROJ_ICONS: Record<string, string> = {
  mountain: "M1.5 12.5L6 4l3 5.5L11 6l3.5 6.5z",
  snow: "M8 1.5v13M3 4l10 8M13 4L3 12M5.5 2.8L8 4.5l2.5-1.7M5.5 13.2L8 11.5l2.5 1.7",
  thermo: "M6.5 2.5a1.5 1.5 0 0 1 3 0v6a3 3 0 1 1-3 0zM8 6v5",
  flame: "M8 1.8c1 2.4 4 3.6 4 7a4 4 0 0 1-8 0c0-2 1.2-3 2-4.4.5 1 1.4 1.4 2 1.4-.6-1.3-.4-2.7 0-4z",
  satellite: "M6 6L2.5 2.5M10 10l3.5 3.5M4.5 8.5l3-3 3 3-3 3zM11 3.5l1.5 1.5M3.5 11l1.5 1.5",
  chart: "M2 13.5V9M6 13.5V5.5M10 13.5V7.5M14 13.5V3.5",
  map: "M2 3.5l4-1.5 4 1.5 4-1.5v10l-4 1.5-4-1.5-4 1.5zM6 2v10.5M10 3.5V14",
  globe: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM1.8 8h12.4M8 1.8c2.2 2 2.2 10.4 0 12.4M8 1.8c-2.2 2-2.2 10.4 0 12.4",
  drop: "M8 1.8C10 5 12.5 7 12.5 9.8a4.5 4.5 0 0 1-9 0C3.5 7 6 5 8 1.8z",
  sun: "M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1",
  tree: "M8 14v-3M8 2l-3.5 4.5h2L3.5 10.5h9L9.5 6.5h2z",
  doc: "M4 1.8h5.2L13 5.6v8.6H4zM9 1.8v4h4",
  book: "M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2zM3 11.5a2 2 0 0 1 2-2h7.5",
  pencil: "M11.5 2.5l2 2L6 12l-2.7.7L4 10z",
  micro: "M7 2.5l2.5 2.5-4 4L3 6.5zM8.2 7.8L10 9.5a4 4 0 0 1-6 3.6M4 13.5h8",
  flask: "M6.5 2h3M7 2v4l-3.4 6a1.5 1.5 0 0 0 1.3 2.2h6.2a1.5 1.5 0 0 0 1.3-2.2L9 6V2M5.5 10.5h5",
  term: "M1.8 2.8h12.4v10.4H1.8zM4.5 6l2.2 2-2.2 2M8.5 10.5h3",
  gear: "M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4",
  brain: "M6 2.5a2.5 2.5 0 0 0-2.5 2.5c-1 .5-1.5 1.5-1.5 2.5 0 1.2.7 2.2 1.7 2.7-.1 1.7 1.2 3.3 3.3 3.3h2c2.1 0 3.4-1.6 3.3-3.3 1-.5 1.7-1.5 1.7-2.7 0-1-.5-2-1.5-2.5A2.5 2.5 0 0 0 10 2.5c-.8 0-1.5.3-2 .9-.5-.6-1.2-.9-2-.9zM8 3.4v10",
  target: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM8 4.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM8 7.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2z",
  rocket: "M8 1.8c2.5 1.5 3.5 4 3.5 6.5L13 10.5l-2.5.5-1 2.5-1.5-2h-0l-1.5 2-1-2.5L3 10.5l1.5-2.2C4.5 5.8 5.5 3.3 8 1.8zM8 6.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  compass: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM10.5 5.5L9 9 5.5 10.5 7 7z",
  box: "M2.5 5L8 2l5.5 3v6L8 14l-5.5-3zM2.5 5L8 8l5.5-3M8 8v6",
  folder: "M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z",
};
export function ProjIcon({ name, size = 13 }: { name: string; size?: number }) {
  const d = PROJ_ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function shortTime(value?: string): string {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return "";
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}j`;
  if (d < 30) return `${Math.floor(d / 7)}sem`;
  return `${Math.floor(d / 30)}mo`;
}

function relativeDate(value?: string): string {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("time.just-now");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("time.minutes-ago", { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("time.hours-ago", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time.yesterday");
  if (days < 7) return `${days} j`;
  return new Date(ts).toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

export default function Sidebar(p: {
  projects: string[];
  threads: Thread[];
  unread: Set<string>;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  threadOrder: "recent" | "manual";
  activeProject: string | null;
  activeId: string | null;
  onAddProject: () => void;
  onSelectProject: (root: string) => void;
  onSelect: (threadId: string, projectRoot: string) => void;
  onNew: (projectRoot: string) => void;
  onNewChat: () => void;
  onImportSession: (provider: "claude" | "codex", sessionId: string, title: string) => void;
  onDelete: (threadId: string) => void;
  onRemoveProject: (root: string) => void;
  onRename: (threadId: string, title: string) => void;
  onSettings: () => void;
  onCompact: () => void;
  projMeta: Record<string, { color?: string; label?: string }>;
  onSetMeta: (root: string, meta: { color?: string; label?: string }) => void;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selAnchor = useRef<string | null>(null);
  const [projMenu, setProjMenu] = useState<{ root: string; x: number; y: number } | null>(null);
  const [projActMenu, setProjActMenu] = useState<{ root: string; x: number; y: number } | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set());
  const PROJ_VISIBLE = 5;
  function toggleExpanded(root: string) {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(root)) next.delete(root);
      else next.add(root);
      return next;
    });
  }
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeProv, setResumeProv] = useState<"claude" | "codex">("claude");
  const [sessions, setSessions] = useState<{ id: string; title: string; mtime: number }[] | null>(null);

  useEffect(() => {
    const onSessions = (e: Event) => setSessions((e as CustomEvent).detail);
    window.addEventListener("sessions-list", onSessions);
    return () => window.removeEventListener("sessions-list", onSessions);
  }, []);

  useEffect(() => {
    const onOpenResume = (e: Event) => {
      const provider = (e as CustomEvent).detail?.provider === "codex" ? "codex" : "claude";
      openResume(provider);
    };
    window.addEventListener("atelier-open-resume", onOpenResume);
    return () => window.removeEventListener("atelier-open-resume", onOpenResume);
  }, [p.activeProject]);

  function openResume(prov: "claude" | "codex") {
    setResumeProv(prov);
    setSessions(null);
    setResumeOpen(true);
    wsSend({ type: "listSessions", provider: prov, projectRoot: p.activeProject ?? "" });
  }
  const [secClosed, setSecClosed] = useState<{ fav: boolean; proj: boolean; chats: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem("atelier-studio.sections") ?? '{"fav":false,"proj":false,"chats":false}'); }
    catch { return { fav: false, proj: false, chats: false }; }
  });
  function toggleSec(k: "fav" | "proj" | "chats") {
    setSecClosed((s) => {
      const n = { ...s, [k]: !s[k] };
      localStorage.setItem("atelier-studio.sections", JSON.stringify(n));
      return n;
    });
  }
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("atelier-studio.collapsed") ?? "[]");
    } catch {
      return [];
    }
  });

  function toggleCollapse(root: string) {
    setCollapsed((c) => {
      const next = c.includes(root) ? c.filter((r) => r !== root) : [...c, root];
      localStorage.setItem("atelier-studio.collapsed", JSON.stringify(next));
      return next;
    });
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = () => {
      setMenu(null);
      setProjMenu(null);
      setProjActMenu(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  function commitRename() {
    if (editingId && editText.trim()) p.onRename(editingId, editText.trim());
    setEditingId(null);
  }

  function startRename(t: Thread) {
    setEditText(rawThreadTitle(t));
    setEditingId(t.id);
  }

  // ordre visible des threads (favoris, puis projets, puis chats) pour la plage shift+clic
  function visibleThreadIds(): string[] {
    const ids: string[] = [];
    if (!secClosed.fav) {
      for (const id of p.favorites) if (p.threads.some((t) => t.id === id)) ids.push(id);
    }
    if (!secClosed.proj) {
      for (const root of p.projects) {
        if (collapsed.includes(root)) continue;
        const threads = p.threads
          .filter((t) => threadRoot(t) === root)
          .sort((a, b) =>
            p.threadOrder === "manual"
              ? ((a as any).createdAt ?? a.updatedAt ?? "").localeCompare((b as any).createdAt ?? b.updatedAt ?? "")
              : 0,
          );
        const shown = expandedRoots.has(root) ? threads : threads.slice(0, PROJ_VISIBLE);
        for (const t of shown) ids.push(t.id);
      }
    }
    if (!secClosed.chats) {
      for (const t of p.threads) if (!threadRoot(t)) ids.push(t.id);
    }
    return ids;
  }

  function handleThreadClick(e: React.MouseEvent, t: Thread, root: string) {
    if (e.shiftKey) {
      e.preventDefault();
      const ids = visibleThreadIds();
      const anchor = selAnchor.current && ids.includes(selAnchor.current) ? selAnchor.current : t.id;
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(t.id);
      const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
      setSelected((prev) => new Set([...prev, ...range]));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      selAnchor.current = t.id;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(t.id)) next.delete(t.id);
        else next.add(t.id);
        return next;
      });
      return;
    }
    selAnchor.current = t.id;
    if (selected.size) setSelected(new Set());
    p.onSelect(t.id, root);
  }

  async function deleteSelected(fallbackId: string) {
    const ids = selected.size ? [...selected] : [fallbackId];
    if (ids.length > 1) {
      const ok = await tauriConfirm(tr("sidebar.delete-many-confirm", { count: ids.length }), { kind: "warning" }).catch(() => true);
      if (!ok) return;
    }
    for (const id of ids) p.onDelete(id);
    setSelected(new Set());
    selAnchor.current = null;
  }

  useEffect(() => {
    if (!selected.size) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      if (e.key === "Escape") setSelected(new Set());
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void deleteSelected([...selected][0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function titleEditor(t: Thread) {
    return editingId === t.id ? (
      <input
        ref={editRef}
        className="rename"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") setEditingId(null);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    ) : (
      <span className="title" title={rawThreadTitle(t)}>{threadTitle(t)}</span>
    );
  }

  function threadLabel(t: Thread) {
    return (
      <span className="thread-copy" title={relativeDate(t.updatedAt)}>
        {titleEditor(t)}
      </span>
    );
  }

  return (
    <div className="sidebar">
      <div className="side-top" data-tauri-drag-region>
        <span className="flex" />
        <button className="mini compact-btn" title={t("action.collapse-sidebar")} onClick={p.onCompact}>
          <SidebarIcon size={17} />
        </button>
      </div>
      <div className="side-scroll">
      <div className="side-actions">
        <div className="item-action" onClick={p.onNewChat}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.5l2 2L6 12l-2.7.7L4 10z" />
          </svg>
          {t("action.new-chat")}
        </div>
        <div className="item-action" onClick={() => window.dispatchEvent(new CustomEvent("open-palette"))}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.4" /><path d="M10.4 10.4L14 14" />
          </svg>
          {t("sidebar.search")}
          <span className="item-kbd">⌘K</span>
        </div>
        <div className="item-action" onClick={() => openResume("claude")}>
          <ResumeIcon size={14} />
          {t("sidebar.resume-session")}
        </div>
      </div>
      {p.favorites.length > 0 && (
        <>
          <div className="section sec-toggle" onClick={() => toggleSec("fav")}>
            <span><span className="chev">{secClosed.fav ? "▸" : "▾"}</span> {t("sidebar.favorites")}</span>
          </div>
          <ul className="fav-list" style={{ display: secClosed.fav ? "none" : undefined }}>
            {p.favorites
              .map((id) => p.threads.find((t) => t.id === id))
              .filter((t): t is Thread => !!t)
              .map((t) => (
                <li
                  key={t.id}
                  className={`${t.id === p.activeId ? "active" : ""} ${selected.has(t.id) ? "multi-sel" : ""}`}
                  onClick={(e) => handleThreadClick(e, t, threadRoot(t))}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(t);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, threadId: t.id });
                  }}
                >
                  <span className="prov-ico"><ProviderIcon provider={t.provider} /></span>
                  {threadLabel(t)}
                  <span className="fav-star">★</span>
                </li>
              ))}
          </ul>
        </>
      )}
      <div className="section sec-toggle" onClick={() => toggleSec("proj")}>
        <span><span className="chev">{secClosed.proj ? "▸" : "▾"}</span> {t("sidebar.projects")}</span>
        <span className="section-actions" onClick={(e) => e.stopPropagation()}>
          <button className="mini compact-btn" title={t("action.add-project")} onClick={p.onAddProject}>
            <PlusIcon />
          </button>
        </span>
      </div>
      {!secClosed.proj && p.projects.map((root) => {
        const name = root.split("/").pop();
        const threads = p.threads
          .filter((t) => threadRoot(t) === root)
          .sort((a, b) =>
            p.threadOrder === "manual"
              ? ((a as any).createdAt ?? a.updatedAt ?? "").localeCompare((b as any).createdAt ?? b.updatedAt ?? "")
              : 0,
          );
        const active = root === p.activeProject;
        return (
          <div key={root} className="project">
            <div
              className={`project-name ${active ? "active" : ""}`}
              onClick={() => p.onSelectProject(root)}
              onDoubleClick={() => toggleCollapse(root)}
              onContextMenu={(e) => {
                e.preventDefault();
                setProjActMenu({ root, x: e.clientX, y: e.clientY });
              }}
              title={t("action.toggle-project")}
            >
              {p.projMeta[root]?.label?.startsWith("icon:") ? (
                <span className="proj-icon" style={p.projMeta[root]?.color ? { color: p.projMeta[root]!.color } : undefined}>
                  <ProjIcon name={p.projMeta[root]!.label!.slice(5)} />
                </span>
              ) : p.projMeta[root]?.label ? (
                <span className="proj-emoji">{p.projMeta[root]?.label}</span>
              ) : (
                <span
                  className="proj-dot"
                  style={{ background: p.projMeta[root]?.color ?? "var(--muted2)" }}
                />
              )}
              {name}
              <span className="proj-acts" onClick={(e) => e.stopPropagation()}>
                <button
                  className="proj-act"
                  title={tr("project.actions")}
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setProjActMenu(projActMenu?.root === root ? null : { root, x: r.left, y: r.bottom + 4 });
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="3.2" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="12.8" cy="8" r="1.2" />
                  </svg>
                </button>
                <button
                  className="proj-act"
                  title={t("action.new-chat")}
                  onClick={() => p.onNew(root)}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.5 8.5v4a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h4" />
                    <path d="M12.3 2.3l1.4 1.4L8 9.4l-2 .6.6-2z" />
                  </svg>
                </button>
              </span>
            </div>
            <ul style={{ display: collapsed.includes(root) ? "none" : undefined }}>
              {(expandedRoots.has(root) ? threads : threads.slice(0, PROJ_VISIBLE)).map((t) => (
                <li
                  key={t.id}
                  className={`proj-thread ${t.id === p.activeId ? "active" : ""} ${selected.has(t.id) ? "multi-sel" : ""}`}
                  onClick={(e) => handleThreadClick(e, t, root)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(t);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, threadId: t.id });
                  }}
                >
                  {p.unread.has(t.id) && <span className="unread-dot" />}
                  {threadLabel(t)}
                  {t.status === "running" ? (
                    <svg className="arc" width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="#3a414d" strokeWidth="2" />
                      <path d="M14 8a6 6 0 0 0-6-6" stroke="#e8823a" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span className="row-time">{shortTime(t.updatedAt)}</span>
                  )}
                  <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`row-act ${p.favorites.includes(t.id) ? "on" : ""}`}
                      title={p.favorites.includes(t.id) ? tr("action.remove-favorite") : tr("action.add-favorite")}
                      onClick={() => p.onToggleFavorite(t.id)}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill={p.favorites.includes(t.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2">
                        <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
                      </svg>
                    </button>
                    <button className="row-act danger" title={tr("action.delete")}
                      onClick={() => deleteSelected(t.id)}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </span>
                </li>
              ))}
              {threads.length > PROJ_VISIBLE && (
                <li className="proj-more" onClick={() => toggleExpanded(root)}>
                  {expandedRoots.has(root)
                    ? tr("sidebar.show-less")
                    : tr("sidebar.show-more", { count: threads.length - PROJ_VISIBLE })}
                </li>
              )}
            </ul>
          </div>
        );
      })}
      <div className="section sec-toggle" onClick={() => toggleSec("chats")}>
        <span><span className="chev">{secClosed.chats ? "▸" : "▾"}</span> {t("sidebar.chats")}</span>
        <span className="section-actions" onClick={(e) => e.stopPropagation()}>
          <button className="mini compact-btn" title={t("action.resume-session-existing")}
            onClick={() => openResume("claude")}>
            <ResumeIcon />
          </button>
          <button className="mini compact-btn" title={t("sidebar.new-chat-no-project")} onClick={p.onNewChat}>
            <PlusIcon />
          </button>
        </span>
      </div>
      {!secClosed.chats && (
        <ul className="fav-list">
          {withRecencySections(p.threads.filter((t) => !threadRoot(t))).map((row, index) => {
            if (row.kind === "section") {
              return (
                <li key={`${row.bucket}-${index}`} className="thread-recency-label" role="presentation">
                  {tr(recencyLabelKey(row.bucket))}
                </li>
              );
            }
            const t = row.thread;
            return (
              <li
                key={t.id}
                className={`${t.id === p.activeId ? "active" : ""} ${selected.has(t.id) ? "multi-sel" : ""}`}
                onClick={(e) => handleThreadClick(e, t, "")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(t);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, threadId: t.id });
                }}
              >
                <span className={`prov-ico ${t.status === "running" ? "busy" : ""}`}>
                  <ProviderIcon provider={t.provider} />
                  {p.unread.has(t.id) && <span className="unread-badge" />}
                </span>
                {threadLabel(t)}
              </li>
            );
          })}
        </ul>
      )}
      </div>
      <div className="side-foot">
        <button className="ghost foot-ib" title={t("action.settings")} onClick={p.onSettings}>
          <SettingsIcon size={14} />
        </button>
        <button className="ghost foot-ib usage-ib" title={t("usage.title")}
          onClick={() => window.dispatchEvent(new CustomEvent("usage-toggle"))}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
            <path d="M8 2a6 6 0 0 1 5.6 3.9" />
          </svg>
          <span className="usage-dot" id="usage-dot" />
        </button>
      </div>
      {resumeOpen && (
        <div className="rail-menu resume-pop" onClick={(e) => e.stopPropagation()}>
          <div className="rail-menu-title">{t("sidebar.resume-title")}</div>
          <div className="seg">
            {(["claude", "codex"] as const).map((pv) => (
              <button key={pv} className={resumeProv === pv ? "on" : ""} onClick={() => openResume(pv)}>
                {pv === "claude" ? "Claude" : "Codex"}
              </button>
            ))}
          </div>
          <div className="resume-list">
            {sessions === null && <div className="bh-empty">{t("sidebar.loading")}</div>}
            {sessions?.length === 0 && <div className="bh-empty">{t("sidebar.no-session")}</div>}
            {sessions?.map((s) => (
              <div key={s.id} className="resume-item"
                onClick={() => {
                  p.onImportSession(resumeProv, s.id, s.title);
                  setResumeOpen(false);
                }}>
                <span className="resume-title">{s.title}</span>
                <span className="resume-date">
                  {new Date(s.mtime).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}{" "}
                  {new Date(s.mtime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
          <button className="set-btn" onClick={() => setResumeOpen(false)}>{t("sidebar.close")}</button>
        </div>
      )}
      {projActMenu && (
        <div className="pmenu" style={{ left: projActMenu.x, top: projActMenu.y, position: "fixed" }}
          onClick={(e) => e.stopPropagation()}>
          <button className="pmenu-item" onClick={() => { p.onNew(projActMenu.root); setProjActMenu(null); }}>
            <svg viewBox="0 0 16 16"><path d="M13.5 8.5v4a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h4" /><path d="M12.3 2.3l1.4 1.4L8 9.4l-2 .6.6-2z" /></svg>
            {t("action.new-chat")}
          </button>
          <button className="pmenu-item" onClick={() => {
            const root = projActMenu.root;
            revealItemInDir(root).catch(() => openUrl("file://" + root).catch(() => {}));
            setProjActMenu(null);
          }}>
            <svg viewBox="0 0 16 16"><path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z" /></svg>
            {tr("project.reveal-finder")}
          </button>
          <button className="pmenu-item" onClick={() => {
            setProjMenu({ root: projActMenu.root, x: projActMenu.x, y: projActMenu.y });
            setProjActMenu(null);
          }}>
            <svg viewBox="0 0 16 16"><path d="M8 1.8a6.2 6.2 0 1 0 0 12.4c1 0 1.4-.6 1.4-1.3 0-.6-.4-1-.4-1.6 0-.8.6-1.3 1.5-1.3h1.2c1.4 0 2.5-1.1 2.5-2.4C14.2 4.2 11.4 1.8 8 1.8z" /><circle cx="5" cy="6" r=".7" /><circle cx="8.2" cy="4.6" r=".7" /><circle cx="11" cy="6.4" r=".7" /></svg>
            {tr("project.customize")}
          </button>
          <button className="pmenu-item" onClick={() => { toggleCollapse(projActMenu.root); setProjActMenu(null); }}>
            <svg viewBox="0 0 16 16"><path d="M4 6.5L8 10l4-3.5" /></svg>
            {collapsed.includes(projActMenu.root) ? tr("project.expand") : tr("project.collapse")}
          </button>
          <div className="pmenu-sep" />
          <button className="pmenu-item danger" onClick={() => { p.onRemoveProject(projActMenu.root); setProjActMenu(null); }}>
            <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
            {tr("project.remove")}
          </button>
        </div>
      )}
      {projMenu && (
        <div
          className="rail-menu"
          style={{ left: projMenu.x, top: projMenu.y, position: "fixed" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rail-menu-title">{projMenu.root.split("/").pop()}</div>
          <div className="swatches">
            {PROJ_COLORS.map((c) => (
              <span
                key={c}
                className="swatch"
                style={{ background: c }}
                onClick={() =>
                  p.onSetMeta(projMenu.root, { ...p.projMeta[projMenu.root], color: c })
                }
              />
            ))}
            <span
              className="swatch none"
              title={t("sidebar.without-color")}
              onClick={() =>
                p.onSetMeta(projMenu.root, { ...p.projMeta[projMenu.root], color: undefined })
              }
            >
              ∅
            </span>
          </div>
          <div className="emoji-grid">
            {Object.keys(PROJ_ICONS).map((name) => (
              <span
                key={name}
                className={`emoji-cell ${p.projMeta[projMenu.root]?.label === "icon:" + name ? "on" : ""}`}
                onClick={() => {
                  p.onSetMeta(projMenu.root, { ...p.projMeta[projMenu.root], label: "icon:" + name });
                  setProjMenu(null);
                }}
              >
                <ProjIcon name={name} size={14} />
              </span>
            ))}
            <input
              className="icon-letter"
              placeholder="Aa"
              maxLength={2}
              defaultValue={p.projMeta[projMenu.root]?.label?.startsWith("icon:") ? "" : p.projMeta[projMenu.root]?.label ?? ""}
              title={t("sidebar.letter-title")}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  p.onSetMeta(projMenu.root, { ...p.projMeta[projMenu.root], label: v || undefined });
                  setProjMenu(null);
                }
              }}
            />
            <span
              className="emoji-cell none"
              title={t("sidebar.without-color")}
              onClick={() => {
                p.onSetMeta(projMenu.root, { ...p.projMeta[projMenu.root], label: undefined });
                setProjMenu(null);
              }}
            >
              ∅
            </span>
          </div>
        </div>
      )}
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
          <div
            onClick={() => {
              const t = p.threads.find((x) => x.id === menu.threadId);
              setEditText(t ? rawThreadTitle(t) : "");
              setEditingId(menu.threadId);
              setMenu(null);
            }}
          >
            {t("action.rename")}
          </div>
          <div
            onClick={() => {
              p.onToggleFavorite(menu.threadId);
              setMenu(null);
            }}
          >
            {p.favorites.includes(menu.threadId) ? t("action.remove-favorite") : t("action.add-favorite")}
          </div>
          <div
            onClick={() => {
              const t = p.threads.find((x) => x.id === menu.threadId);
              if (t?.sessionId) {
                const cmd =
                  t.provider === "codex"
                    ? `codex resume ${t.sessionId}`
                    : `cd ${JSON.stringify(t.projectRoot || "~")} && claude --resume ${t.sessionId}`;
                navigator.clipboard.writeText(cmd);
              }
              setMenu(null);
            }}
          >
            {t("action.copy-resume")}
          </div>
          <div
            className="danger"
            onClick={() => {
              deleteSelected(menu.threadId);
              setMenu(null);
            }}
          >
            {selected.size > 1 && selected.has(menu.threadId)
              ? tr("sidebar.delete-many", { count: selected.size })
              : t("action.delete")}
          </div>
        </div>
      )}
    </div>
  );
}
