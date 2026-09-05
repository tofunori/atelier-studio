import { useState } from "react";
import { t } from "../lib/i18n";
import { SearchIcon, ZapIcon, PlusIcon } from "./icons";
import { IconButton, RowButton, SegmentedControl, Tooltip } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import TopBarSurfaces from "./TopBarSurfaces";
import TopBarTabs, { type PaneTab } from "./TopBarTabs";
import type { Surface } from "./surfaces";
import { type ProjMeta } from "./Rail";


// chemin compact pour l'en-tête du menu projet : ~/… au lieu de /Users/x/…
function shortPath(root: string) {
  return root.replace(/^\/Users\/[^/]+/, "~");
}
function displayName(root: string, meta?: ProjMeta) {
  if (meta?.label && !meta.label.startsWith("icon:")) return meta.label;
  return root.split("/").filter(Boolean).pop() ?? root;
}

// icônes de bascule layout : même rectangle 16x16 que le reste (rect + trait
// de séparation), seule la moitié « active » est teintée (fill=currentColor,
// faible opacité) — sobre, monochrome, cohérent avec le reste du rail.
function LayoutChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <rect x="2.65" y="3.65" width="10.7" height="8.7" rx="1" fill="currentColor" opacity="0.32" stroke="none" />
    </svg>
  );
}
function LayoutSplitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M8 3v10" />
      <rect x="2.65" y="3.65" width="4.6" height="8.7" fill="currentColor" opacity="0.32" stroke="none" />
    </svg>
  );
}
function LayoutAtelierIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M8 3v10" />
      <rect x="8.65" y="3.65" width="4.7" height="8.7" fill="currentColor" opacity="0.32" stroke="none" />
    </svg>
  );
}

type Layout = "chat" | "split" | "atelier";

export default function TopBar({
  projects,
  projMeta,
  activeProject,
  onSelectProject,
  onAddProject,
  layout,
  onSetLayout,
  onOpenPalette,
  onQuickAsk,
  activeSurface,
  showAtelier,
  showExplorer,
  showAnnots,
  onToggleExplorer,
  onToggleAnnots,
  onSelectSurface,
  onSelectIde,
  ideActive,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
}: {
  projects: string[];
  projMeta: Record<string, ProjMeta>;
  activeProject: string | null;
  onSelectProject: (root: string) => void;
  onAddProject: () => void;
  layout: Layout;
  onSetLayout: (layout: Layout) => void;
  onOpenPalette: () => void;
  onQuickAsk: () => void;
  activeSurface: Surface;
  showAtelier: boolean;
  showExplorer: boolean;
  showAnnots: boolean;
  onToggleExplorer: () => void;
  onToggleAnnots: () => void;
  onSelectSurface: (surface: Surface) => void;
  onSelectIde: () => void;
  ideActive: boolean;
  /** Onglets du pane focalisé (lot 068) — ils vivaient dans le rail, où
   *  48 px les réduisaient à deux lettres. Vide = section absente. */
  tabs: PaneTab[];
  activeTab: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  const [projMenu, setProjMenu] = useState(false);
  const meta = activeProject ? projMeta[activeProject] : undefined;
  const color = meta?.color || "var(--accent)";
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar-start" data-tauri-drag-region>
      <div className="topbar-left" data-tauri-drag-region>
        {activeProject && (
          <LazyDropdownMenu
            open={projMenu}
            onOpenChange={setProjMenu}
            label={t("topbar.switch-to")}
            align="start"
            className="proj-menu"
            trigger={
              // aminci (demande Thierry 2026-07-16) : nom seul en texte
              // discret — la couleur/tuile du projet vit déjà dans le rail
              <RowButton className="topbar-crumb" title={shortPath(activeProject)}>
                <span className="topbar-crumb-name">{displayName(activeProject, meta)}</span>
                <svg className="crumb-chev" width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6l4 4 4-4" /></svg>
              </RowButton>
            }
            header={
              <>
                <div className="proj-menu-head" style={{ "--pc": color } as React.CSSProperties}>
                  <span className="pm-dot" />
                  <span className="pm-col">
                    <span className="pm-name">{displayName(activeProject, meta)}</span>
                    <span className="pm-path">{shortPath(activeProject)}</span>
                  </span>
                </div>
                {projects.some((root) => root !== activeProject) && (
                  <div className="proj-menu-label">{t("topbar.switch-to")}</div>
                )}
              </>
            }
            items={[
              ...projects.filter((root) => root !== activeProject).map((root) => {
                const project = projMeta[root];
                return {
                  key: root,
                  className: "pm-row",
                  label: (
                    <>
                      <span className="pm-dot" style={{ "--pc": project?.color || "var(--mark-neutral)" } as React.CSSProperties} />
                      <span className="pm-row-name">{displayName(root, project)}</span>
                    </>
                  ),
                  onSelect: () => onSelectProject(root),
                };
              }),
              {
                key: "add-project",
                className: "pm-row pm-action",
                separatorBefore: true,
                label: <><PlusIcon size={13} />{t("action.add-project")}</>,
                onSelect: onAddProject,
              },
            ]}
          />
        )}
      </div>
      </div>
      {/* Zone CENTRE (demande Thierry 2026-08-16) : les surfaces quittent le
          groupe de droite pour être centrées dans la fenêtre. La grille à
          côtés 1fr les centre sur la fenêtre, pas sur ce qui reste de place —
          leur position ne bouge donc pas quand on ouvre un onglet. */}
      <div className="topbar-center" data-tauri-drag-region>
        <TopBarSurfaces
          showAnnots={showAnnots}
          onToggleAnnots={onToggleAnnots}
          activeSurface={activeSurface}
          showAtelier={showAtelier}
          ideActive={ideActive}
          showExplorer={showExplorer}
          onSelectSurface={onSelectSurface}
          onSelectIde={onSelectIde}
          onToggleExplorer={onToggleExplorer}
        />
      </div>
      <div className="topbar-right">
        {/* Onglets du pane, juste à DROITE des surfaces (demande Thierry
            2026-08-16) : ils partent du centre et grandissent vers la droite,
            tandis que les contrôles de disposition restent au bord. */}
        <span className="topbar-div" />
        <TopBarTabs tabs={tabs} activeTab={activeTab} onSelectTab={onSelectTab} onCloseTab={onCloseTab} />
        <span className="flex" />
        {/* Recherche réduite à son icône (lot 068) : le champ occupait
            clamp(280px, 32vw, 420px) pour annoncer un raccourci que tout
            utilisateur régulier tape sans regarder — cette largeur va aux
            onglets. Le ⌘K et la palette ne changent pas. */}
        <Tooltip label={`${t("topbar.search")} (⌘K)`} placement="bottom">
        <IconButton
          label={t("topbar.search")}
          className="ghost topbar-qa"
          onClick={onOpenPalette}
        >
          <SearchIcon size={14} />
        </IconButton>
        </Tooltip>
        <span className="topbar-div" />
        {/* pilote plan 016 : ex-.tb-seg (role=group) → SegmentedControl
            (radiogroup, flèches, roving tabindex) ; mêmes icônes, mêmes
            titles avec raccourcis, même géométrie 26×22 */}
        <SegmentedControl
          label={t("layout.split")}
          value={layout}
          onChange={(v) => onSetLayout(v as Layout)}
          options={[
            { value: "chat", label: <LayoutChatIcon />, ariaLabel: t("layout.chat"), title: `${t("layout.chat")} (⌘1)` },
            { value: "split", label: <LayoutSplitIcon />, ariaLabel: t("layout.split"), title: `${t("layout.split")} (⌘0)` },
            { value: "atelier", label: <LayoutAtelierIcon />, ariaLabel: t("layout.atelier"), title: `${t("layout.atelier")} (⌘2)` },
          ]}
        />
        <span className="topbar-div" />
        <Tooltip label={`${t("qa.open")} (⌥⌘K)`} placement="bottom">
        <IconButton label={t("qa.open")} className="ghost topbar-qa" onClick={onQuickAsk}>
          <ZapIcon size={14} />
        </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}
