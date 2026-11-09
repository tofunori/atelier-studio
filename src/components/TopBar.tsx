import { useRef, useState } from "react";
import { ProjectChatTabs, type ProjectChatTab, type ChatTabActions, type ChatTabControls } from "./chat/ProjectChatTabs";
import { ChatHeaderSlot } from "./ChatHeaderSlot";
import { useToolbarDividerAlignment } from "./useToolbarDividerAlignment";
import "../styles/local-headers.css";
import { t } from "../lib/i18n";
import { IconButton, SegmentedControl } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import TopBarSurfaces, { SurfacesMenu, buildTargets } from "./TopBarSurfaces";
import TopBarTabs, { isDocumentTab, type PaneTab } from "./TopBarTabs";
import { WorkspacePaneMenuSlot } from "./WorkspacePaneMenuSlot";
import type { Surface } from "./surfaces";
import { MoreIcon } from "./icons";


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

/**
 * Barre du haut « onglets posés » (variante B + S2, choisie par Thierry le
 * 2026-11-09). Deux moitiés, chacune calée sur le panneau qu'elle pilote et
 * suivant la même phrase : des onglets à gauche, un seul ⌄ au bord.
 *  - moitié chat : onglets des chats, puis (au bord du panneau du chat) les
 *    sous-agents et le ⌄ « Nouveau chat + tous les chats » ;
 *  - moitié atelier : onglet Galerie épinglé, surface ouverte, documents, puis
 *    le ⌄ des surfaces et la disposition.
 * L'onglet actif prend le fond de son panneau et s'y fond (CSS) : on lit d'un
 * coup d'œil quel onglet pilote quel panneau.
 */
export default function TopBar({
  dividerVisible,
  chatTabControls,
  chatTabActions,
  chats = [],
  activeChatId = null,
  unreadChatIds,
  chatTitle,
  onSelectChat,
  onNewChat,
  activeProject,
  layout,
  onSetLayout,
  onOpenPalette,
  onQuickAsk,
  activeSurface,
  showAtelier,
  showExplorer,
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
  dividerVisible?: boolean;
  chatTabControls?: ChatTabControls;
  chatTabActions?: ChatTabActions;
  chats?: ProjectChatTab[];
  activeChatId?: string | null;
  unreadChatIds?: ReadonlySet<string>;
  chatTitle?: string;
  onSelectChat?: (id: string) => void;
  onNewChat?: () => void;
  activeProject: string | null;
  layout: Layout;
  onSetLayout: (layout: Layout) => void;
  onOpenPalette: () => void;
  onQuickAsk: () => void;
  activeSurface: Surface;
  showAtelier: boolean;
  showExplorer: boolean;
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
  const barRef = useRef<HTMLDivElement>(null);
  const split = dividerVisible ?? (layout === "split" && showAtelier);
  useToolbarDividerAlignment(barRef, split, layout);
  const [windowMenu, setWindowMenu] = useState(false);
  const surfaces = { activeSurface, showAtelier, ideActive, showExplorer, onSelectSurface, onSelectIde, onToggleExplorer, onToggleAnnots };
  const documentActive = showAtelier && tabs.some((tab) => tab.id === activeTab && isDocumentTab(tab));
  const chatVisible = layout !== "atelier";
  return (
    <div ref={barRef} className="topbar" data-tauri-drag-region data-layout={split ? "split" : layout}
      data-chat-attached={chatVisible ? "" : undefined} data-atelier-attached={showAtelier && layout !== "chat" ? "" : undefined}>
      <div className="topbar-start" data-tauri-drag-region>
      {onSelectChat && onNewChat && (chats.length > 0 || activeProject) ? (
        <ProjectChatTabs unread={unreadChatIds} controls={chatTabControls} actions={chatTabActions} chats={chats} activeId={activeChatId}
          onSelect={onSelectChat} onNew={onNewChat} beforeMenu={<ChatHeaderSlot />} />
      ) : <>{chatTitle ? <span className="topbar-chat-title">{chatTitle}</span> : null}<span className="flex" data-tauri-drag-region /><ChatHeaderSlot /></>}
      </div>
      <div className="topbar-right" data-tauri-drag-region>
        <span className="topbar-atelier-tabs" data-tauri-drag-region>
          <TopBarSurfaces {...surfaces} documentActive={documentActive} />
          <TopBarTabs allTabsMenu tabs={tabs} activeTab={showAtelier ? activeTab : null} onSelectTab={onSelectTab} onCloseTab={onCloseTab} />
        </span>
        <WorkspacePaneMenuSlot />
        <span className="flex" data-tauri-drag-region />
        <SurfacesMenu {...surfaces} />
        <span className="topbar-div" />
        <div className="topbar-layout-controls">
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
        </div>
        <div className="topbar-window-overflow">
          <LazyDropdownMenu open={windowMenu} onOpenChange={setWindowMenu} align="end"
            label={t("action.more")}
            trigger={<IconButton label={t("action.more")} aria-haspopup="menu" aria-expanded={windowMenu}><MoreIcon /></IconButton>}
            items={[
              {key:"surfaces", label:t("topbar.surfaces"), children:buildTargets(surfaces).map(target => ({key:target.id,label:target.label,onSelect:target.onSelect}))},
              {key:"search", label:t("topbar.search"), onSelect:onOpenPalette},
              {key:"chat", label:t("layout.chat"), onSelect:() => onSetLayout("chat")},
              {key:"split", label:t("layout.split"), onSelect:() => onSetLayout("split")},
              {key:"atelier", label:t("layout.atelier"), onSelect:() => onSetLayout("atelier")},
              {key:"quick", label:t("qa.open"), onSelect:onQuickAsk},
            ]} />
        </div>
      </div>
    </div>
  );
}
