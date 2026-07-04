import { useEffect, useRef, useState } from "react";
import { Thread } from "../lib/ws";
import { PROJ_COLORS } from "./Rail";

type Menu = { x: number; y: number; threadId: string };

export default function Sidebar(p: {
  projects: string[];
  threads: Thread[];
  unread: Set<string>;
  threadOrder: "recent" | "manual";
  activeProject: string | null;
  activeId: string | null;
  onAddProject: () => void;
  onSelectProject: (root: string) => void;
  onSelect: (threadId: string, projectRoot: string) => void;
  onNew: (projectRoot: string) => void;
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

  return (
    <div className="sidebar">
      <div className="section">
        Projets
        <span className="section-actions">
          <button className="mini compact-btn" title="Ajouter un projet" onClick={p.onAddProject}>
            +
          </button>
          <button className="mini compact-btn" title="Barre compacte" onClick={p.onCompact}>
            «
          </button>
        </span>
      </div>
      {p.projects.map((root) => {
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
              title="Double-clic : replier/déplier — clic droit : couleur/icône"
            >
              <span className="chev">{collapsed.includes(root) ? "▸" : "▾"}</span>
              <span
                className="proj-badge"
                style={{ background: p.projMeta[root]?.color ?? "#2c313a" }}
              >
                {p.projMeta[root]?.label ?? (name?.charAt(0).toUpperCase() || "?")}
              </span>
              {name}
              {active && (
                <button
                  className="mini"
                  title="Nouveau chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onNew(root);
                  }}
                >
                  +
                </button>
              )}
            </div>
            <ul style={{ display: collapsed.includes(root) ? "none" : undefined }}>
              {threads.map((t) => (
                <li
                  key={t.id}
                  className={t.id === p.activeId ? "active" : ""}
                  onClick={() => p.onSelect(t.id, root)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, threadId: t.id });
                  }}
                >
                  <span className={`dot ${t.provider} ${p.unread.has(t.id) ? "unread" : ""} ${t.status === "running" ? "busy" : ""}`} />
                  {editingId === t.id ? (
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
                    <span className="title">{t.title}</span>
                  )}
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
      <span className="side-flex" />
      <button className="settings-btn" title="Réglages" onClick={p.onSettings}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="8" cy="8" r="2.6" />
          <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
        </svg>
        <span>Réglages</span>
      </button>
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
              title="Sans couleur"
              onClick={() =>
                p.onSetMeta(projMenu.root, { ...p.projMeta[projMenu.root], color: undefined })
              }
            >
              ∅
            </span>
          </div>
          <input
            placeholder="Lettre ou emoji (ex. 🧊)"
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
            Renommer
          </div>
          <div
            className="danger"
            onClick={() => {
              p.onDelete(menu.threadId);
              setMenu(null);
            }}
          >
            Supprimer
          </div>
        </div>
      )}
    </div>
  );
}
