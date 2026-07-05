import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import Explorer from "./Explorer";
import BrowserTab from "./BrowserTab";
import TerminalSurface from "./TerminalSurface";

type Tab = { id: string; url: string; title: string; color?: string; pinned?: boolean; kind?: "term"; cwd?: string };
const TAB_COLORS = ["#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6", "#22b07d", "#e0b74a"];

type Surface = "atelier" | "browser" | "terminal";

const SURFACES: { id: Surface; label: string; icon: React.ReactNode }[] = [
  {
    id: "atelier",
    label: "Atelier",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="1.5" y="1.5" width="5.2" height="5.2" rx="1" />
        <rect x="9.3" y="1.5" width="5.2" height="5.2" rx="1" />
        <rect x="1.5" y="9.3" width="5.2" height="5.2" rx="1" />
        <rect x="9.3" y="9.3" width="5.2" height="5.2" rx="1" />
      </svg>
    ),
  },
  {
    id: "browser",
    label: "Browser",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M1.8 8h12.4M8 1.8c2.2 2 2.2 10.4 0 12.4M8 1.8c-2.2 2-2.2 10.4 0 12.4" />
      </svg>
    ),
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2" />
        <path d="M4.5 6l2.2 2-2.2 2M8.5 10.5h3" />
      </svg>
    ),
  },
];

export default function AtelierPane({
  url,
  projectRoot,
  ws,
  files,
  onOpenFile,
  onPinTab,
  onColorTab,
  onReorderTabs,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  reloadKey,
  onHardReload,
  layout,
  onToggleExpand,
}: {
  url: string;
  projectRoot: string;
  tabs: Tab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  reloadKey: number;
  onHardReload: () => void;
  files: string[];
  onOpenFile: (rel: string) => void;
  onPinTab: (id: string) => void;
  onColorTab: (id: string, color?: string) => void;
  onReorderTabs: (ids: string[]) => void;
  ws: WebSocket | null;
  layout: "split" | "chat" | "atelier";
  onToggleExpand: () => void;
}) {
  const [surface, setSurface] = useState<Surface>("atelier");
  const [showExplorer, setShowExplorer] = useState(false);
  const [visited, setVisited] = useState<Set<Surface>>(new Set(["atelier"]));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  function switchSurface(s: Surface) {
    setSurface(s);
    setVisited((v) => new Set(v).add(s));
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = tabs.map((t) => t.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorderTabs(ids);
    setDragId(null);
    setOverId(null);
  }

  useState(() => {
    const close = () => setTabMenu(null);
    window.addEventListener("click", close);
    return undefined;
  });

  const current = tabs.find((t) => t.id === activeTab);

  return (
    <div className="atelier-wrap">
      {/* barre de surfaces façon Synara */}
      <div className="surface-bar">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            className={`surf ${surface === s.id ? "on" : ""}`}
            onClick={() => switchSurface(s.id)}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
        <span className="flex" />
        <button className="ghost" title={layout === "atelier" ? "Restaurer le split (⌘0)" : "Atelier pleine largeur (⌘2)"} onClick={onToggleExpand}>
          {layout === "atelier" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6 2H2v4M10 14h4v-4M2 6l4-4M14 10l-4 4"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 6V2h4M14 10v4h-4M2 2l4.5 4.5M14 14l-4.5-4.5"/></svg>
          )}
        </button>
        {surface === "atelier" && (
          <>
            <button className={`ghost ${showExplorer ? "on" : ""}`} title="Explorateur de fichiers"
              onClick={() => setShowExplorer((v) => !v)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z" />
              </svg>
            </button>
            <button className="ghost" title="Recharger (relance le serveur si mort)" onClick={onHardReload}>↻</button>
            <button className="ghost" title="Ouvrir dans le navigateur" onClick={() => openUrl(current?.url ?? url)}>⧉</button>
          </>
        )}
      </div>

      {/* ---- surface Atelier : galerie + onglets fichiers ---- */}
      <div className="surface-body" style={{ display: surface === "atelier" ? "flex" : "none" }}>
        <div className="atelier-bar">
          <button className={`atab ${activeTab === "gallery" ? "on" : ""}`} onClick={() => onSelectTab("gallery")}>
            galerie
          </button>
          {tabs.filter((t) => t.kind !== "term").map((t) => (
            <button
              key={t.id}
              className={`atab ${activeTab === t.id ? "on" : ""} ${overId === t.id && dragId && dragId !== t.id ? "drop-target" : ""}`}
              onClick={() => onSelectTab(t.id)}
              draggable
              onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); setOverId(t.id); }}
              onDragLeave={() => setOverId((o) => (o === t.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropOn(t.id); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabMenu({ id: t.id, x: e.clientX, y: e.clientY });
              }}
              title={t.title}
            >
              {t.color && <span className="atab-dot" style={{ background: t.color }} />}
              {t.pinned && <span className="atab-pin">⌖</span>}
              <span className="atab-title">{t.title}</span>
              <span className="atab-x" onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}>✕</span>
            </button>
          ))}
        </div>
        <div className="atelier-split">
        <div className="atelier-body">
          <iframe
            key={reloadKey}
            className="atelier"
            style={{ display: activeTab === "gallery" ? "block" : "none" }}
            src={url}
            title="atelier"
          />
          {tabs.filter((t) => t.kind !== "term").map((t) => (
            <iframe
              key={t.id}
              className="atelier"
              style={{ display: activeTab === t.id ? "block" : "none" }}
              src={t.url}
              title={t.title}
            />
          ))}
        </div>
        {showExplorer && <Explorer files={files} onOpen={onOpenFile} />}
        </div>
      </div>

      {/* ---- surface Browser ---- */}
      {visited.has("browser") && (
        <BrowserTab tabId="main-browser" visible={surface === "browser"} onTitle={() => {}} />
      )}

      {/* ---- surface Terminal ---- */}
      {visited.has("terminal") && (
        <TerminalSurface ws={ws} cwd={projectRoot} visible={surface === "terminal"} />
      )}

      {tabMenu && (
        <div className="ctx-menu" style={{ left: tabMenu.x, top: tabMenu.y, position: "fixed", zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}>
          <div onClick={() => { onPinTab(tabMenu.id); setTabMenu(null); }}>
            {tabs.find((t) => t.id === tabMenu.id)?.pinned ? "Désépingler" : "Épingler l'onglet"}
          </div>
          <div className="swatches" style={{ padding: "6px 10px" }}>
            {TAB_COLORS.map((col) => (
              <span key={col} className="swatch" style={{ background: col }}
                onClick={() => { onColorTab(tabMenu.id, col); setTabMenu(null); }} />
            ))}
            <span className="swatch none" onClick={() => { onColorTab(tabMenu.id, undefined); setTabMenu(null); }}>∅</span>
          </div>
          <div className="danger" onClick={() => { onCloseTab(tabMenu.id); setTabMenu(null); }}>
            Fermer
          </div>
        </div>
      )}
    </div>
  );
}
