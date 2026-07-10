import { useState } from "react";
import { t } from "../lib/i18n";
import { ChatsIcon, HighlighterIcon, PlusIcon, SettingsIcon, SidebarIcon } from "./icons";
import { ProjIcon } from "./sidebar/projectIcons";
import { ProjectStyleMenu } from "./sidebar/ProjectStyleMenu";
import { SURFACES, type Surface } from "./surfaces";
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
  activeView: ViewId;
  compact: boolean;
  layout: "split" | "chat" | "atelier";
  activeSurface: Surface;
  onSelectSurface: (surface: Surface) => void;
  onSelectGallery: () => void;
  onSelectIde: () => void;
  ideActive: boolean;
  showExplorer: boolean;
  onToggleExplorer: () => void;
  onSelectView: (view: ViewId) => void;
  onSelectProject: (root: string) => void;
  onAddProject: () => void;
  onExpand: () => void;
  onSettings: () => void;
  onSetMeta: (root: string, meta: ProjMeta) => void;
  onReorder: (from: string, to: string) => void;
}) {
  const [menu, setMenu] = useState<{ root: string; y: number } | null>(null);
  const [dragRoot, setDragRoot] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <div className="rail" onClick={() => setMenu(null)}>
      {/* zone scrollable : tout sauf Réglages (épinglé en bas) */}
      <div className="rail-scroll">
      <button className={`rail-btn ${!p.compact ? "on" : ""}`}
        title={p.compact ? t("action.expand-sidebar") : t("action.collapse-sidebar")} onClick={p.onExpand}>
        <SidebarIcon size={19} />
      </button>
      <div className="rail-views">
        <button className={`rail-view ${p.activeView === "chats" ? "on" : ""}`}
          title={t("view.chats")} onClick={() => p.onSelectView("chats")}>
          <ChatsIcon size={19} />
        </button>
        <button className={`rail-view ${p.activeView === "highlights" ? "on" : ""}`}
          title={t("view.highlights")} onClick={() => p.onSelectView("highlights")}>
          <HighlighterIcon size={19} />
        </button>
      </div>
      <div className="rail-sep" />
      {/* activity bar : surfaces de travail — clic bascule via switchSurface
          (câblé côté App), icône active reflète l'état SI l'atelier est
          visible (layout ≠ "chat") */}
      <div className="rail-views">
        {/* IDE : revient direct à la vue éditeur/PDF (fichiers ouverts) */}
        <button className={`rail-view ${p.ideActive ? "on" : ""}`}
          title="IDE — éditeurs & fichiers ouverts" onClick={p.onSelectIde}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.5 5 3 8l2.5 3M10.5 5 13 8l-2.5 3M8.8 3.5 7.2 12.5" />
          </svg>
        </button>
        {/* Git et Explorateur sont montés dans la TopBar → exclus du rail */}
        {SURFACES.filter((s) => s.id !== "git").map((s) => (
          <button
            key={s.id}
            /* Galerie (surface "atelier") n'est active que sur l'onglet gallery,
               pas quand un fichier est ouvert (là c'est l'IDE qui est actif) */
            className={`rail-view ${p.layout !== "chat" && p.activeSurface === s.id && !(s.id === "atelier" && p.ideActive) ? "on" : ""}`}
            title={t(s.labelKey)}
            /* Galerie (atelier) : revient à l'onglet galerie même si un fichier
               est ouvert (IDE) — sinon on resterait bloqué sur le fichier */
            onClick={() => (s.id === "atelier" ? p.onSelectGallery() : p.onSelectSurface(s.id))}
          >
            {s.icon}
          </button>
        ))}
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
            onClick={() => p.onSelectProject(root)}
            /* double-clic : bascule le panneau fixe — en compact, l'ouvre sur
               les chats du projet (remplace l'ancien flyout) ; sinon le replie */
            onDoubleClick={() => {
              if (p.compact) p.onSelectView("chats");
              p.onExpand();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
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
      </div>{/* fin rail-scroll */}
      {/* zone épinglée : Réglages toujours visible en bas, jamais scrollé */}
      <div className="rail-pinned">
        <button className="rail-btn usage-ib" title={t("usage.title")}
          onClick={() => window.dispatchEvent(new CustomEvent("usage-toggle"))}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
            <path d="M8 2a6 6 0 0 1 5.6 3.9" />
          </svg>
          <span className="usage-dot" id="usage-dot" />
        </button>
        <button className="rail-btn" title={t("action.settings")} onClick={p.onSettings}>
          <SettingsIcon size={19} />
        </button>
      </div>
      {menu && (
        <ProjectStyleMenu
          key={menu.root}
          root={menu.root}
          meta={p.meta[menu.root]}
          onSetMeta={p.onSetMeta}
          onClose={() => setMenu(null)}
          style={{ top: menu.y }}
        />
      )}
    </div>
  );
}
