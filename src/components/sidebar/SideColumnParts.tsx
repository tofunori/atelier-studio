// Colonne latérale unifiée (variante A, maquette du 2026-11-08) : le rail et
// le panneau des conversations ne font plus qu'une colonne posée sur le sol
// de la fenêtre. Ce module porte ce qui entoure la liste des conversations :
// les rangées nommées du haut (À traiter, Surlignés, Automatisations) et le
// bas (autres projets, Discussions libres, réglages, quota). Chargé à part de
// l'entrée (budget JS plein, cf. scripts/check_entry_budget.mts).
import { useState, useSyncExternalStore } from "react";
import { t } from "../../lib/i18n";
import { isDiscussionContext } from "../../lib/discussions";
import type { ViewId } from "../../lib/settings";
import { articleImportSnapshot, subscribeArticleImport } from "../../lib/articleImports";
import { useIntegrations } from "../../lib/integrations";
import { readUsageSnapshot, subscribeUsage, worstOf } from "../../lib/usageSummary";
import { ChatsIcon, HighlighterIcon, PlusIcon, SettingsIcon } from "../icons";
import { IconButton } from "../ui/IconButton";
import { RowButton } from "../ui/RowButton";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";
import RailInbox, { type RailInboxProps } from "../RailInbox";
import RailActivity from "../RailActivity";
import { RailSignalMark, SIGNAL_LABEL } from "../RailSignalMark";
import type { ProjMeta, RailSignals } from "../Rail";
import { ProjIcon } from "./projectIcons";
import { AllProjectsGlyph } from "./AllProjectsGlyph";
import { ProjectStyleMenu } from "./ProjectStyleMenuLazy";
import type { ProjectStyleAnchor } from "./ProjectStyleMenu";

import { ChevronRightIcon, ClockIcon } from "lucide-react";
const NO_AGENTS = new Set<string>();

function AutomationsGlyph() {
  return (
    <ClockIcon size={14} />
  );
}

function ChevronRightGlyph() {
  return (
    <ChevronRightIcon size={12} />
  );
}

/** Rangées nommées du haut de la colonne. Un second clic sur une vue
 *  active ramène aux conversations. */
export type SideNavProps = {
  view: ViewId;
  inbox?: RailInboxProps;
  onSelectView: (view: ViewId) => void;
};

export function SideNav(p: SideNavProps) {
  const row = (view: ViewId, icon: React.ReactNode, label: string) => (
    <RowButton
      className={`scol-row ${p.view === view ? "on" : ""}`}
      aria-current={p.view === view ? "page" : undefined}
      onClick={() => p.onSelectView(p.view === view ? "chats" : view)}
    >
      <span className="scol-row-ico">{icon}</span>
      <span className="scol-row-label">{label}</span>
    </RowButton>
  );
  return (
    <nav className="scol-nav" aria-label={t("sidebar.to-review")}>
      {p.inbox && <RailInbox {...p.inbox} variant="row" rowLabel={t("sidebar.to-review")} />}
      {row("highlights", <HighlighterIcon size={14} />, t("view.highlights"))}
      {row("automations", <AutomationsGlyph />, t("automations.title"))}
    </nav>
  );
}

export type SideBottomProps = {
  projects: string[];
  meta: Record<string, ProjMeta>;
  /** projet déjà nommé en tête de colonne : pas répété en bas */
  headerProject: string | null;
  discussionsActive: boolean;
  signals?: RailSignals;
  running: Set<string>;
  onSelectProject: (root: string) => void;
  onAddProject: () => void;
  /** accueil des projets (⇧⌘P) : le titre « Projets » et la rangée du bas */
  onAllProjects?: () => void;
  onDiscussions: () => void;
  onSettings: () => void;
  onProjectSettings?: (root: string) => void;
  onSetMeta: (root: string, meta: ProjMeta) => void;
  onRemoveProject: (root: string) => void;
  onReorder: (from: string, to: string) => void;
};

function projectGlyph(root: string, meta?: ProjMeta) {
  if (meta?.label?.startsWith("icon:")) return <ProjIcon name={meta.label.slice(5)} size={14} />;
  const text = meta?.label ? meta.label.slice(0, 2) : (root.split("/").pop() ?? "?").charAt(0).toUpperCase();
  return <span className="scol-proj-letter">{text}</span>;
}

/** Bas de la colonne : autres projets (clic, glisser, clic droit), Discussions
 *  libres, puis réglages et quota. */
export function SideBottom(p: SideBottomProps) {
  const [dragRoot, setDragRoot] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ root: string; anchor: ProjectStyleAnchor } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const usage = useSyncExternalStore(subscribeUsage, readUsageSnapshot);
  const worst = worstOf(usage);
  const articleJobs = useSyncExternalStore(subscribeArticleImport, articleImportSnapshot).jobs.length;
  const ragdocOn = useIntegrations().effective.ragdoc;
  const discussions = p.signals?.discussions ?? 0;
  const others = p.projects.filter((root) => root !== p.headerProject && !isDiscussionContext(root));

  return (
    <div className="scol-bottom">
      <div className="scol-sec">
        {p.onAllProjects ? (
          <span>
            <RowButton className="scol-sec-link" title={`${t("projects.all")} (⇧⌘P)`} onClick={p.onAllProjects}>
              {t("sidebar.projects")}
              <ChevronRightGlyph />
            </RowButton>
          </span>
        ) : (
          <span>{t("sidebar.projects")}</span>
        )}
        <IconButton className="scol-sec-btn" label={t("action.add-project")} title={t("action.add-project")}
          onClick={p.onAddProject}>
          <PlusIcon size={12} />
        </IconButton>
      </div>
      <div className="scol-projects" role="group" aria-label={t("sidebar.projects")}>
        {others.map((root) => {
          const name = root.split("/").pop() ?? root;
          const signal = p.signals ? p.signals.projects[root] ?? null : (p.running.has(root) ? "run" : null);
          const notes = p.signals?.notes[root] ?? [];
          const tip = [root, ...(notes.length ? notes : signal ? [SIGNAL_LABEL[signal]] : [])].join("\n");
          return (
            <RowButton
              key={root}
              className={`scol-row scol-proj ${dragOver === root && dragRoot !== root ? "drag-over" : ""}`}
              title={tip}
              aria-label={signal ? `${name} — ${SIGNAL_LABEL[signal]}` : name}
              data-signal={signal ?? undefined}
              draggable
              onDragStart={(e) => { setDragRoot(root); e.dataTransfer.effectAllowed = "move"; }}
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
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ root, anchor: { x: e.clientX, y: e.clientY } });
              }}
            >
              <span className="scol-row-ico">{projectGlyph(root, p.meta[root])}</span>
              <span className="scol-row-label">{name}</span>
              {signal && <span className="scol-sig"><RailSignalMark signal={signal} /></span>}
            </RowButton>
          );
        })}
        <RowButton
          className={`scol-row ${p.discussionsActive ? "on" : ""}`}
          aria-current={p.discussionsActive ? "page" : undefined}
          onClick={p.onDiscussions}
        >
          <span className="scol-row-ico"><ChatsIcon size={14} /></span>
          <span className="scol-row-label">{t("discussions.title")}</span>
          {discussions > 0 && <span className="scol-count" aria-hidden="true">{discussions > 99 ? "99+" : discussions}</span>}
        </RowButton>
        {p.onAllProjects && (
          <RowButton className="scol-row scol-all" aria-keyshortcuts="Meta+Shift+P" onClick={p.onAllProjects}>
            <span className="scol-row-ico"><AllProjectsGlyph /></span>
            <span className="scol-row-label">{t("projects.all")}</span>
            <span className="scol-kbd" aria-hidden="true">⇧⌘P</span>
          </RowButton>
        )}
      </div>
      <div className="scol-foot">
        <LazyDropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen} side="top" align="start"
          trigger={<IconButton className="scol-foot-btn" label={t("action.settings")}><SettingsIcon size={14} /></IconButton>}
          items={[
            { key: "settings", label: t("action.settings"), onSelect: p.onSettings },
            { key: "usage", label: t("usage.title"), onSelect: () => window.dispatchEvent(new CustomEvent("usage-toggle")) },
          ]} />
        <RowButton className="scol-usage" title={t("usage.title")}
          onClick={() => window.dispatchEvent(new CustomEvent("usage-toggle"))}>
          {worst != null && (
            <span className="scol-usage-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(2, Math.min(100, worst))}%` }} />
            </span>
          )}
          <span>{t("usage.title")}{worst != null ? ` ${Math.round(worst)} %` : ""}</span>
        </RowButton>
        {ragdocOn && articleJobs > 0 && (
          <RailActivity running={NO_AGENTS} meta={p.meta} onSelectProject={p.onSelectProject} />
        )}
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
          anchor={menu.anchor}
        />
      )}
    </div>
  );
}
