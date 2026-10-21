import { isDiscussionContext } from "../lib/discussions";
import { useState, useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { ChatsIcon, PlusIcon, SettingsIcon, SidebarIcon } from "./icons";
import { ProjIcon } from "./sidebar/projectIcons";
import { ProjectStyleMenu } from "./sidebar/ProjectStyleMenu";
import type { ViewId } from "../lib/settings";
import { IconButton } from "./ui/IconButton";
import { RowButton } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import type { RailFavoritesProps } from "./sidebar/RailFavorites";
import { RailSignalMark, SIGNAL_LABEL } from "./RailSignalMark";
import type { RailInboxProps } from "./RailInbox";
import type { RailSignal } from "../lib/railSignals";
import { LazyBoundary, lazyWithRetry } from "./LazyBoundary";
import { articleImportSnapshot, subscribeArticleImport } from "../lib/articleImports";
import { useIntegrations } from "../lib/integrations";

// Hors de l'entrée (budget JS plein) : la boîte se charge au démarrage, la
// zone d'activité seulement quand une conversion existe.
const RailInbox = lazyWithRetry(() => import("./RailInbox"));
const RailActivity = lazyWithRetry(() => import("./RailActivity"));
// les favoris attendent de toute façon la liste des fils (WebSocket)
const RailFavorites = lazyWithRetry(() => import("./sidebar/RailFavorites"));

export type ProjMeta = { color?: string; label?: string };

/** Signaux agrégés par App (lib/railSignals) : le rail ne fait que les montrer. */
export type RailSignals = {
  /** signal le plus fort de chaque projet */
  projects: Record<string, RailSignal>;
  /** une ligne par fil qui demande quelque chose, pour l'infobulle du projet */
  notes: Record<string, string[]>;
  /** fils de Discussions libres qui demandent un geste */
  discussions: number;
};

// La conversion d'article reste dans la zone du bas ; les agents se lisent
// désormais sur le coin de leur projet.
const NO_AGENTS = new Set<string>();

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

type RailProjectsProps = {
  projects: string[];
  meta: Record<string, ProjMeta>;
  /** projet affiché dans le chat (null : une autre vue, un favori) */
  activeRoot: string | null;
  signals?: RailSignals;
  running: Set<string>;
  compact: boolean;
  onSelectProject: (root: string) => void;
  onSelectView: (view: ViewId) => void;
  onExpand: () => void;
  onAddProject: () => void;
  onReorder: (from: string, to: string) => void;
  onMenu: (root: string, y: number) => void;
};

/** Puces de projets : signal au coin, glisser pour réordonner, clic droit
 * pour le style. */
function RailProjects(p: RailProjectsProps) {
  const [dragRoot, setDragRoot] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  return (
    <div className="rail-projects" role="group" aria-label="Projets">
      {p.projects.map((root) => {
        const m = p.meta[root];
        const active = root === p.activeRoot;
        // l'ancien point « agent au travail » reste la source quand App ne
        // fournit pas encore de signaux (tests, bancs)
        const signal = p.signals ? p.signals.projects[root] ?? null : (p.running.has(root) ? "run" : null);
        const name = root.split("/").pop() ?? root;
        const notes = p.signals?.notes[root] ?? [];
        const tip = [name, ...(notes.length ? notes : signal ? [SIGNAL_LABEL[signal]] : [])].join("\n");
        return (
          <RowButton
            key={root}
            className={`rail-proj ${m?.color ? "tinted" : ""} ${active ? "on" : ""} ${dragOver === root && dragRoot !== root ? "drag-over" : ""}`}
            style={{ "--proj-c": m?.color ?? "transparent" } as React.CSSProperties}
            aria-current={active ? "page" : undefined}
            aria-label={signal ? `${name} — ${SIGNAL_LABEL[signal]}` : name}
            data-signal={signal ?? undefined}
            title={tip}
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
              p.onMenu(root, e.clientY);
            }}
          >
            {m?.label?.startsWith("icon:") ? <ProjIcon name={m.label.slice(5)} size={18} /> : projInitial(root, m)}
            <RailSignalMark signal={signal} />
          </RowButton>
        );
      })}
      <IconButton className="rail-btn rail-add-project" label={t("action.add-project")} title={t("action.add-project")} onClick={p.onAddProject}>
        <PlusIcon size={19} />
      </IconButton>
    </div>
  );
}

export default function Rail(p: {
  favorites?: RailFavoritesProps;
  signals?: RailSignals;
  inbox?: RailInboxProps;
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<{ root: string; y: number } | null>(null);

  const articleJobs = useSyncExternalStore(subscribeArticleImport, articleImportSnapshot).jobs.length;
  const ragdocOn = useIntegrations().effective.ragdoc;
  const favoriteActive = p.activeView === "chats" && Boolean(
    p.favorites?.threads.some(th => th.id === p.favorites?.activeId),
  );
  const discussionsActive = p.activeView === "chats" && !favoriteActive && isDiscussionContext(p.activeProject);
  const discussionCount = p.signals?.discussions ?? 0;
  const discussionsLabel = discussionCount > 0
    ? `${t("discussions.title")} — ${discussionCount} à traiter`
    : t("discussions.title");

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
          {p.inbox && (
            <LazyBoundary fallback={<span className="rail-btn" aria-hidden="true" />}>
              <RailInbox {...p.inbox} />
            </LazyBoundary>
          )}
          <LazyDropdownMenu open={actionsOpen} onOpenChange={setActionsOpen} side="right"
            trigger={<IconButton className="rail-btn" label="Autres actions" title="Autres actions">…</IconButton>}
            items={[
              { key: "new", label: t("action.new-chat"), onSelect: p.onNewChat },
              { key: "automations", label: t("automations.title"), onSelect: () => p.onSelectView("automations") },
              { key: "highlights", label: t("view.highlights"), onSelect: () => p.onSelectView("highlights") },
            ]} />
        </div>
        <div className="rail-views" role="group" aria-label={t("discussions.title")}>
          <IconButton className={`rail-view ${discussionsActive ? "on" : ""}`}
            aria-current={discussionsActive ? "page" : undefined}
            label={discussionsLabel} title={discussionsLabel}
            onClick={() => p.onDiscussions ? p.onDiscussions() : p.onSelectView("chats")}>
            <ChatsIcon size={19} />
            {discussionCount > 0 && <span className="rail-count" aria-hidden="true">{discussionCount > 9 ? "9+" : discussionCount}</span>}
          </IconButton>
        </div>
        {p.favorites && p.favorites.threads.length > 0 && (
          <LazyBoundary fallback={<div className="rail-favorites" />}>
            <RailFavorites {...p.favorites} activeId={p.activeView === "chats" ? p.favorites.activeId : null} />
          </LazyBoundary>
        )}
        <div className="rail-sep" aria-hidden="true" />
        <RailProjects
          projects={p.projects}
          meta={p.meta}
          activeRoot={p.activeView === "chats" && !favoriteActive ? p.activeProject : null}
          signals={p.signals}
          running={p.running}
          compact={p.compact}
          onSelectProject={p.onSelectProject}
          onSelectView={p.onSelectView}
          onExpand={p.onExpand}
          onAddProject={p.onAddProject}
          onReorder={p.onReorder}
          onMenu={(root, y) => setMenu({ root, y })}
        />
      </div>{/* fin rail-scroll */}
      {/* zone épinglée : tâches de fond (conversions) puis Réglages, toujours
          visibles en bas, jamais scrollés */}
      <div className="rail-pinned">
        {ragdocOn && articleJobs > 0 && (
          <LazyBoundary fallback={null}>
            <RailActivity running={NO_AGENTS} meta={p.meta} onSelectProject={p.onSelectProject} />
          </LazyBoundary>
        )}
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
