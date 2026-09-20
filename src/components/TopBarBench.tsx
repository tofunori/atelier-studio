import { useOpenChatTabs } from "../hooks/useOpenChatTabs";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TopBar from "./TopBar";
import { ChatHeader } from "./chat/ChatHeader";
import { useChatHeaderHost } from "./ChatHeaderSlot";
import { Button } from "./ui";

export function TopBarBench() {
  const [layout, setLayout] = useState<"chat" | "split" | "atelier">("split");
  const [sidebar, setSidebar] = useState(true);
  const [active, setActive] = useState<string | null>("a");
  const host = useChatHeaderHost();
  const chats = [{id:"a",title:"Analyse albédo"},{id:"b",title:"Données Copernicus"},{id:"c",title:"Discussion et conclusions du chapitre"}];
  const chatTabs = useOpenChatTabs("/bench-chats", active, chats);
  const noop = () => {};
  return <>
    <TopBar activeProject="/Chapitre1-Albedo"
      layout={layout} onSetLayout={setLayout}
      onOpenPalette={noop} onQuickAsk={noop} activeSurface="atelier" showAtelier={layout !== "chat"}
      showExplorer={false} showAnnots={false} onToggleExplorer={noop} onToggleAnnots={noop}
      onSelectSurface={noop} onSelectIde={noop} ideActive={true}
      tabs={[{id:"pdf",title:"main_ngeo.pdf",kind:"document"},{id:"tex",title:"discussion_en.tex",kind:"document"}]}
      activeTab="tex" onSelectTab={noop} onCloseTab={noop}
      chatTabControls={{openChats:chatTabs.openChats,pinnedIds:chatTabs.pinnedIds,onTogglePin:chatTabs.togglePin,onClose:ids=>setActive(chatTabs.close(ids))}}
      chats={chats} activeChatId={active} onSelectChat={setActive} onNewChat={noop} />
    {host && createPortal(<ChatHeader compact title={chats.find(chat => chat.id === active)?.title ?? ""}
      provider="codex" projectName="Chapitre1-Albedo" status={null} onTranscriptViewChange={noop} />, host)}
    <div className="app-row">
      <div style={{width:sidebar ? 300 : 48,flexShrink:0}}>
        <Button onClick={() => setSidebar(!sidebar)}>Sidebar</Button>
      </div>
      <div className="main-card">
        <PanelGroup direction="horizontal" className="app">
          <Panel id="chat" order={1} defaultSize={50} minSize={layout === "atelier" ? 0 : 30} style={{display:layout === "atelier" ? "none" : undefined}}>
            <p>Chat : {active}</p>
          </Panel>
          {layout !== "chat" && <><PanelResizeHandle id="chat-atelier-divider" className="handle" />
            <Panel id="atelier" order={2} minSize={20}><p>Discussion</p></Panel></>}
        </PanelGroup>
      </div>
    </div>
  </>;
}
