import { useState } from "react";
import BiblioSurface from "./BiblioSurface";
import TopBarTabs from "./TopBarTabs";
import { ProjectChatTabs } from "./chat/ProjectChatTabs";

/** Real tab components, isolated from disk/network for layout regression tests. */
export function CompactTabsBench() {
  const [chats, setChats] = useState([
    { id: "a", title: "Placement des figures dans le manuscrit et ses annexes" },
    { id: "b", title: "Bref" },
  ]);
  const [activeChat, setActiveChat] = useState<string | null>("a");
  const [files, setFiles] = useState([
    { id: "tex", title: "methods_en_version_longue_pour_les_annexes.tex" },
    { id: "pdf", title: "a.pdf" },
  ]);
  const [activeFile, setActiveFile] = useState<string | null>("tex");
  return <div style={{ padding: 16, display: "grid", gap: 12, minWidth: 0 }}>
    <ProjectChatTabs chats={chats} activeId={activeChat} onSelect={setActiveChat}
      onNew={() => {}} controls={{ openChats: chats, pinnedIds: [], onTogglePin: () => {},
        onClose: ids => setChats(items => items.filter(item => !ids.includes(item.id))) }} />
    <TopBarTabs tabs={files} activeTab={activeFile} onSelectTab={setActiveFile}
      onCloseTab={id => setFiles(items => items.filter(item => item.id !== id))} />
    <div style={{ height: 420, display: "flex", minWidth: 0 }}>
      <BiblioSurface ws={null} projectRoot="/compact-tabs-bench" galleryUrl="" />
    </div>
  </div>;
}
