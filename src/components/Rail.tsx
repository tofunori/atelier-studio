import { useState } from "react";
import { Clock3Icon } from "lucide-react";
import { t } from "../lib/i18n";
import { ChatsIcon, HighlighterIcon, PlusIcon, SettingsIcon, SidebarIcon } from "./icons";
import RailActivity from "./RailActivity";
import { ProjIcon } from "./sidebar/projectIcons";
import { ProjectStyleMenu } from "./sidebar/ProjectStyleMenu";
import type { ViewId } from "../lib/settings";
import { IconButton } from "./ui/IconButton";
import { RowButton } from "./ui";

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
  onNewChat: () => void;
  onSelectView: (view: ViewId) => void;
  onSelectProject: (root: string) => void;
  onAddProject: () => void;
  onExpand: () => void;
  onSettings: () => void;
  onProjectSettings?: (root: string) => void;
  onSetMeta: (root: string, meta: ProjMeta) => void;
  onRemoveProject: (root: string) => void;
  onReorder: (from: string, to: string) => void;
}) {
  const [menu, setMenu] = useState<{ root: string; y: number } | null>(null);
  const [dragRoot, setDragRoot] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Les surfaces ont déménagé dans la barre du haut (plan 055) : le rail ne
  // porte plus que l'identité (projets) et les vues. « Surlignés » redevient
  // une vue simple, à côté de Chats et Automations.
  const highlightsBtn = (
    <IconButton key="highlights" className={`rail-view ${p.activeView === "highlights" ? "on" : ""}`}
      label={t("view.highlights")} title={t("view.highlights")} onClick={() => p.onSelectView("highlights")}>
      <HighlighterIcon size={19} />
    </IconButton>
  );

  return (
    <div className="rail">
      {/* zone scrollable : tout sauf Réglages (épinglé en bas) */}
      <div className="rail-scroll">
      {/* zone haute : vues et surfaces. Elle défile POUR ELLE-MÊME quand le
          tiroir « autres surfaces » s'ouvre — sinon elle écrasait les projets,
          qui n'ont rien demandé. */}
      <div className="rail-top">
      <IconButton className={`rail-btn ${!p.compact ? "on" : ""}`}
        label={p.compact ? t("action.expand-sidebar") : t("action.collapse-sidebar")}
        title={p.compact ? t("action.expand-sidebar") : t("action.collapse-sidebar")} onClick={p.onExpand}>
        <SidebarIcon size={19} />
      </IconButton>
      <div className="rail-views">
        {/* Nouveau chat : seulement en compact — le panneau déplié a déjà son bouton */}
        {p.compact && (
          <IconButton className="rail-btn" label={t("action.new-chat")} title={t("action.new-chat")} onClick={p.onNewChat}>
            {/* compose : crayon entrant dans un carré ouvert (standard « nouveau message ») */}
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13.6 8.8v3a1.8 1.8 0 0 1-1.8 1.8H4.2a1.8 1.8 0 0 1-1.8-1.8V4.4a1.8 1.8 0 0 1 1.8-1.8h3" />
              <path d="M13.9 3.5a1.35 1.35 0 0 0-1.9-1.9L6.3 7.3l-.6 2.5 2.5-.6z" />
            </svg>
          </IconButton>
        )}
        <IconButton className={`rail-view ${p.activeView === "chats" ? "on" : ""}`}
          label={t("view.chats")} title={t("view.chats")} onClick={() => p.onSelectView("chats")}>
          <ChatsIcon size={19} />
        </IconButton>
        <IconButton className={`rail-view ${p.activeView === "automations" ? "on" : ""}`}
          label={t("automations.title")} title={t("automations.title")} onClick={() => p.onSelectView("automations")}>
          <Clock3Icon size={19} />
        </IconButton>
        {highlightsBtn}
      </div>
      </div>{/* fin rail-top */}
      <div className="rail-sep" />
      {/* zone des projets : sa propre zone de défilement, jamais comprimée */}
      <div className="rail-projects">
      {p.projects.map((root) => {
        const m = p.meta[root];
        const active = root === p.activeProject;
        return (
          <RowButton
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
          </RowButton>
        );
      })}
      <IconButton className="rail-btn" label={t("action.add-project")} title={t("action.add-project")} onClick={p.onAddProject}>
        <PlusIcon size={19} />
      </IconButton>
      </div>{/* fin rail-projects */}
      {/* ce qui tourne sans toi : agents, conversions (plan 055) */}
      <RailActivity running={p.running} meta={p.meta} onSelectProject={p.onSelectProject} />
      </div>{/* fin rail-scroll */}
      {/* zone épinglée : Réglages toujours visible en bas, jamais scrollé */}
      <div className="rail-pinned">
        <IconButton className="rail-btn usage-ib" label={t("usage.title")} title={t("usage.title")}
          onClick={() => window.dispatchEvent(new CustomEvent("usage-toggle"))}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
            <path d="M8 2a6 6 0 0 1 5.6 3.9" />
          </svg>
          <span className="usage-dot" id="usage-dot" />
        </IconButton>
        <IconButton className="rail-btn" label={t("action.settings")} title={t("action.settings")} onClick={p.onSettings}>
          <SettingsIcon size={19} />
        </IconButton>
      </div>
      {menu && (
        <ProjectStyleMenu
          key={menu.root}
          root={menu.root}
          meta={p.meta[menu.root]}
          onSetMeta={p.onSetMeta}
          onProjectSettings={p.onProjectSettings}
          onRemove={p.onRemoveProject}
          onClose={() => setMenu(null)}
          anchor={{ x: 56, y: menu.y }}
        />
      )}
    </div>
  );
}
