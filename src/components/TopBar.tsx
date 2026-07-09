import { t } from "../lib/i18n";
import { SearchIcon, ZapIcon, RefreshIcon } from "./icons";

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
  activeProjectName,
  activeProjectColor,
  onProjectClick,
  layout,
  onSetLayout,
  onOpenPalette,
  onQuickAsk,
  activeSurface,
  showAtelier,
  onGalleryReload,
  showExplorer,
  onToggleExplorer,
  onOpenGit,
}: {
  activeProjectName: string;
  activeProjectColor?: string;
  onProjectClick: () => void;
  layout: Layout;
  onSetLayout: (layout: Layout) => void;
  onOpenPalette: () => void;
  onQuickAsk: () => void;
  activeSurface: string;
  showAtelier: boolean;
  onGalleryReload: () => void;
  showExplorer: boolean;
  onToggleExplorer: () => void;
  onOpenGit: () => void;
}) {
  const gitActive = showAtelier && activeSurface === "git";
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar-left" data-tauri-drag-region>
        {activeProjectName && (
          <button type="button" className="topbar-crumb" onClick={onProjectClick} title={activeProjectName}>
            <span className="topbar-crumb-dot" style={{ background: activeProjectColor || "var(--accent)" }} />
            <span className="topbar-crumb-name">{activeProjectName}</span>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6l4 4 4-4" /></svg>
          </button>
        )}
      </div>
      <span className="flex" />
      <button type="button" className="topbar-cmd" onClick={onOpenPalette} title={t("topbar.search")}>
        <SearchIcon size={12} />
        <span className="topbar-cmd-label">{t("topbar.search")}</span>
        <span className="topbar-cmd-kbd">⌘K</span>
      </button>
      <span className="flex" />
      <div className="topbar-right">
        {showAtelier && activeSurface === "atelier" && (
          <button type="button" className="ghost topbar-qa" title={t("action.refresh-hard")} onClick={onGalleryReload}>
            <RefreshIcon size={14} />
          </button>
        )}
        {/* Explorateur + Git remontés du rail */}
        <button type="button" className={`ghost topbar-qa ${showExplorer ? "on" : ""}`} title={t("atelier.file-explorer")} onClick={onToggleExplorer}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z" /></svg>
        </button>
        <button type="button" className={`ghost topbar-qa ${gitActive ? "on" : ""}`} title={t("atelier.git")} onClick={onOpenGit}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.6v4.8M4 8h4a4 4 0 0 0 4-.4"/></svg>
        </button>
        <div className="tb-seg" role="group" aria-label={t("layout.split")}>
          <button type="button" className={layout === "chat" ? "on" : ""}
            title={`${t("layout.chat")} (⌘1)`} onClick={() => onSetLayout("chat")}>
            <LayoutChatIcon />
          </button>
          <button type="button" className={layout === "split" ? "on" : ""}
            title={`${t("layout.split")} (⌘0)`} onClick={() => onSetLayout("split")}>
            <LayoutSplitIcon />
          </button>
          <button type="button" className={layout === "atelier" ? "on" : ""}
            title={`${t("layout.atelier")} (⌘2)`} onClick={() => onSetLayout("atelier")}>
            <LayoutAtelierIcon />
          </button>
        </div>
        <button type="button" className="ghost topbar-qa" title={`${t("qa.open")} (⌥⌘K)`} onClick={onQuickAsk}>
          <ZapIcon size={14} />
        </button>
      </div>
    </div>
  );
}
