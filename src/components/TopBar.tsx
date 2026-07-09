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
  layout,
  onSetLayout,
  onOpenPalette,
  onQuickAsk,
  activeSurface,
  showAtelier,
  onGalleryReload,
}: {
  activeProjectName: string;
  layout: Layout;
  onSetLayout: (layout: Layout) => void;
  onOpenPalette: () => void;
  onQuickAsk: () => void;
  activeSurface: string;
  showAtelier: boolean;
  onGalleryReload: () => void;
}) {
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar-left" data-tauri-drag-region>
        {activeProjectName && <span className="topbar-project">{activeProjectName}</span>}
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
