import { useEffect, useRef, useState } from "react";
import { Thread } from "../lib/ws";
import { PROJ_COLORS } from "./Rail";
import { wsSend } from "../lib/wsBus";
import { t } from "../lib/i18n";
const tr = t; // alias : t est masqué par les threads dans les .map
import { PlusIcon, ProviderIcon, ResumeIcon, SettingsIcon, SidebarIcon } from "./icons";

type Menu = { x: number; y: number; threadId: string };

// titre lisible : un titre qui est un chemin absolu devient "…/nom-de-fichier"
function niceTitle(t: string): string {
  const m = /^(\/[\w~. -]+(?:\/[\w~. -]+)+)([\s\S]*)$/.exec(t.trim());
  if (!m) return t;
  const base = m[1].split("/").filter(Boolean).pop() ?? m[1];
  const rest = m[2].trim();
  return rest ? `${base} — ${rest.slice(0, 40)}` : base;
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
  onRename: (threadId: string, title: string) => void;
  onSettings: () => void;
  onCompact: () => void;
  projMeta: Record<string, { color?: string; label?: string }>;
  onSetMeta: (root: string, meta: { color?: string; label?: string }) => void;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [projMenu, setProjMenu] = useState<{ root: string; x: number; y: number } | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
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
    setEditText(t.title);
    setEditingId(t.id);
  }

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
      <span className="title" title={t.title}>{niceTitle(t.title)}</span>
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
      <div className="side-top">
        <span className="flex" />
        <button className="mini compact-btn" title={t("action.collapse-sidebar")} onClick={p.onCompact}>
          <SidebarIcon />
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
                  className={t.id === p.activeId ? "active" : ""}
                  onClick={() => p.onSelect(t.id, t.projectRoot)}
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
          .filter((t) => t.projectRoot === root)
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
                setLabelDraft(p.projMeta[root]?.label ?? "");
                setProjMenu({ root, x: e.clientX, y: e.clientY });
              }}
              title={t("action.toggle-project")}
            >
              <span className="chev">{collapsed.includes(root) ? "▸" : "▾"}</span>
              <span
                className="proj-dot"
                style={{ background: p.projMeta[root]?.color ?? "var(--muted2)" }}
              />
              {name}
              {active && (
                <button
                  className="mini"
                  title={t("action.new-chat")}
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onNew(root);
                  }}
                >
                  <PlusIcon />
                </button>
              )}
            </div>
            <ul style={{ display: collapsed.includes(root) ? "none" : undefined }}>
              {threads.map((t) => (
                <li
                  key={t.id}
                  className={t.id === p.activeId ? "active" : ""}
                  onClick={() => p.onSelect(t.id, root)}
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
                      onClick={() => p.onDelete(t.id)}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </span>
                  {t.status === "running" && (
                    <svg className="arc" width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="#3a414d" strokeWidth="2" />
                      <path d="M14 8a6 6 0 0 0-6-6" stroke="#e8823a" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </li>
              ))}
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
          {p.threads
            .filter((t) => !t.projectRoot)
            .map((t) => (
              <li
                key={t.id}
                className={t.id === p.activeId ? "active" : ""}
                onClick={() => p.onSelect(t.id, "")}
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
            ))}
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
          <input
            placeholder={t("sidebar.label-placeholder")}
            value={labelDraft}
            maxLength={2}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                p.onSetMeta(projMenu.root, {
                  ...p.projMeta[projMenu.root],
                  label: labelDraft || undefined,
                });
                setProjMenu(null);
              }
            }}
          />
        </div>
      )}
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
          <div
            onClick={() => {
              const t = p.threads.find((x) => x.id === menu.threadId);
              setEditText(t?.title ?? "");
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
              p.onDelete(menu.threadId);
              setMenu(null);
            }}
          >
            {t("action.delete")}
          </div>
        </div>
      )}
    </div>
  );
}
