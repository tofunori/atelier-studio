import { isDiscussionContext } from "../lib/discussions";
import { useState } from "react";
import { t } from "../lib/i18n";
import { ChatsIcon, PlusIcon, SettingsIcon, SidebarIcon } from "./icons";
import RailActivity from "./RailActivity";
import { ProjIcon } from "./sidebar/projectIcons";
import { ProjectStyleMenu } from "./sidebar/ProjectStyleMenu";
import type { ViewId } from "../lib/settings";
import { IconButton } from "./ui/IconButton";
import { RowButton } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import RailFavorites, { type RailFavoritesProps } from "./sidebar/RailFavorites";

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
  favorites?: RailFavoritesProps;
  projects: string[];
  activeProject: string | null;
  meta: Record<string, ProjMeta>;
  running: Set<string>;
  activeView: ViewId;
  compact: boolean;
  onNewChat: () => void;
  onDiscussions?: () => void;
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
  const [showActivity, setShowActivity] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<{ root: string; y: number } | null>(null);
  const [dragRoot, setDragRoot] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const favoriteActive = p.activeView === "chats" && Boolean(
    p.favorites?.threads.some(th => th.id === p.favorites?.activeId),
  );
  const discussionsActive = p.activeView === "chats" && !favoriteActive && isDiscussionContext(p.activeProject);

  return (
    <nav className="rail rail-clean" aria-label="Navigation principale">
      <div className="rail-scroll">
        <div className="rail-top" role="group" aria-label="Commandes">
          <IconButton className="rail-btn"
            aria-expanded={!p.compact}
            label={p.compact ? t("action.expand-sidebar") : t("action.collapse-sidebar")}
            title={p.compact ? t("action.expand-sidebar") : t("action.collapse-sidebar")} onClick={p.onExpand}>
            <SidebarIcon size={19} />
          </IconButton>
          <LazyDropdownMenu open={actionsOpen} onOpenChange={setActionsOpen} side="right"
            trigger={<IconButton className="rail-btn" label="Autres actions" title="Autres actions">…</IconButton>}
            items={[
              { key: "activity", label: "Activité en cours", onSelect: () => setShowActivity(v => !v) },
              { key: "new", label: t("action.new-chat"), onSelect: p.onNewChat },
              { key: "automations", label: t("automations.title"), onSelect: () => p.onSelectView("automations") },
              { key: "highlights", label: t("view.highlights"), onSelect: () => p.onSelectView("highlights") },
            ]} />
        </div>
        <div className="rail-views" role="group" aria-label="Discussions libres">
          <IconButton className={`rail-view ${discussionsActive ? "on" : ""}`}
            aria-current={discussionsActive ? "page" : undefined}
            label="Discussions libres" title="Discussions libres"
            onClick={() => p.onDiscussions ? p.onDiscussions() : p.onSelectView("chats")}>
            <ChatsIcon size={19} />
          </IconButton>
        </div>
        {p.favorites && p.favorites.threads.length > 0 && (
          <RailFavorites {...p.favorites} activeId={p.activeView === "chats" ? p.favorites.activeId : null} />
        )}
        <div className="rail-sep" aria-hidden="true" />
        <div className="rail-projects" role="group" aria-label="Projets">
      {p.projects.map((root) => {
        const m = p.meta[root];
        const active = root === p.activeProject && p.activeView === "chats" && !favoriteActive;
        return (
          <RowButton
            key={root}
            className={`rail-proj ${active ? "on" : ""} ${dragOver === root && dragRoot !== root ? "drag-over" : ""}`}
            style={{ "--proj-c": m?.color ?? "transparent" } as React.CSSProperties}
            aria-current={active ? "page" : undefined}
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
      <IconButton className="rail-btn rail-add-project" label={t("action.add-project")} title={t("action.add-project")} onClick={p.onAddProject}>
        <PlusIcon size={19} />
      </IconButton>
      </div>{/* fin rail-projects */}
      {/* ce qui tourne sans toi : agents, conversions (plan 055) */}
      {showActivity && <RailActivity running={p.running} meta={p.meta} onSelectProject={p.onSelectProject} />}
      </div>{/* fin rail-scroll */}
      {/* zone épinglée : Réglages toujours visible en bas, jamais scrollé */}
      <div className="rail-pinned">
        <LazyDropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen} side="right"
          trigger={<IconButton className="rail-btn" label={t("action.settings")} title={t("action.settings")}><SettingsIcon size={19} /></IconButton>}
          items={[
            { key: "settings", label: t("action.settings"), onSelect: p.onSettings },
            { key: "usage", label: t("usage.title"), onSelect: () => window.dispatchEvent(new CustomEvent("usage-toggle")) },
          ]} />
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
    </nav>
  );
}
