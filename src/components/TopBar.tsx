import { useState } from "react";
import { t } from "../lib/i18n";
import { SearchIcon, ZapIcon, PlusIcon } from "./icons";
import { Button, IconButton, RowButton, SegmentedControl } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import TopBarSurfaces from "./TopBarSurfaces";
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
  onToggleExplorer,
  onSelectSurface,
  onSelectIde,
  ideActive,
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
  onToggleExplorer: () => void;
  onSelectSurface: (surface: Surface) => void;
  onSelectIde: () => void;
  ideActive: boolean;
}) {
  const [projMenu, setProjMenu] = useState(false);
  const meta = activeProject ? projMeta[activeProject] : undefined;
  const color = meta?.color || "var(--accent)";
  return (
    <div className="topbar" data-tauri-drag-region>
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
      <span className="flex" />
      <Button
        type="button"
        variant="ghost"
        className="topbar-cmd"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpenPalette}
        title={t("topbar.search")}
      >
        <SearchIcon size={12} />
        <span className="topbar-cmd-label">{t("topbar.search")}</span>
        <span className="topbar-cmd-kbd">⌘K</span>
      </Button>
      <span className="flex" />
      <div className="topbar-right">
        {/* Surfaces (plan 055) : toutes ici, épinglables. Le refresh galerie
            vit dans le GalleryHeader de la surface (plan 018). */}
        <TopBarSurfaces
          activeSurface={activeSurface}
          showAtelier={showAtelier}
          ideActive={ideActive}
          showExplorer={showExplorer}
          onSelectSurface={onSelectSurface}
          onSelectIde={onSelectIde}
          onToggleExplorer={onToggleExplorer}
        />
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
        <IconButton label={t("qa.open")} className="ghost topbar-qa" title={`${t("qa.open")} (⌥⌘K)`} onClick={onQuickAsk}>
          <ZapIcon size={14} />
        </IconButton>
      </div>
    </div>
  );
}
