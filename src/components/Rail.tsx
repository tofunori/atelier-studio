import { useState } from "react";
import { t } from "../lib/i18n";
import { PlusIcon, SettingsIcon, SidebarIcon } from "./icons";
import { ProjIcon, threadTitle, recencyLabelKey, withRecencySections } from "./Sidebar";
import { ProviderIcon } from "./icons";
import type { Thread } from "../lib/ws";

export type ProjMeta = { color?: string; label?: string };

export const PROJ_COLORS = [
  "#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6",
  "#22b07d", "#e0b74a", "#64748b", "#ec4899",
];

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
  onSelectThread: (id: string) => void;
  onSelectProject: (root: string) => void;
  onAddProject: () => void;
  onExpand: () => void;
  onSettings: () => void;
  onSetMeta: (root: string, meta: ProjMeta) => void;
}) {
  const [menu, setMenu] = useState<{ root: string; y: number } | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [fly, setFly] = useState<string | null>(null);   // projet dont le flyout est ouvert
  const [pinned, setPinned] = useState(false);
  const hoverT = { current: 0 } as { current: number };
  const openOnHover = (root: string) => {
    if (pinned) return;
    window.clearTimeout(hoverT.current);
    hoverT.current = window.setTimeout(() => setFly(root), 250);
  };
  const cancelHover = () => window.clearTimeout(hoverT.current);

  return (
    <div className="rail" onClick={() => setMenu(null)}>
      <button className="rail-btn" title={t("action.expand-sidebar")} onClick={p.onExpand}>
        <SidebarIcon />
      </button>
      {p.projects.map((root) => {
        const m = p.meta[root];
        const active = root === p.activeProject;
        return (
          <button
            key={root}
            className={`rail-proj ${active ? "on" : ""}`}
            style={{ "--proj-c": m?.color ?? "transparent" } as React.CSSProperties}
            title={root.split("/").pop()}
            onClick={() => {
              cancelHover();
              p.onSelectProject(root);
              setFly(fly === root && !pinned ? null : root);
            }}
            onMouseEnter={() => openOnHover(root)}
            onMouseLeave={cancelHover}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLabelDraft(m?.label ?? "");
              setMenu({ root, y: e.clientY });
            }}
          >
            {m?.label?.startsWith("icon:") ? <ProjIcon name={m.label.slice(5)} size={14} /> : projInitial(root, m)}
            {p.running.has(root) && <span className="rail-dot" />}
          </button>
        );
      })}
      <button className="rail-btn" title={t("action.add-project")} onClick={p.onAddProject}>
        <PlusIcon />
      </button>
      <span className="flex" />
      <button className="rail-btn" title={t("action.settings")} onClick={p.onSettings}>
        <SettingsIcon />
      </button>
      {fly && (
        <>
          {!pinned && <div className="fly-backdrop" onClick={() => setFly(null)} />}
          <div className="rail-flyout" onClick={(e) => e.stopPropagation()}>
            <div className="fly-head">
              <span className="fly-name">{(p.meta[fly]?.label?.startsWith("icon:") ? null : p.meta[fly]?.label) || fly.split("/").pop()}</span>
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
                ) : (
                  <button key={row.thread.id}
                    className={`fly-chat ${row.thread.id === p.activeId ? "on" : ""}`}
                    onClick={() => { p.onSelectThread(row.thread.id); if (!pinned) setFly(null); }}>
                    <ProviderIcon provider={row.thread.provider} size={11} />
                    <span className="fly-title">{threadTitle(row.thread)}</span>
                    {p.unread.has(row.thread.id) && <span className="unread-badge" />}
                  </button>
                ))}
              {!p.threads.some((th) => th.projectRoot === fly) && (
                <div className="fly-empty">{t("rail.no-chats")}</div>
              )}
            </div>
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
          <input
            placeholder={t("sidebar.label-placeholder")}
            value={labelDraft}
            maxLength={2}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                p.onSetMeta(menu.root, {
                  ...p.meta[menu.root],
                  label: labelDraft || undefined,
                });
                setMenu(null);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
