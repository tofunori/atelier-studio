import { useState } from "react";
import { t } from "../lib/i18n";
import { SearchIcon, ZapIcon, PlusIcon } from "./icons";
import { Button, IconButton, RowButton, SegmentedControl } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { type ProjMeta } from "./Rail";
import { dispatchWorkspacePointerDragStart, shouldSuppressWorkspaceSourceClick } from "../lib/workspaceDrag";

function surfaceDragProps(surface: "git" | "browser" | "terminal") {
  return {
    onClickCapture: (event: React.MouseEvent<HTMLSpanElement>) => {
      if (!shouldSuppressWorkspaceSourceClick({ kind: "surface", surface })) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerDown: (event: React.PointerEvent<HTMLSpanElement>) => {
      dispatchWorkspacePointerDragStart(event.nativeEvent, { kind: "surface", surface });
    },
  };
}

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
  onOpenGit,
  onOpenBrowser,
  onOpenTerminal,
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
  activeSurface: string;
  showAtelier: boolean;
  showExplorer: boolean;
  onToggleExplorer: () => void;
  onOpenGit: () => void;
  onOpenBrowser: () => void;
  onOpenTerminal: () => void;
}) {
  const gitActive = showAtelier && activeSurface === "git";
  const browserActive = showAtelier && activeSurface === "browser";
  const terminalActive = showAtelier && activeSurface === "terminal";
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
                      <span className="pm-dot" style={{ "--pc": project?.color || "var(--muted2)" } as React.CSSProperties} />
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
        {/* le refresh galerie vit désormais dans le GalleryHeader de la
            surface (plan 018, étape 6 : action de surface → SurfaceHeader) */}
        {/* Explorateur + Git remontés du rail */}
        <IconButton label={t("atelier.file-explorer")} className={`ghost topbar-qa ${showExplorer ? "on" : ""}`} title={t("atelier.file-explorer")} onClick={onToggleExplorer}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z" /></svg>
        </IconButton>
        <span className="topbar-surface-drag" {...surfaceDragProps("git")}>
          <IconButton label={t("atelier.git")} className={`ghost topbar-qa ${gitActive ? "on" : ""}`} title={t("atelier.git")} onClick={onOpenGit}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.6v4.8M4 8h4a4 4 0 0 0 4-.4"/></svg>
          </IconButton>
        </span>
        {/* Navigateur + Terminal remontés du tiroir du rail (option A) : mêmes
            icônes que surfaces.tsx, rendues à 15px comme Explorateur/Git */}
        <span className="topbar-surface-drag" {...surfaceDragProps("browser")}>
          <IconButton label={t("atelier.browser")} className={`ghost topbar-qa ${browserActive ? "on" : ""}`} title={t("atelier.browser")} onClick={onOpenBrowser}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c2.2 2 2.2 10.4 0 12.4M8 1.8c-2.2 2-2.2 10.4 0 12.4"/></svg>
          </IconButton>
        </span>
        <span className="topbar-surface-drag" {...surfaceDragProps("terminal")}>
          <IconButton label={t("atelier.terminal")} className={`ghost topbar-qa ${terminalActive ? "on" : ""}`} title={t("atelier.terminal")} onClick={onOpenTerminal}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="M4.5 6l2.2 2-2.2 2M8.5 10.5h3"/></svg>
          </IconButton>
        </span>
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
        <IconButton label={t("qa.open")} className="ghost topbar-qa" title={`${t("qa.open")} (⌥⌘K)`} onClick={onQuickAsk}>
          <ZapIcon size={14} />
        </IconButton>
      </div>
    </div>
  );
}
