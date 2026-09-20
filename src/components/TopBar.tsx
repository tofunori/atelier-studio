import { useRef, useState } from "react";
import { ProjectChatTabs, type ProjectChatTab, type ChatTabControls } from "./chat/ProjectChatTabs";
import { ChatHeaderSlot } from "./ChatHeaderSlot";
import { useToolbarDividerAlignment } from "./useToolbarDividerAlignment";
import "../styles/local-headers.css";
import { t } from "../lib/i18n";
import { IconButton } from "./ui";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import TopBarSurfaces, { buildTargets } from "./TopBarSurfaces";
import TopBarTabs, { type PaneTab } from "./TopBarTabs";
import { WorkspacePaneMenuSlot } from "./WorkspacePaneMenuSlot";
import type { Surface } from "./surfaces";


type Layout = "chat" | "split" | "atelier";

export default function TopBar({
  dividerVisible,
  chatTabControls,
  chats = [],
  activeChatId = null,
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
  dividerVisible?: boolean;
  chatTabControls?: ChatTabControls;
  chats?: ProjectChatTab[];
  activeChatId?: string | null;
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
  const barRef = useRef<HTMLDivElement>(null);
  useToolbarDividerAlignment(barRef, dividerVisible ?? (layout === "split" && showAtelier));
  const [windowMenu, setWindowMenu] = useState(false);
  return (
    <div ref={barRef} className="topbar" data-tauri-drag-region>
      <div className="topbar-start" data-tauri-drag-region>
      {onSelectChat && onNewChat && (chats.length > 0 || activeProject) ? (
        <ProjectChatTabs controls={chatTabControls} chats={chats} activeId={activeChatId} onSelect={onSelectChat} onNew={onNewChat} />
      ) : chatTitle ? <span className="topbar-chat-title">{chatTitle}</span> : null}
      <ChatHeaderSlot />
      </div>
      {/* Center follows the actual chat/atelier divider, not a fixed grid ratio. */}
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
        <TopBarTabs allTabsMenu tabs={tabs} activeTab={activeTab} onSelectTab={onSelectTab} onCloseTab={onCloseTab} />
        <WorkspacePaneMenuSlot />
        <span className="flex" />
        <div className="topbar-window-overflow">
          <LazyDropdownMenu open={windowMenu} onOpenChange={setWindowMenu} align="end"
            label={t("action.more")}
            trigger={<IconButton label={t("action.more")} aria-haspopup="menu" aria-expanded={windowMenu}>…</IconButton>}
            items={[
              {key:"surfaces", label:t("topbar.surfaces"), children:buildTargets({activeSurface, showAtelier, ideActive, showExplorer, showAnnots, onSelectSurface, onSelectIde, onToggleExplorer, onToggleAnnots}).map(target => ({key:target.id,label:target.label,onSelect:target.onSelect}))},
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
