import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { ChatsIcon, HighlighterIcon, PlusIcon, SettingsIcon, SidebarIcon } from "./icons";
import { PROJ_ICONS, ProjIcon, threadTitle, rawThreadTitle, recencyLabelKey, withRecencySections, moveThreadTo } from "./Sidebar";
import { ProviderIcon } from "./icons";
import WindowControls from "./WindowControls";
import type { Thread } from "../lib/ws";
import type { ViewId } from "../lib/settings";

export type ProjMeta = { color?: string; label?: string };

// fiche « Surlignés » (lot 2) : photographie autonome — cf. sidecar/highlights.mjs
export type HighlightEntry = {
  id: string;
  text: string;
  context: string;
  kind: "hl" | "ul";
  projectRoot: string;
  projectName: string;
  threadId: string;
  threadTitle: string;
  provider: string;
  createdAt: string;
};

export const PROJ_COLORS = [
  "#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6",
  "#22b07d", "#e0b74a", "#64748b", "#ec4899",
];

// clé sentinelle du flyout survolé sur l'icône Surlignés (partage le même
// état `fly` que les projets — pas un mécanisme parallèle)
const HIGHLIGHTS_FLY = "__highlights__";

export function projInitial(root: string, meta?: ProjMeta) {
  // les labels « icon:* » sont des icônes (rendues à part) — jamais du texte
  if (meta?.label && !meta.label.startsWith("icon:")) return meta.label.slice(0, 2);
  const name = root.split("/").pop() ?? "?";
  return name.charAt(0).toUpperCase();
}

export default function Rail(p: {
  projects: string[];
  activeProject: string | null;
  meta: Record<string, ProjMeta>;
  running: Set<string>;
  threads: Thread[];
  activeId: string | null;
  unread: Set<string>;
  activeView: ViewId;
  highlights: HighlightEntry[];
  onSelectView: (view: ViewId) => void;
  onSelectThread: (id: string) => void;
  onSelectProject: (root: string) => void;
  onAddProject: () => void;
  onNew: (projectRoot: string) => void;
  onExpand: () => void;
  onSettings: () => void;
  onSetMeta: (root: string, meta: ProjMeta) => void;
  onReorder: (from: string, to: string) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onRenameThread: (id: string, title: string) => void;
}) {
  const [menu, setMenu] = useState<{ root: string; y: number } | null>(null);
  const [dragRoot, setDragRoot] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [chatMenu, setChatMenu] = useState<{ id: string; x: number; y: number; mode?: "main" | "move" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [fly, setFly] = useState<string | null>(null);   // projet dont le flyout est ouvert
  const [pinned, setPinned] = useState(false);
  const hoverT = { current: 0 } as { current: number };
  const openOnHover = (root: string) => {
    if (pinned) return;
    window.clearTimeout(hoverT.current);
    // un flyout déjà ouvert ? bascule immédiate (navigation entre projets)
    if (fly) { setFly(root); return; }
    hoverT.current = window.setTimeout(() => setFly(root), 250);
  };
  const cancelHover = () => window.clearTimeout(hoverT.current);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setChatMenu(null); setFly(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="rail" onClick={() => setMenu(null)}>
      {/* sommet du rail : feux custom + zone de drag (décorations natives
          coupées) → rail étroit collé tout en haut, aucune bande de titre */}
      <div className="rail-titlebar" data-tauri-drag-region>
        <WindowControls />
      </div>
      <button className="rail-btn" title={t("action.expand-sidebar")} onClick={p.onExpand}>
        <SidebarIcon size={19} />
      </button>
      <button className="rail-btn" title={t("action.new-chat")}
        onClick={() => p.onNew(p.activeProject ?? "")}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="0.95" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.5 8.5v4a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h4" />
          <path d="M12.3 2.3l1.4 1.4L8 9.4l-2 .6.6-2z" />
        </svg>
      </button>
      <div className="rail-views">
        <button className={`rail-view ${p.activeView === "chats" ? "on" : ""}`}
          title={t("view.chats")} onClick={() => p.onSelectView("chats")}>
          <ChatsIcon size={19} />
        </button>
        <button className={`rail-view ${p.activeView === "highlights" ? "on" : ""}`}
          title={t("view.highlights")} onClick={() => p.onSelectView("highlights")}
          onMouseEnter={() => openOnHover(HIGHLIGHTS_FLY)} onMouseLeave={cancelHover}>
          <HighlighterIcon size={19} />
        </button>
      </div>
      <div className="rail-sep" />
      {p.projects.map((root) => {
        const m = p.meta[root];
        const active = root === p.activeProject;
        return (
          <button
            key={root}
            className={`rail-proj ${active ? "on" : ""} ${dragOver === root && dragRoot !== root ? "drag-over" : ""}`}
            style={{ "--proj-c": m?.color ?? "transparent" } as React.CSSProperties}
            title={root.split("/").pop()}
            draggable
            onDragStart={(e) => {
              cancelHover();
              setFly(null);
              setDragRoot(root);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!dragRoot || dragRoot === root) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver(root);
            }}
            onDragLeave={() => setDragOver((v) => (v === root ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragRoot && dragRoot !== root) p.onReorder(dragRoot, root);
              setDragRoot(null);
              setDragOver(null);
            }}
            onDragEnd={() => { setDragRoot(null); setDragOver(null); }}
            onClick={() => {
              cancelHover();
              p.onSelectProject(root);
              setFly(root); // le clic ne ferme jamais — fermeture: choix d'un chat, clic dehors, Échap
            }}
            onMouseEnter={() => openOnHover(root)}
            onMouseLeave={cancelHover}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLabelDraft(m?.label?.startsWith("icon:") ? "" : m?.label ?? "");
              setMenu({ root, y: e.clientY });
            }}
          >
            {m?.label?.startsWith("icon:") ? <ProjIcon name={m.label.slice(5)} size={18} /> : projInitial(root, m)}
            {p.running.has(root) && <span className="rail-dot" />}
          </button>
        );
      })}
      <button className="rail-btn" title={t("action.add-project")} onClick={p.onAddProject}>
        <PlusIcon size={19} />
      </button>
      <span className="flex" />
      <button className="rail-btn" title={t("action.settings")} onClick={p.onSettings}>
        <SettingsIcon size={19} />
      </button>
      {fly && (
        <>
          {!pinned && <div className="fly-backdrop" onClick={() => setFly(null)} />}
          <div className="rail-flyout" onClick={(e) => { e.stopPropagation(); setChatMenu(null); }}>
            {fly === HIGHLIGHTS_FLY ? (
              <>
                <div className="fly-head">
                  <span className="fly-name">{t("view.highlights")}</span>
                  <button className="fly-pin" title={t("action.expand-sidebar")} onClick={() => { setFly(null); p.onExpand(); }}>
                    <SidebarIcon />
                  </button>
                </div>
                <div className="fly-list">
                  {p.highlights.slice(0, 8).map((h) => (
                    <button key={h.id} className="fly-hl-item"
                      onClick={() => { p.onSelectView("highlights"); if (!pinned) setFly(null); }}>
                      <span className="fly-hl-text">{h.text}</span>
                      <span className="fly-hl-proj">{h.projectName || t("highlights.no-project")}</span>
                    </button>
                  ))}
                  {!p.highlights.length && (
                    <div className="fly-empty">{t("rail.no-highlights")}</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="fly-head">
                  <span className="fly-name">{(p.meta[fly]?.label?.startsWith("icon:") ? null : p.meta[fly]?.label) || fly.split("/").pop()}</span>
                  <button className="fly-pin" title={t("action.new-chat")}
                    onClick={() => { p.onNew(fly); if (!pinned) setFly(null); }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13.5 8.5v4a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h4" />
                      <path d="M12.3 2.3l1.4 1.4L8 9.4l-2 .6.6-2z" />
                    </svg>
                  </button>
                  <button className={`fly-pin ${pinned ? "on" : ""}`} title={pinned ? t("rail.unpin") : t("rail.pin")}
                    onClick={() => setPinned((v) => !v)}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2l4.5 4.5-2.4.6-2.6 4.4-1.5-1.5L3 14.5 6 10l-1.5-1.5L8.9 5.9z"/></svg>
                  </button>
                  <button className="fly-pin" title={t("action.expand-sidebar")} onClick={() => { setFly(null); p.onExpand(); }}>
                    <SidebarIcon />
                  </button>
                </div>
                <div className="fly-list">
                  {withRecencySections(p.threads.filter((th) => th.projectRoot === fly)).map((row, i) =>
                    row.kind === "section" ? (
                      <div key={`s${i}`} className="fly-sect">{t(recencyLabelKey(row.bucket) as any)}</div>
                    ) : editingId === row.thread.id ? (
                      <input key={row.thread.id} className="fly-rename" autoFocus value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={() => {
                          if (editText.trim()) p.onRenameThread(row.thread.id, editText.trim());
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                          if (e.key === "Escape") { e.stopPropagation(); setEditingId(null); }
                        }} />
                    ) : (
                      <button key={row.thread.id}
                        className={`fly-chat ${row.thread.id === p.activeId ? "on" : ""}`}
                        onClick={() => { p.onSelectThread(row.thread.id); if (!pinned) setFly(null); }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setChatMenu({ id: row.thread.id, x: e.clientX, y: e.clientY });
                        }}>
                        <ProviderIcon provider={row.thread.provider} size={11} />
                        <span className="fly-title">{threadTitle(row.thread)}</span>
                        {p.unread.has(row.thread.id) && <span className="unread-badge" />}
                      </button>
                    ))}
                  {!p.threads.some((th) => th.projectRoot === fly) && (
                    <div className="fly-empty">{t("rail.no-chats")}</div>
                  )}
                </div>
                {chatMenu && chatMenu.mode === "move" && (
                  <div className="ctx-menu" style={{ left: chatMenu.x, top: chatMenu.y }} onClick={(e) => e.stopPropagation()}>
                    <div className="ctx-menu-back" onClick={() => setChatMenu({ ...chatMenu, mode: "main" })}>
                      ‹ {t("thread.move")}
                    </div>
                    {p.projects
                      .filter((root) => root !== (p.threads.find((x) => x.id === chatMenu.id)?.projectRoot ?? ""))
                      .map((root) => (
                        <div key={root} onClick={() =>
                          moveThreadTo(p.threads.find((x) => x.id === chatMenu.id), root, () => setChatMenu(null))
                        }>
                          {root.split("/").pop()}
                        </div>
                      ))}
                  </div>
                )}
                {chatMenu && chatMenu.mode !== "move" && (
                  <div className="ctx-menu" style={{ left: chatMenu.x, top: chatMenu.y }} onClick={(e) => e.stopPropagation()}>
                    <div onClick={() => {
                      const th = p.threads.find((x) => x.id === chatMenu.id);
                      setEditText(th ? rawThreadTitle(th) : "");
                      setEditingId(chatMenu.id);
                      setChatMenu(null);
                    }}>
                      {t("action.rename")}
                    </div>
                    <div onClick={() => { p.onToggleFavorite(chatMenu.id); setChatMenu(null); }}>
                      {p.favorites.includes(chatMenu.id) ? t("action.remove-favorite") : t("action.add-favorite")}
                    </div>
                    <div onClick={() => {
                      const th = p.threads.find((x) => x.id === chatMenu.id);
                      if (th?.sessionId) {
                        const cmd = th.provider === "codex"
                          ? `codex resume ${th.sessionId}`
                          : `cd ${JSON.stringify(th.projectRoot || "~")} && claude --resume ${th.sessionId}`;
                        navigator.clipboard.writeText(cmd);
                      }
                      setChatMenu(null);
                    }}>
                      {t("action.copy-resume")}
                    </div>
                    {p.projects.some((root) => root !== (p.threads.find((x) => x.id === chatMenu.id)?.projectRoot ?? "")) && (
                      <div onClick={() => setChatMenu({ ...chatMenu, mode: "move" })}>
                        {t("thread.move")}
                      </div>
                    )}
                    <div className="danger" onClick={() => { p.onDeleteThread(chatMenu.id); setChatMenu(null); }}>
                      {t("action.delete")}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      {menu && (
        <div className="rail-menu" style={{ top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div className="rail-menu-title">{menu.root.split("/").pop()}</div>
          <div className="swatches">
            {PROJ_COLORS.map((c) => (
              <span
                key={c}
                className="swatch"
                style={{ background: c }}
                onClick={() => p.onSetMeta(menu.root, { ...p.meta[menu.root], color: c })}
              />
            ))}
            <span
              className="swatch none"
              title={t("sidebar.without-color")}
              onClick={() => p.onSetMeta(menu.root, { ...p.meta[menu.root], color: undefined })}
            >
              ∅
            </span>
          </div>
          <div className="emoji-grid">
            {Object.keys(PROJ_ICONS).map((name) => (
              <span key={name}
                className={`emoji-cell ${p.meta[menu.root]?.label === "icon:" + name ? "on" : ""}`}
                onClick={() => { p.onSetMeta(menu.root, { ...p.meta[menu.root], label: "icon:" + name }); setMenu(null); }}>
                <ProjIcon name={name} size={14} />
              </span>
            ))}
          </div>
          <input
            className="icon-letter"
            placeholder="Aa"
            maxLength={2}
            value={labelDraft}
            title={t("sidebar.letter-title")}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                p.onSetMeta(menu.root, { ...p.meta[menu.root], label: labelDraft || undefined });
                setMenu(null);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
