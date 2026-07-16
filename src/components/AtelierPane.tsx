import { useEffect, useState } from "react";
import Explorer from "./Explorer";
const BrowserTab = lazyWithRetry(() => import("./BrowserTab"));
const GitSurface = lazyWithRetry(() => import("./GitSurface"));
// xterm (~350 KB min) hors de l'entrée : chargé à la PREMIÈRE visite du
// terminal, puis reste monté (visited) — cycle de vie inchangé (plan 022)
const TerminalSurface = lazyWithRetry(() => import("./TerminalSurface"));
import { LazyBoundary, lazyWithRetry } from "./LazyBoundary";
const BiblioSurface = lazyWithRetry(() => import("./BiblioSurface"));
const GeneratorSurface = lazyWithRetry(() => import("./GeneratorSurface"));
const NarvalSurface = lazyWithRetry(() => import("./NarvalSurface"));
import { t } from "../lib/i18n";
import { CloseIcon, HomeIcon, RefreshIcon } from "./icons";
import { DocumentTabMeta } from "./AtelierHeaders";
import { GallerySkeleton } from "./GallerySkeleton";
import { Button, IconButton, RowButton, Tab, TabList } from "./ui";
import { AgentDetailPanel, AgentGlyph, type AgentDisplay } from "./chat/AgentActivity";
import type { AgentEvent } from "../lib/ws";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./shadcn/context-menu";
import type { Surface } from "./surfaces";

type Tab = { id: string; url: string; title: string; color?: string; pinned?: boolean; kind?: "term"; cwd?: string; projectRoot?: string };
const TAB_COLORS = ["#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6", "#22b07d", "#e0b74a"];

/** Retrouve le chemin projet du fichier d'un onglet (inverse d'openFileTab :
 * pdf_viewer?file=rel, studios/éditeur ?path=abs, image = origin/rel). */
export function relFromTabUrl(url: string, projectRoot: string, baseUrl?: string): string | null {
  try {
    const u = new URL(url);
    // un onglet pointant HORS du serveur galerie du projet (page web externe
    // ouverte via atelier-open-tab) n'a pas de chemin projet
    if (baseUrl) {
      try {
        if (u.origin !== new URL(baseUrl).origin) return null;
      } catch { /* baseUrl invalide → pas de filtre */ }
    }
    const page = u.pathname.split("/").pop() ?? "";
    if (page === "pdf_viewer.html" || page === "svg_viewer.html") return u.searchParams.get("file");
    if (page.endsWith("_studio.html") || page === "code_editor.html") {
      const abs = u.searchParams.get("path");
      if (!abs) return null;
      const root = projectRoot.endsWith("/") ? projectRoot : `${projectRoot}/`;
      return abs.startsWith(root) ? abs.slice(root.length) : abs;
    }
    // pages internes de la galerie sans fichier associé
    if (u.pathname.startsWith("/.fig_thumbs/")) return null;
    const rel = decodeURIComponent(u.pathname.replace(/^\//, ""));
    return rel || null;
  } catch {
    return null;
  }
}

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
  onGalleryReload,
  onInspectFile,
  agent,
  agentEvents,
  onCloseAgent,
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
  /** compatibilité appelant : le projet est déjà affiché dans la TopBar */
  projectName?: string | null;
  onGalleryReload?: () => void;
  /** ouvre l'inspecteur de contexte sur le fichier d'un onglet */
  onInspectFile?: (rel: string) => void;
  /** Sous-agent Codex actuellement inspecté, rendu comme un onglet Atelier. */
  agent?: AgentDisplay | null;
  /** Transcript du rollout du sous-agent actuellement inspecté. */
  agentEvents?: AgentEvent[];
  onCloseAgent?: () => void;
}) {
  const [surface, setSurface] = useState<Surface>("atelier");
  const [terminalBootstrap, setTerminalBootstrap] = useState<string | null>(null);
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
  function openNarvalTerminal(command: string) {
    setTerminalBootstrap(command);
    switchSurface("terminal");
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

  const documentTabs = tabs.filter((tab) => tab.kind !== "term");
  const agentTabId = agent ? `agent:${agent.threadId}` : null;
  const activeDocument = documentTabs.find((tab) => tab.id === activeTab);
  const activeDocumentRel = activeDocument
    ? relFromTabUrl(activeDocument.url, projectRoot, url)
    : null;
  // Signal explicite : dans WKWebView, self/top n'est pas un contrat assez
  // fiable pour décider si la Gallery doit masquer son chrome et router les
  // fichiers vers les onglets Atelier.
  let gallerySrc = url;
  try {
    const embedded = new URL(url);
    embedded.searchParams.set("embedded", "atelier");
    gallerySrc = embedded.toString();
  } catch { /* URL vide pendant le démarrage */ }

  return (
    <div className="atelier-wrap">
      {/* plus de barre d'outils de surface : bascule des surfaces dans le rail,
          explorateur togglé depuis le rail, reload/ouvrir dans la TopBar. */}

      <div className="pane-row">
      <div className="pane-surfaces" style={{ flexDirection: "row" }}>
      {/* ---- surface Atelier : galerie + onglets fichiers ---- */}
      <div className="surface-body pane-slot" style={slotStyle("atelier")}>
        {/* Header unique Gallery / IDE : le bouton de contexte change d'icône,
            mais les onglets de documents restent toujours accessibles. */}
        <TabList className="atelier-bar">
          <Tab
            compact
            active={activeTab === "gallery"}
            className="atelier-home"
            label={t("atelier.gallery")}
            icon={<HomeIcon size={15} />}
            onClick={() => onSelectTab("gallery")}
            title={t("atelier.gallery")}
          />
          {documentTabs.map((tab) => {
            const rel = tab.kind !== "term" ? relFromTabUrl(tab.url, projectRoot, url) : null;
            return (
              <ContextMenu key={tab.id}>
                <ContextMenuTrigger
                  render={
                    <Tab
                      active={activeTab === tab.id}
                      label={tab.title}
                      closeLabel={`Fermer ${tab.title}`}
                      closeIcon={<CloseIcon />}
                      onClose={() => onCloseTab(tab.id)}
                      className={overId === tab.id && dragId && dragId !== tab.id ? "drop-target" : ""}
                      onClick={() => onSelectTab(tab.id)}
                      draggable
                      onDragStart={(e) => { setDragId(tab.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragOver={(e) => { e.preventDefault(); setOverId(tab.id); }}
                      onDragLeave={() => setOverId((o) => (o === tab.id ? null : o))}
                      onDrop={(e) => { e.preventDefault(); dropOn(tab.id); }}
                      onDragEnd={() => { setDragId(null); setOverId(null); }}
                      title={tab.title}
                    >
                      {tab.color && <span className="atab-dot" style={{ background: tab.color }} />}
                      {tab.pinned && <span className="atab-pin">⌖</span>}
                      {tab.title}
                    </Tab>
                  }
                />
                <ContextMenuContent className="tw:min-w-48">
                  <ContextMenuItem onClick={() => onPinTab(tab.id)}>
                    {tab.pinned ? t("action.unpin-tab") : t("action.pin-tab")}
                  </ContextMenuItem>
                  {onInspectFile && rel && (
                    <ContextMenuItem onClick={() => {
                      onSelectTab(tab.id);
                      onInspectFile(rel);
                    }}>
                      {t("inspector.open")}
                    </ContextMenuItem>
                  )}
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>{t("settings.group.colors")}</ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      <ContextMenuRadioGroup value={tab.color ?? "none"}>
                        {TAB_COLORS.map((color) => (
                          <ContextMenuRadioItem key={color} value={color} onClick={() => onColorTab(tab.id, color)}>
                            <span className="swatch" style={{ background: color }} aria-hidden="true" />
                            {color.toUpperCase()}
                          </ContextMenuRadioItem>
                        ))}
                        <ContextMenuRadioItem value="none" onClick={() => onColorTab(tab.id, undefined)}>
                          <span className="swatch none" aria-hidden="true">∅</span>
                          {t("sidebar.without-color")}
                        </ContextMenuRadioItem>
                      </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onClick={() => onCloseTab(tab.id)}>
                    {t("action.close-tab")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {agent && agentTabId && (
            <Tab
              active={activeTab === agentTabId}
              label={agent.displayName}
              icon={<AgentGlyph seed={agent.threadId} size={15} />}
              closeLabel={`${t("action.close")} ${agent.displayName}`}
              closeIcon={<CloseIcon />}
              onClose={onCloseAgent}
              onClick={() => onSelectTab(agentTabId)}
              title={agent.displayName}
            >
              {agent.displayName}
            </Tab>
          )}
          <span className="flex" />
          {activeTab === "gallery" && onGalleryReload && (
            <IconButton label={t("action.refresh-hard")} title={t("action.refresh-hard")}
              size="s" onClick={onGalleryReload}>
              <RefreshIcon />
            </IconButton>
          )}
          {activeDocumentRel && (
            <DocumentTabMeta rel={activeDocumentRel} onInspect={onInspectFile} />
          )}
        </TabList>
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
                    <RowButton key={rel} className="ide-home-file" onClick={() => onOpenFile(rel)} title={rel}>
                      <span className="ide-home-name">{rel.split("/").pop()}</span>
                      {rel.includes("/") && <span className="ide-home-dir">{rel.split("/").slice(0, -1).join("/")}</span>}
                    </RowButton>
                  ))}
                </div>
              )}
              {!showExplorer && (
                <Button variant="secondary" className="ide-home-browse" onClick={onOpenExplorer}>{t("ide.browse")}</Button>
              )}
            </div>
          )}
          {activeTab === "gallery" && !galleryLoaded && (
            <GallerySkeleton />
          )}
          {url && (
            <iframe
              key={reloadKey}
              data-atelier-role="gallery"
              data-atelier-ready={galleryLoaded ? "true" : "false"}
              className="atelier"
              style={{ display: activeTab === "gallery" && galleryLoaded ? "block" : "none" }}
              src={gallerySrc}
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
          {agent && agentTabId === activeTab && onCloseAgent && (
            <AgentDetailPanel agent={agent} events={agentEvents} embedded onClose={onCloseAgent} />
          )}
        </div>
        </div>
      </div>

      {/* ---- surface Browser ---- */}
      {visited.has("browser") && (
        <div className="pane-slot" style={slotStyle("browser")}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <BrowserTab tabId="main-browser" visible={shown("browser")} onTitle={() => {}} />
          </LazyBoundary>
        </div>
      )}

      {/* ---- surface Terminal ---- */}
      {visited.has("terminal") && (
        <div className="pane-slot" style={slotStyle("terminal")}>
          <LazyBoundary fallback={<div className="term-cell" />}>
            <TerminalSurface
              ws={ws}
              cwd={projectRoot}
              visible={shown("terminal")}
              bootstrapCommand={terminalBootstrap}
              onBootstrapHandled={() => setTerminalBootstrap(null)}
            />
          </LazyBoundary>
        </div>
      )}

      {/* ---- surface Git ---- */}
      {visited.has("git") && (
        <div className="surface-body pane-slot" style={slotStyle("git")}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <GitSurface ws={ws} projectRoot={projectRoot} activeThreadId={activeThreadId} />
          </LazyBoundary>
        </div>
      )}

      {/* ---- surface Bibliothèque ---- */}
      {visited.has("biblio") && (
        <div className="surface-body pane-slot" style={slotStyle("biblio")}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <BiblioSurface ws={ws} projectRoot={projectRoot} galleryUrl={url} />
          </LazyBoundary>
        </div>
      )}

      {/* ---- surface Générateur ---- */}
      {visited.has("generateur") && (
        <div className="surface-body pane-slot" style={slotStyle("generateur")}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <GeneratorSurface ws={ws} projectRoot={projectRoot} galleryUrl={url} />
          </LazyBoundary>
        </div>
      )}

      {/* ---- surface Narval / Slurm (lecture seule) ---- */}
      {visited.has("narval") && (
        <div className="surface-body pane-slot" style={slotStyle("narval")}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <NarvalSurface
              visible={shown("narval")}
              onOpenTerminal={openNarvalTerminal}
            />
          </LazyBoundary>
        </div>
      )}

      {second && <div className="pane-divider" style={{ order: 1 }} onMouseDown={startDivider} />}
      {second && (
        <IconButton size="s" className="pane-close" label={t("action.close")} title={t("action.close")}
          onClick={() => setSecond(null)}>
          <CloseIcon size={11} />
        </IconButton>
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

    </div>
  );
}
