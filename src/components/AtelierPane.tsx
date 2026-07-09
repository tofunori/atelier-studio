import { useEffect, useState } from "react";
import Explorer from "./Explorer";
import BrowserTab from "./BrowserTab";
import GitSurface from "./GitSurface";
import TerminalSurface from "./TerminalSurface";
import BiblioSurface from "./BiblioSurface";
import GeneratorSurface from "./GeneratorSurface";
import { t } from "../lib/i18n";
import { CloseIcon } from "./icons";
import type { Surface } from "./surfaces";

type Tab = { id: string; url: string; title: string; color?: string; pinned?: boolean; kind?: "term"; cwd?: string };
const TAB_COLORS = ["#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6", "#22b07d", "#e0b74a"];

export default function AtelierPane({
  url,
  projectRoot,
  activeThreadId,
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
  showExplorer,
  recentFiles,
  onOpenExplorer,
}: {
  url: string;
  projectRoot: string;
  activeThreadId: string | null;
  tabs: Tab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  reloadKey: number;
  showExplorer: boolean;
  files: string[];
  recentFiles: string[];
  onOpenExplorer: () => void;
  onOpenFile: (rel: string) => void;
  onPinTab: (id: string) => void;
  onColorTab: (id: string, color?: string) => void;
  onReorderTabs: (ids: string[]) => void;
  ws: WebSocket | null;
  layout: "split" | "chat" | "atelier";
  onToggleExpand: () => void;
}) {
  const [surface, setSurface] = useState<Surface>("atelier");
  // split 2 panes : surface secondaire + largeur (%) du pane primaire, par projet
  const splitKey = `atelier-studio.split.${projectRoot}`;
  const [second, setSecond] = useState<Surface | null>(() => {
    try { return (JSON.parse(localStorage.getItem(splitKey) ?? "{}").second ?? null); }
    catch { return null; }
  });
  const [pct, setPct] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem(splitKey) ?? "{}").pct ?? 50; }
    catch { return 50; }
  });
  const [dragSurf, setDragSurf] = useState<Surface | null>(null);
  const [dropHint, setDropHint] = useState<"left" | "right" | null>(null);
  useEffect(() => {
    localStorage.setItem(splitKey, JSON.stringify({ second, pct }));
  }, [second, pct, splitKey]);
  useEffect(() => {
    const onSwitch = (e: Event) => {
      const s = (e as CustomEvent).detail?.surface;
      if (s) switchSurface(s);
    };
    window.addEventListener("switch-surface", onSwitch);
    return () => window.removeEventListener("switch-surface", onSwitch);
  });
  const [visited, setVisited] = useState<Set<Surface>>(new Set(["atelier"]));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  useEffect(() => {
    setGalleryLoaded(false);
  }, [url, reloadKey]);

  // prévenir l'iframe de l'onglet qui devient actif : les onglets sont montrés/
  // cachés en display:none, ce qu'un iframe ne peut pas détecter (ni
  // visibilitychange ni IntersectionObserver). L'éditeur LaTeX s'en sert pour
  // caler le PDF sur la ligne du curseur (synctex) au retour sur l'onglet PDF.
  useEffect(() => {
    const sel = `iframe.atelier[data-atelier-tab="${CSS.escape(activeTab)}"]`;
    const f = document.querySelector(sel) as HTMLIFrameElement | null;
    f?.contentWindow?.postMessage({ type: "atelier-tab-activated" }, "*");
  }, [activeTab]);

  function switchSurface(s: Surface) {
    if (s === second) {
      // cliquer la pilule de la surface secondaire : échanger les panes
      setSecond(surface);
    }
    setSurface(s);
    setVisited((v) => new Set(v).add(s));
  }
  function openSecond(s: Surface) {
    setVisited((v) => new Set(v).add(s));
    if (s === surface) return; // déjà en primaire
    setSecond(s);
  }
  const shown = (id: Surface) => id === surface || id === second;
  function slotStyle(id: Surface): React.CSSProperties {
    if (!shown(id)) return { display: "none" };
    const isPrimary = id === surface;
    return {
      display: "flex",
      order: isPrimary ? 0 : 2,
      flex: second ? `0 0 calc(${isPrimary ? pct : 100 - pct}% - 2px)` : "1 1 auto",
      minWidth: 0,
      minHeight: 0,
    };
  }
  function startDivider(e: React.MouseEvent) {
    e.preventDefault();
    const row = (e.currentTarget.parentElement as HTMLElement);
    const rect = row.getBoundingClientRect();
    document.body.classList.add("dragging");
    const move = (ev: MouseEvent) => {
      const p = ((ev.clientX - rect.left) / rect.width) * 100;
      setPct(Math.min(80, Math.max(20, p)));
    };
    const up = () => {
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
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

  return (
    <div className="atelier-wrap">
      {/* plus de barre d'outils de surface : bascule des surfaces dans le rail,
          explorateur togglé depuis le rail, reload/ouvrir dans la TopBar. */}

      <div className="pane-row">
      <div className="pane-surfaces" style={{ flexDirection: "row" }}>
      {/* ---- surface Atelier : galerie + onglets fichiers ---- */}
      <div className="surface-body pane-slot" style={slotStyle("atelier")}>
        <div className="atelier-bar">
          <button className={`atab atab-gallery ${activeTab === "gallery" ? "on" : ""}`}
            onClick={() => onSelectTab("gallery")} title={t("atelier.gallery")} aria-label={t("atelier.gallery")}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2.5" width="12" height="11" rx="2.2" />
              <circle cx="5.6" cy="6" r="1.15" />
              <path d="M2.6 11.4 6 8l2.2 2.1L10.7 7.4l2.7 2.9" />
            </svg>
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
              <span className="atab-x" onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}>
                <CloseIcon />
              </span>
            </button>
          ))}
        </div>
        <div className="atelier-split">
        <div className="atelier-body">
          {/* écran d'accueil IDE : montré par le bouton IDE du rail quand aucun
              fichier n'est ouvert (onglet sentinelle "ide") — récents + explorateur */}
          {activeTab === "ide" && (
            <div className="ide-home">
              <svg width="30" height="30" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 5 3 8l2.5 3M10.5 5 13 8l-2.5 3M8.8 3.5 7.2 12.5" />
              </svg>
              <div className="ide-home-title">{t("ide.empty-title")}</div>
              <div className="ide-home-sub">{t("ide.empty-sub")}</div>
              {recentFiles.length > 0 && (
                <div className="ide-home-recents">
                  <div className="ide-home-label">{t("ide.recent")}</div>
                  {recentFiles.map((rel) => (
                    <button key={rel} className="ide-home-file" onClick={() => onOpenFile(rel)} title={rel}>
                      <span className="ide-home-name">{rel.split("/").pop()}</span>
                      {rel.includes("/") && <span className="ide-home-dir">{rel.split("/").slice(0, -1).join("/")}</span>}
                    </button>
                  ))}
                </div>
              )}
              {!showExplorer && (
                <button className="ide-home-browse" onClick={onOpenExplorer}>{t("ide.browse")}</button>
              )}
            </div>
          )}
          {activeTab === "gallery" && !galleryLoaded && (
            <div className="atelier-skeleton">
              <div className="atelier-skeleton-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} />
                ))}
              </div>
              <div className="atelier-skeleton-text">{t("atelier.loading")}</div>
            </div>
          )}
          {url && (
            <iframe
              key={reloadKey}
              className="atelier"
              style={{ display: activeTab === "gallery" && galleryLoaded ? "block" : "none" }}
              src={url}
              title="atelier"
              onLoad={() => setGalleryLoaded(true)}
            />
          )}
          {tabs.filter((t) => t.kind !== "term").map((t) => (
            <iframe
              key={t.id}
              data-atelier-tab={t.id}
              className="atelier"
              style={{ display: activeTab === t.id ? "block" : "none" }}
              src={t.url}
              title={t.title}
            />
          ))}
        </div>
        </div>
      </div>

      {/* ---- surface Browser ---- */}
      {visited.has("browser") && (
        <div className="pane-slot" style={slotStyle("browser")}>
          <BrowserTab tabId="main-browser" visible={shown("browser")} onTitle={() => {}} />
        </div>
      )}

      {/* ---- surface Terminal ---- */}
      {visited.has("terminal") && (
        <div className="pane-slot" style={slotStyle("terminal")}>
          <TerminalSurface ws={ws} cwd={projectRoot} visible={shown("terminal")} />
        </div>
      )}

      {/* ---- surface Git ---- */}
      {visited.has("git") && (
        <div className="surface-body pane-slot" style={slotStyle("git")}>
          <GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={activeThreadId} />
        </div>
      )}

      {/* ---- surface Bibliothèque ---- */}
      {visited.has("biblio") && (
        <div className="surface-body pane-slot" style={slotStyle("biblio")}>
          <BiblioSurface ws={ws} projectRoot={projectRoot} galleryUrl={url} />
        </div>
      )}

      {/* ---- surface Générateur ---- */}
      {visited.has("generateur") && (
        <div className="surface-body pane-slot" style={slotStyle("generateur")}>
          <GeneratorSurface ws={ws} projectRoot={projectRoot} galleryUrl={url} />
        </div>
      )}

      {second && <div className="pane-divider" style={{ order: 1 }} onMouseDown={startDivider} />}
      {second && (
        <button className="pane-close" title={t("action.close")}
          onClick={() => setSecond(null)}>
          <CloseIcon size={11} />
        </button>
      )}

      {dragSurf && (
        <div className="drop-overlay">
          <div
            className={`drop-zone ${dropHint === "left" ? "hot" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDropHint("left"); }}
            onDragLeave={() => setDropHint((h) => (h === "left" ? null : h))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragSurf) { setVisited((v) => new Set(v).add(dragSurf)); setSurface(dragSurf); if (second === dragSurf) setSecond(null); }
              setDragSurf(null); setDropHint(null);
            }}
          />
          <div
            className={`drop-zone ${dropHint === "right" ? "hot" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDropHint("right"); }}
            onDragLeave={() => setDropHint((h) => (h === "right" ? null : h))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragSurf) openSecond(dragSurf);
              setDragSurf(null); setDropHint(null);
            }}
          />
        </div>
      )}
      </div>
      {showExplorer && <Explorer files={files} onOpen={onOpenFile} />}
      </div>

      {tabMenu && (
        <div className="ctx-menu" style={{ left: tabMenu.x, top: tabMenu.y, position: "fixed", zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}>
          <div onClick={() => { onPinTab(tabMenu.id); setTabMenu(null); }}>
            {tabs.find((t) => t.id === tabMenu.id)?.pinned ? t("action.unpin-tab") : t("action.pin-tab")}
          </div>
          <div className="swatches" style={{ padding: "6px 10px" }}>
            {TAB_COLORS.map((col) => (
              <span key={col} className="swatch" style={{ background: col }}
                onClick={() => { onColorTab(tabMenu.id, col); setTabMenu(null); }} />
            ))}
            <span className="swatch none" onClick={() => { onColorTab(tabMenu.id, undefined); setTabMenu(null); }}>∅</span>
          </div>
          <div className="danger" onClick={() => { onCloseTab(tabMenu.id); setTabMenu(null); }}>
            {t("action.close-tab")}
          </div>
        </div>
      )}
    </div>
  );
}
