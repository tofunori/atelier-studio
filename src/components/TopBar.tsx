import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { SearchIcon, ZapIcon, PlusIcon } from "./icons";
import { SegmentedControl } from "./ui";
import { projInitial, type ProjMeta } from "./Rail";
import { ProjIcon } from "./Sidebar";

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
}) {
  const gitActive = showAtelier && activeSurface === "git";
  const [projMenu, setProjMenu] = useState(false);
  useEffect(() => {
    if (!projMenu) return;
    const close = () => setProjMenu(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setProjMenu(false); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [projMenu]);
  const meta = activeProject ? projMeta[activeProject] : undefined;
  const color = meta?.color || "var(--accent)";
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar-left" data-tauri-drag-region>
        {activeProject && (
          <button type="button" className="topbar-crumb" title={shortPath(activeProject)}
            style={{ "--pc": color } as React.CSSProperties}
            onClick={(e) => { e.stopPropagation(); setProjMenu((v) => !v); }}>
            <span className="crumb-tile">
              {meta?.label?.startsWith("icon:")
                ? <ProjIcon name={meta.label.slice(5)} size={12} />
                : projInitial(activeProject, meta)}
            </span>
            <span className="topbar-crumb-name">{displayName(activeProject, meta)}</span>
            <svg className="crumb-chev" width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6l4 4 4-4" /></svg>
          </button>
        )}
        {projMenu && activeProject && (
          <div className="proj-menu" onClick={(e) => e.stopPropagation()}>
            {/* en-tête : projet courant, nom + chemin complet */}
            <div className="proj-menu-head" style={{ "--pc": color } as React.CSSProperties}>
              <span className="pm-dot" />
              <span className="pm-col">
                <span className="pm-name">{displayName(activeProject, meta)}</span>
                <span className="pm-path">{shortPath(activeProject)}</span>
              </span>
            </div>
            {projects.some((r) => r !== activeProject) && (
              <div className="proj-menu-label">{t("topbar.switch-to")}</div>
            )}
            {projects.filter((r) => r !== activeProject).map((root) => {
              const m = projMeta[root];
              return (
                <button key={root} type="button" className="pm-row"
                  onClick={() => { setProjMenu(false); onSelectProject(root); }}>
                  <span className="pm-dot" style={{ "--pc": m?.color || "var(--muted2)" } as React.CSSProperties} />
                  <span className="pm-row-name">{displayName(root, m)}</span>
                </button>
              );
            })}
            <div className="proj-menu-sep" />
            <button type="button" className="pm-row pm-action"
              onClick={() => { setProjMenu(false); onAddProject(); }}>
              <PlusIcon size={13} />
              {t("action.add-project")}
            </button>
          </div>
        )}
      </div>
      <span className="flex" />
      <button
        type="button"
        className="topbar-cmd"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpenPalette}
        title={t("topbar.search")}
      >
        <SearchIcon size={12} />
        <span className="topbar-cmd-label">{t("topbar.search")}</span>
        <span className="topbar-cmd-kbd">⌘K</span>
      </button>
      <span className="flex" />
      <div className="topbar-right">
        {/* le refresh galerie vit désormais dans le GalleryHeader de la
            surface (plan 018, étape 6 : action de surface → SurfaceHeader) */}
        {/* Explorateur + Git remontés du rail */}
        <button type="button" className={`ghost topbar-qa ${showExplorer ? "on" : ""}`} title={t("atelier.file-explorer")} onClick={onToggleExplorer}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z" /></svg>
        </button>
        <button type="button" className={`ghost topbar-qa ${gitActive ? "on" : ""}`} title={t("atelier.git")} onClick={onOpenGit}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.6v4.8M4 8h4a4 4 0 0 0 4-.4"/></svg>
        </button>
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
        <button type="button" className="ghost topbar-qa" title={`${t("qa.open")} (⌥⌘K)`} onClick={onQuickAsk}>
          <ZapIcon size={14} />
        </button>
      </div>
    </div>
  );
}
