import { useEffect, useRef, useState } from "react";
import { Thread } from "../lib/ws";

type Menu = { x: number; y: number; threadId: string };

export default function Sidebar(p: {
  projects: string[];
  threads: Thread[];
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
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
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
    const close = () => setMenu(null);
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
        <button className="mini compact-btn" title="Barre compacte" onClick={p.onCompact}>
          «
        </button>
      </div>
      {p.projects.map((root) => {
        const name = root.split("/").pop();
        const threads = p.threads.filter((t) => t.projectRoot === root);
        const active = root === p.activeProject;
        return (
          <div key={root} className="project">
            <div
              className={`project-name ${active ? "active" : ""}`}
              onClick={() => p.onSelectProject(root)}
              onDoubleClick={() => toggleCollapse(root)}
              title="Double-clic : replier/déplier les chats"
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
                  <span className={`dot ${t.provider}`} />
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
                  {t.status === "running" && <span className="spinner">⟳</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <button onClick={p.onAddProject}>+ Ajouter un projet…</button>
      <span className="side-flex" />
      <button className="settings-btn" title="Réglages" onClick={p.onSettings}>
        ⚙ Réglages
      </button>
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
            ✏️ Renommer
          </div>
          <div
            className="danger"
            onClick={() => {
              p.onDelete(menu.threadId);
              setMenu(null);
            }}
          >
            🗑 Supprimer
          </div>
        </div>
      )}
    </div>
  );
}
