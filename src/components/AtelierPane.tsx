import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EllipsisIcon, GripVerticalIcon } from "lucide-react";
import Explorer from "./Explorer";
const BrowserTab = lazyWithRetry(() => import("./BrowserTab"));
const KnowledgeSurface = lazyWithRetry(() => import("./KnowledgeSurface"));
const GitSurface = lazyWithRetry(() => import("./GitSurface"));
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
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./shadcn/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./shadcn/dropdown-menu";
import { SURFACES, type Surface } from "./surfaces";
import {
  activateWorkspaceTab,
  closeWorkspaceTab,
  externalTabId,
  listWorkspacePanes,
  loadWorkspaceLayout,
  placeWorkspaceTab,
  reconcileWorkspaceLayout,
  resizeWorkspaceSplit,
  saveWorkspaceLayout,
  setActiveWorkspaceTab,
  workspaceDropPreviewRect,
  workspaceDropZoneAtPoint,
  workspaceTabId,
  type WorkspaceDropZone,
  type WorkspaceLayout,
  type WorkspaceNode,
  type WorkspacePaneNode,
  type WorkspaceTabRef,
} from "../lib/workspaceLayout";
import {
  dispatchWorkspacePointerDragStart,
  markWorkspacePointerDragActivated,
  shouldSuppressWorkspaceSourceClick,
  WORKSPACE_POINTER_DRAG_START,
  type WorkspacePointerDragStartDetail,
} from "../lib/workspaceDrag";

export type AtelierTab = {
  id: string;
  url: string;
  title: string;
  color?: string;
  pinned?: boolean;
  kind?: "term";
  cwd?: string;
  projectRoot?: string;
};

const TAB_COLORS = ["#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6", "#22b07d", "#e0b74a"];
const EMPTY_TITLE = "Workspace";
const NOOP_SURFACE_CHANGE = (_surface: Surface) => {};

type PaneBounds = { left: number; top: number; width: number; height: number };
type DropTarget = { paneId: string; zone: WorkspaceDropZone; preview: PaneBounds };
type DragState = { ref: WorkspaceTabRef; clientX: number; clientY: number; target: DropTarget | null } | null;
type PointerDragSession = {
  ref: WorkspaceTabRef;
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  active: boolean;
  target: DropTarget | null;
};

/** Retrouve le chemin projet du fichier d'un onglet (inverse d'openFileTab). */
export function relFromTabUrl(url: string, projectRoot: string, baseUrl?: string): string | null {
  try {
    const parsed = new URL(url);
    if (baseUrl) {
      try {
        if (parsed.origin !== new URL(baseUrl).origin) return null;
      } catch { /* baseUrl invalide → pas de filtre */ }
    }
    const page = parsed.pathname.split("/").pop() ?? "";
    if (page === "pdf_viewer.html" || page === "svg_viewer.html") return parsed.searchParams.get("file");
    if (page.endsWith("_studio.html") || page === "code_editor.html") {
      const absolute = parsed.searchParams.get("path");
      if (!absolute) return null;
      const root = projectRoot.endsWith("/") ? projectRoot : `${projectRoot}/`;
      return absolute.startsWith(root) ? absolute.slice(root.length) : absolute;
    }
    if (parsed.pathname.startsWith("/.fig_thumbs/")) return null;
    const relative = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return relative || null;
  } catch {
    return null;
  }
}

function surfaceLabel(surface: Surface): string {
  if (surface === "atelier") return t("atelier.gallery");
  const entry = SURFACES.find((candidate) => candidate.id === surface);
  return entry ? t(entry.labelKey) : surface;
}

function surfaceIcon(surface: Surface) {
  return SURFACES.find((candidate) => candidate.id === surface)?.icon ?? null;
}

function ownsNativeChrome(ref: WorkspaceTabRef | null): boolean {
  return ref?.kind === "surface" && ref.surface !== "atelier";
}

function integratesPaneControls(ref: WorkspaceTabRef | null): boolean {
  return ref?.kind === "surface"
    && ["terminal", "browser", "biblio", "connaissances"].includes(ref.surface);
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
  onActiveSurfaceChange = NOOP_SURFACE_CHANGE,
  reloadKey,
  showExplorer,
  layout,
  onToggleExpand,
  recentFiles,
  onOpenExplorer,
  onGalleryReload,
  onInspectFile,
  kbBinding,
  kbThreadTitle,
  agent,
  agentEvents,
  onCloseAgent,
}: {
  url: string;
  projectRoot: string;
  activeThreadId: string | null;
  tabs: AtelierTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onActiveSurfaceChange?: (surface: Surface) => void;
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
  projectName?: string | null;
  onGalleryReload?: () => void;
  onInspectFile?: (rel: string) => void;
  kbBinding?: import("../lib/kbSources").KbBinding | null;
  kbThreadTitle?: string;
  agent?: AgentDisplay | null;
  agentEvents?: AgentEvent[];
  onCloseAgent?: () => void;
}) {
  const documentTabs = useMemo(() => tabs.filter((tab) => tab.kind !== "term"), [tabs]);
  const documentIdsKey = useMemo(() => documentTabs.map((tab) => tab.id).join("\u0000"), [documentTabs]);
  const documentIds = useMemo(
    () => documentIdsKey ? documentIdsKey.split("\u0000") : [],
    [documentIdsKey],
  );
  const documentById = useMemo(() => new Map(documentTabs.map((tab) => [tab.id, tab])), [documentTabs]);
  const [workspace, setWorkspace] = useState<WorkspaceLayout>(() =>
    loadWorkspaceLayout(localStorage, projectRoot, documentIds, activeTab));
  const [terminalBootstrap, setTerminalBootstrap] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const [paneBounds, setPaneBounds] = useState<Record<string, PaneBounds>>({});
  const workspaceRootRef = useRef<HTMLDivElement | null>(null);
  const pointerDragRef = useRef<PointerDragSession | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingFlipRef = useRef<Map<string, DOMRect> | null>(null);
  const dropPreviewRef = useRef<HTMLDivElement | null>(null);
  const previousPreviewRef = useRef<PaneBounds | null>(null);

  const measurePaneBounds = useCallback(() => {
    const rootElement = workspaceRootRef.current;
    if (!rootElement) return;
    const rootRect = rootElement.getBoundingClientRect();
    const next: Record<string, PaneBounds> = {};
    for (const body of rootElement.querySelectorAll<HTMLElement>("[data-workspace-pane-body]")) {
      const paneId = body.dataset.workspacePaneBody;
      if (!paneId) continue;
      const rect = body.getBoundingClientRect();
      next[paneId] = {
        left: rect.left - rootRect.left,
        top: rect.top - rootRect.top,
        width: rect.width,
        height: rect.height,
      };
    }
    setPaneBounds((current) => {
      const currentIds = Object.keys(current);
      const nextIds = Object.keys(next);
      if (
        currentIds.length === nextIds.length
        && nextIds.every((id) => {
          const previous = current[id];
          const measured = next[id];
          return previous
            && previous.left === measured.left
            && previous.top === measured.top
            && previous.width === measured.width
            && previous.height === measured.height;
        })
      ) return current;
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const rootElement = workspaceRootRef.current;
    if (!rootElement) return;
    measurePaneBounds();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measurePaneBounds);
    observer?.observe(rootElement);
    for (const body of rootElement.querySelectorAll<HTMLElement>("[data-workspace-pane-body]")) {
      observer?.observe(body);
    }
    window.addEventListener("resize", measurePaneBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measurePaneBounds);
    };
  }, [measurePaneBounds, workspace.root]);

  useEffect(() => {
    setGalleryLoaded(false);
  }, [url, reloadKey]);

  useLayoutEffect(() => {
    setWorkspace((current) => reconcileWorkspaceLayout(
      current,
      documentIds,
      activeTab,
      agent?.threadId ?? null,
    ));
  }, [activeTab, agent?.threadId, documentIds]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveWorkspaceLayout(localStorage, projectRoot, workspace), 120);
    return () => window.clearTimeout(timer);
  }, [projectRoot, workspace]);

  useEffect(() => {
    const orderedIds = listWorkspacePanes(workspace.root)
      .flatMap((current) => current.tabs)
      .filter((tab): tab is Extract<WorkspaceTabRef, { kind: "document" }> => tab.kind === "document")
      .map((tab) => tab.tabId);
    if (orderedIds.length !== documentIds.length) return;
    if (orderedIds.every((id, index) => id === documentIds[index])) return;
    onReorderTabs(orderedIds);
  }, [documentIds, onReorderTabs, workspace.root]);

  useEffect(() => {
    for (const current of listWorkspacePanes(workspace.root)) {
      if (!current.activeTabId?.startsWith("document:")) continue;
      const tabId = current.activeTabId.slice("document:".length);
      const selector = `iframe.atelier[data-atelier-tab="${CSS.escape(tabId)}"]`;
      const frame = document.querySelector(selector) as HTMLIFrameElement | null;
      frame?.contentWindow?.postMessage({ type: "atelier-tab-activated" }, "*");
    }
  }, [workspace]);

  const captureFlipRects = useCallback(() => {
    const snapshot = new Map<string, DOMRect>();
    const root = workspaceRootRef.current;
    if (!root) return snapshot;
    for (const layer of root.querySelectorAll<HTMLElement>(".workspace-content-layer")) {
      if (layer.style.display === "none") continue;
      const key = layer.dataset.workspaceContent;
      const rect = layer.getBoundingClientRect();
      if (key && rect.width > 0 && rect.height > 0) snapshot.set(key, rect);
    }
    return snapshot;
  }, []);

  const updateWorkspaceWithFlip = useCallback((updater: (current: WorkspaceLayout) => WorkspaceLayout) => {
    pendingFlipRef.current = captureFlipRects();
    setWorkspace(updater);
  }, [captureFlipRects]);

  useLayoutEffect(() => {
    const snapshot = pendingFlipRef.current;
    const root = workspaceRootRef.current;
    if (!snapshot || !root) return;
    pendingFlipRef.current = null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (const layer of root.querySelectorAll<HTMLElement>(".workspace-content-layer")) {
      const key = layer.dataset.workspaceContent;
      const previous = key ? snapshot.get(key) : null;
      if (!previous || layer.style.display === "none" || typeof layer.animate !== "function") continue;
      // La page Browser est une child-webview native : elle ne suit pas les
      // transforms CSS. On la laisse converger directement vers ses bounds
      // finales plutôt que d'animer son chrome séparément de la webview.
      if (key === "surface:browser") continue;
      const next = layer.getBoundingClientRect();
      if (next.width <= 0 || next.height <= 0) continue;
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      const sx = previous.width / next.width;
      const sy = previous.height / next.height;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) continue;
      layer.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, opacity: 0.88 },
          { transform: "translate3d(0, 0, 0) scale(1, 1)", opacity: 1 },
        ],
        { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }
  }, [paneBounds]);

  const findDropTarget = useCallback((clientX: number, clientY: number): DropTarget | null => {
    const root = workspaceRootRef.current;
    if (!root) return null;
    const rootRect = root.getBoundingClientRect();
    for (const pane of root.querySelectorAll<HTMLElement>("[data-pane-id]")) {
      const rect = pane.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      const paneId = pane.dataset.paneId;
      if (!paneId) continue;
      const zone = workspaceDropZoneAtPoint(rect, clientX, clientY);
      const preview = workspaceDropPreviewRect(rect, zone);
      return {
        paneId,
        zone,
        preview: {
          left: preview.left - rootRect.left,
          top: preview.top - rootRect.top,
          width: preview.width,
          height: preview.height,
        },
      };
    }
    return null;
  }, []);

  const finishDrag = useCallback(() => {
    if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
    pointerFrameRef.current = null;
    pointerDragRef.current = null;
    previousPreviewRef.current = null;
    setDragState(null);
    document.body.classList.remove("dragging", "workspace-dragging");
  }, []);

  useLayoutEffect(() => {
    const next = dragState?.target?.preview ?? null;
    const element = dropPreviewRef.current;
    const previous = previousPreviewRef.current;
    previousPreviewRef.current = next;
    if (!element || !next || !previous || typeof element.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const sx = previous.width / Math.max(1, next.width);
    const sy = previous.height / Math.max(1, next.height);
    element.animate(
      [
        { transform: `translate3d(${previous.left - next.left}px, ${previous.top - next.top}px, 0) scale(${sx}, ${sy})`, opacity: 0.72 },
        { transform: "translate3d(0, 0, 0) scale(1, 1)", opacity: 1 },
      ],
      { duration: 110, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [dragState?.target]);

  useEffect(() => {
    const onSwitch = (event: Event) => {
      const surface = (event as CustomEvent).detail?.surface as Surface | undefined;
      if (!surface) return;
      setWorkspace((current) => activateWorkspaceTab(current, { kind: "surface", surface }));
    };
    window.addEventListener("switch-surface", onSwitch);
    return () => {
      window.removeEventListener("switch-surface", onSwitch);
    };
  }, []);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<WorkspacePointerDragStartDetail>).detail;
      if (!detail?.ref || pointerDragRef.current) return;
      pointerDragRef.current = {
        ref: detail.ref,
        pointerId: detail.pointerId,
        startX: detail.clientX,
        startY: detail.clientY,
        clientX: detail.clientX,
        clientY: detail.clientY,
        active: false,
        target: null,
      };
    };
    const renderPointerFrame = () => {
      pointerFrameRef.current = null;
      const session = pointerDragRef.current;
      if (!session?.active) return;
      const target = findDropTarget(session.clientX, session.clientY);
      session.target = target;
      setDragState({ ref: session.ref, clientX: session.clientX, clientY: session.clientY, target });
    };
    const onMove = (event: PointerEvent) => {
      const session = pointerDragRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      session.clientX = event.clientX;
      session.clientY = event.clientY;
      if (!session.active && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) >= 6) {
        session.active = true;
        markWorkspacePointerDragActivated(session.ref);
        document.body.classList.add("dragging", "workspace-dragging");
      }
      if (!session.active) return;
      event.preventDefault();
      if (pointerFrameRef.current === null) pointerFrameRef.current = requestAnimationFrame(renderPointerFrame);
    };
    const onEnd = (event: PointerEvent) => {
      const session = pointerDragRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current);
        pointerFrameRef.current = null;
        session.target = findDropTarget(event.clientX, event.clientY);
      }
      if (session.active && session.target) {
        const { ref, target } = session;
        updateWorkspaceWithFlip((current) => placeWorkspaceTab(current, ref, target.paneId, target.zone));
      }
      finishDrag();
    };
    window.addEventListener(WORKSPACE_POINTER_DRAG_START, onStart);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("blur", finishDrag);
    return () => {
      window.removeEventListener(WORKSPACE_POINTER_DRAG_START, onStart);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("blur", finishDrag);
    };
  }, [findDropTarget, finishDrag, updateWorkspaceWithFlip]);

  const selectRef = useCallback((paneId: string, ref: WorkspaceTabRef) => {
    const tabId = workspaceTabId(ref);
    setWorkspace((current) => setActiveWorkspaceTab(current, paneId, tabId));
    if (ref.kind === "surface") {
      onActiveSurfaceChange(ref.surface);
      if (ref.surface === "atelier") onSelectTab("gallery");
      return;
    }
    onActiveSurfaceChange("atelier");
    onSelectTab(externalTabId(ref));
  }, [onActiveSurfaceChange, onSelectTab]);

  const beginPointerDrag = useCallback((event: React.PointerEvent, ref: WorkspaceTabRef) => {
    if (!dispatchWorkspacePointerDragStart(event.nativeEvent, ref)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const splitTab = useCallback((paneId: string, ref: WorkspaceTabRef, zone: "right" | "bottom") => {
    updateWorkspaceWithFlip((current) => placeWorkspaceTab(current, ref, paneId, zone));
  }, [updateWorkspaceWithFlip]);

  const closeRef = useCallback((ref: WorkspaceTabRef) => {
    const id = workspaceTabId(ref);
    updateWorkspaceWithFlip((current) => closeWorkspaceTab(current, id));
    if (ref.kind === "document") onCloseTab(ref.tabId);
    if (ref.kind === "agent") onCloseAgent?.();
  }, [onCloseAgent, onCloseTab, updateWorkspaceWithFlip]);

  const openNarvalTerminal = useCallback((command: string) => {
    setTerminalBootstrap(command);
    setWorkspace((current) => activateWorkspaceTab(current, { kind: "surface", surface: "terminal" }));
    onActiveSurfaceChange("terminal");
  }, [onActiveSurfaceChange]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent).detail?.command;
      if (typeof command === "string" && command.trim()) openNarvalTerminal(command);
    };
    window.addEventListener("atelier-terminal-command", onCommand);
    return () => window.removeEventListener("atelier-terminal-command", onCommand);
  }, [openNarvalTerminal]);

  let gallerySrc = url;
  try {
    const embedded = new URL(url);
    embedded.searchParams.set("embedded", "atelier");
    gallerySrc = embedded.toString();
  } catch { /* URL vide pendant le démarrage */ }

  function tabTitle(ref: WorkspaceTabRef): string {
    if (ref.kind === "document") return documentById.get(ref.tabId)?.title ?? ref.tabId;
    if (ref.kind === "surface") return surfaceLabel(ref.surface);
    if (ref.kind === "agent") return agent?.threadId === ref.threadId ? agent.displayName : t("agent.title");
    return "IDE";
  }

  function renderTab(paneNode: WorkspacePaneNode, ref: WorkspaceTabRef) {
    const id = workspaceTabId(ref);
    const active = paneNode.activeTabId === id;
    const title = tabTitle(ref);
    const documentTab = ref.kind === "document" ? documentById.get(ref.tabId) : null;
    const relative = documentTab ? relFromTabUrl(documentTab.url, projectRoot, url) : null;
    const compact = ref.kind === "surface" && ref.surface === "atelier";
    const icon = ref.kind === "surface"
      ? (ref.surface === "atelier" ? <HomeIcon size={15} /> : surfaceIcon(ref.surface))
      : ref.kind === "agent" && agent?.threadId === ref.threadId
        ? <AgentGlyph seed={agent.threadId} size={15} />
        : undefined;

    return (
      <ContextMenu key={id}>
        <ContextMenuTrigger
          render={
            <Tab
              active={active}
              compact={compact}
              label={title}
              icon={icon}
              closeLabel={`${t("action.close")} ${title}`}
              closeIcon={<CloseIcon />}
              onClose={compact ? undefined : () => closeRef(ref)}
              className={compact ? "atelier-home" : undefined}
              onClick={() => selectRef(paneNode.id, ref)}
              onClickCapture={(event) => {
                if (!shouldSuppressWorkspaceSourceClick(ref)) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest(".ui-tab-close")) return;
                beginPointerDrag(event, ref);
              }}
              title={title}
            >
              {documentTab?.color && <span className="atab-dot" style={{ background: documentTab.color }} />}
              {documentTab?.pinned && <span className="atab-pin">⌖</span>}
              {title}
            </Tab>
          }
        />
        <ContextMenuContent className="tw:min-w-48">
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => splitTab(paneNode.id, ref, "right")}>
              {t("workspace.split-right")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => splitTab(paneNode.id, ref, "bottom")}>
              {t("workspace.split-down")}
            </ContextMenuItem>
            {layout !== "atelier" && (
              <ContextMenuItem onClick={onToggleExpand}>{t("atelier.full")}</ContextMenuItem>
            )}
          </ContextMenuGroup>
          {documentTab && (
            <>
              <ContextMenuSeparator />
              <ContextMenuGroup>
                <ContextMenuItem onClick={() => onPinTab(documentTab.id)}>
                  {documentTab.pinned ? t("action.unpin-tab") : t("action.pin-tab")}
                </ContextMenuItem>
                {onInspectFile && relative && (
                  <ContextMenuItem onClick={() => {
                    selectRef(paneNode.id, ref);
                    onInspectFile(relative);
                  }}>
                    {t("inspector.open")}
                  </ContextMenuItem>
                )}
                <ContextMenuSub>
                  <ContextMenuSubTrigger>{t("settings.group.colors")}</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuRadioGroup value={documentTab.color ?? "none"}>
                      {TAB_COLORS.map((color) => (
                        <ContextMenuRadioItem key={color} value={color} onClick={() => onColorTab(documentTab.id, color)}>
                          <span className="swatch" style={{ background: color }} aria-hidden="true" />
                          {color.toUpperCase()}
                        </ContextMenuRadioItem>
                      ))}
                      <ContextMenuRadioItem value="none" onClick={() => onColorTab(documentTab.id, undefined)}>
                        <span className="swatch none" aria-hidden="true">∅</span>
                        {t("sidebar.without-color")}
                      </ContextMenuRadioItem>
                    </ContextMenuRadioGroup>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </ContextMenuGroup>
            </>
          )}
          {!compact && (
            <>
              <ContextMenuSeparator />
              <ContextMenuGroup>
                <ContextMenuItem variant="destructive" onClick={() => closeRef(ref)}>
                  {t("action.close-tab")}
                </ContextMenuItem>
              </ContextMenuGroup>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  function renderPaneControls(paneNode: WorkspacePaneNode, ref: WorkspaceTabRef, placement: "integrated" | "floating") {
    return (
      <div className={`workspace-pane-controls is-${placement}`} data-pane-controls={placement}>
        <span
          className="workspace-pane-grip"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            beginPointerDrag(event, ref);
          }}
        >
          <IconButton
            className="ghost"
            label={t("workspace.move-pane")}
            title={t("workspace.move-pane")}
            size="s"
          >
            <GripVerticalIcon />
          </IconButton>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(
              <IconButton
                className="ghost"
                label={t("workspace.pane-actions")}
                title={t("workspace.pane-actions")}
                size="s"
              >
                <EllipsisIcon />
              </IconButton>
            )}
          />
          <DropdownMenuContent align="end" sideOffset={5}>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => splitTab(paneNode.id, ref, "right")}>
                {t("workspace.split-right")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => splitTab(paneNode.id, ref, "bottom")}>
                {t("workspace.split-down")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {paneNode.tabs.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("workspace.pane-tabs")}</DropdownMenuLabel>
                  {paneNode.tabs
                    .filter((candidate) => workspaceTabId(candidate) !== workspaceTabId(ref))
                    .map((candidate) => (
                      <DropdownMenuItem
                        key={workspaceTabId(candidate)}
                        onClick={() => selectRef(paneNode.id, candidate)}
                      >
                        {tabTitle(candidate)}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={() => closeRef(ref)}>
                {t("workspace.close-pane")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton
          className="ghost workspace-pane-close"
          label={t("workspace.close-pane")}
          title={t("workspace.close-pane")}
          size="s"
          onClick={() => closeRef(ref)}
        >
          <CloseIcon />
        </IconButton>
      </div>
    );
  }

  function renderIdeHome() {
    return (
      <div className="ide-home">
        <svg width="30" height="30" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 5 3 8l2.5 3M10.5 5 13 8l-2.5 3M8.8 3.5 7.2 12.5" />
        </svg>
        <div className="ide-home-title">{t("ide.empty-title")}</div>
        <div className="ide-home-sub">{t("ide.empty-sub")}</div>
        {recentFiles.length > 0 && (
          <div className="ide-home-recents">
            <div className="ide-home-label">{t("ide.recent")}</div>
            {recentFiles.map((relative) => (
              <RowButton key={relative} className="ide-home-file" onClick={() => onOpenFile(relative)} title={relative}>
                <span className="ide-home-name">{relative.split("/").pop()}</span>
                {relative.includes("/") && <span className="ide-home-dir">{relative.split("/").slice(0, -1).join("/")}</span>}
              </RowButton>
            ))}
          </div>
        )}
        {!showExplorer && (
          <Button variant="secondary" className="ide-home-browse" onClick={onOpenExplorer}>{t("ide.browse")}</Button>
        )}
      </div>
    );
  }

  function renderContent(paneNode: WorkspacePaneNode, ref: WorkspaceTabRef, active: boolean) {
    const display = active ? "flex" : "none";
    if (ref.kind === "document") {
      const current = documentById.get(ref.tabId);
      if (!current) return null;
      return (
        <iframe
          key={workspaceTabId(ref)}
          data-atelier-tab={current.id}
          className="atelier workspace-tab-content"
          style={{ display: active ? "block" : "none" }}
          src={current.url}
          title={current.title}
        />
      );
    }
    if (ref.kind === "ide") return <div key="ide" className="workspace-tab-content" style={{ display }}>{renderIdeHome()}</div>;
    if (ref.kind === "agent") {
      if (!agent || agent.threadId !== ref.threadId || !onCloseAgent) return null;
      return (
        <div key={workspaceTabId(ref)} className="workspace-tab-content" style={{ display }}>
          <AgentDetailPanel agent={agent} events={agentEvents} embedded onClose={onCloseAgent} />
        </div>
      );
    }
    if (ref.surface === "atelier") {
      return (
        <div key="surface:atelier" className="workspace-tab-content" style={{ display }}>
          {active && !galleryLoaded && <GallerySkeleton />}
          {url && (
            <iframe
              key={reloadKey}
              data-atelier-role="gallery"
              data-atelier-ready={galleryLoaded ? "true" : "false"}
              className="atelier"
              style={{ display: active && galleryLoaded ? "block" : "none" }}
              src={gallerySrc}
              title="atelier"
              onLoad={() => setGalleryLoaded(true)}
            />
          )}
        </div>
      );
    }
    if (ref.surface === "browser") {
      return (
        <div key="surface:browser" className="workspace-tab-content" style={{ display }}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <BrowserTab
              tabId="main-browser"
              visible={active}
              onTitle={() => {}}
              paneControls={renderPaneControls(paneNode, ref, "integrated")}
            />
          </LazyBoundary>
        </div>
      );
    }
    if (ref.surface === "terminal") {
      return (
        <div key="surface:terminal" className="workspace-tab-content" style={{ display }}>
          <LazyBoundary fallback={<div className="term-cell" />}>
            <TerminalSurface
              ws={ws}
              cwd={projectRoot}
              visible={active}
              bootstrapCommand={terminalBootstrap}
              onBootstrapHandled={() => setTerminalBootstrap(null)}
              paneControls={renderPaneControls(paneNode, ref, "integrated")}
            />
          </LazyBoundary>
        </div>
      );
    }
    if (ref.surface === "git") {
      return (
        <div key="surface:git" className="workspace-tab-content surface-body" style={{ display }}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <GitSurface
              ws={ws}
              projectRoot={projectRoot}
              activeThreadId={activeThreadId}
              onRequestExpand={layout === "atelier" ? undefined : onToggleExpand}
            />
          </LazyBoundary>
        </div>
      );
    }
    if (ref.surface === "connaissances") {
      return (
        <div key="surface:connaissances" className="workspace-tab-content surface-body" style={{ display }}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <KnowledgeSurface
              binding={kbBinding ?? null}
              threadTitle={kbThreadTitle ?? ""}
              visible={active}
              paneControls={renderPaneControls(paneNode, ref, "integrated")}
            />
          </LazyBoundary>
        </div>
      );
    }
    if (ref.surface === "biblio") {
      return (
        <div key="surface:biblio" className="workspace-tab-content surface-body" style={{ display }}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <BiblioSurface
              ws={ws}
              projectRoot={projectRoot}
              galleryUrl={url}
              paneControls={renderPaneControls(paneNode, ref, "integrated")}
            />
          </LazyBoundary>
        </div>
      );
    }
    if (ref.surface === "generateur") {
      return (
        <div key="surface:generateur" className="workspace-tab-content surface-body" style={{ display }}>
          <LazyBoundary fallback={<div className="pane-slot" />}>
            <GeneratorSurface ws={ws} projectRoot={projectRoot} galleryUrl={url} />
          </LazyBoundary>
        </div>
      );
    }
    return (
      <div key="surface:narval" className="workspace-tab-content surface-body" style={{ display }}>
        <LazyBoundary fallback={<div className="pane-slot" />}>
          <NarvalSurface visible={active} onOpenTerminal={openNarvalTerminal} />
        </LazyBoundary>
      </div>
    );
  }

  function renderPane(paneNode: WorkspacePaneNode) {
    const activeRef = paneNode.tabs.find((ref) => workspaceTabId(ref) === paneNode.activeTabId) ?? null;
    const activeDocument = activeRef?.kind === "document" ? documentById.get(activeRef.tabId) : null;
    const activeRelative = activeDocument ? relFromTabUrl(activeDocument.url, projectRoot, url) : null;
    const nativeChrome = ownsNativeChrome(activeRef);
    const integratedControls = nativeChrome && integratesPaneControls(activeRef);
    return (
      <section
        key={paneNode.id}
        className={`workspace-pane ${workspace.focusedPaneId === paneNode.id ? "is-focused" : ""} ${nativeChrome ? "has-native-chrome" : ""}`}
        data-pane-id={paneNode.id}
        data-pane-chrome={nativeChrome ? "native" : "workspace"}
      >
        {!nativeChrome && (
          <TabList className="atelier-bar workspace-pane-tabs">
            {paneNode.tabs.map((ref) => renderTab(paneNode, ref))}
            <span className="flex" />
            {activeRef?.kind === "surface" && activeRef.surface === "atelier" && onGalleryReload && (
              <IconButton label={t("action.refresh-hard")} title={t("action.refresh-hard")} size="s" onClick={onGalleryReload}>
                <RefreshIcon />
              </IconButton>
            )}
            {activeRelative && <DocumentTabMeta rel={activeRelative} onInspect={onInspectFile} />}
          </TabList>
        )}
        {nativeChrome && activeRef && !integratedControls && renderPaneControls(paneNode, activeRef, "floating")}
        <div className="workspace-pane-body" data-workspace-pane-body={paneNode.id}>
          {paneNode.tabs.length === 0 && (
            <div className="workspace-empty-pane">
              <span>{EMPTY_TITLE}</span>
              <small>{t("workspace.empty")}</small>
            </div>
          )}
        </div>
      </section>
    );
  }

  function startDivider(event: React.MouseEvent, node: Extract<WorkspaceNode, { type: "split" }>) {
    event.preventDefault();
    event.stopPropagation();
    const splitElement = event.currentTarget.parentElement as HTMLElement;
    const bounds = splitElement.getBoundingClientRect();
    document.body.classList.add("dragging");
    const move = (mouseEvent: MouseEvent) => {
      const raw = node.direction === "horizontal"
        ? ((mouseEvent.clientX - bounds.left) / bounds.width) * 100
        : ((mouseEvent.clientY - bounds.top) / bounds.height) * 100;
      setWorkspace((current) => resizeWorkspaceSplit(current, node.id, raw));
    };
    const up = () => {
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function renderNode(node: WorkspaceNode): React.ReactNode {
    if (node.type === "pane") return renderPane(node);
    const firstStyle = { flex: `0 0 calc(${node.ratio}% - 2px)` };
    const secondStyle = { flex: `0 0 calc(${100 - node.ratio}% - 2px)` };
    return (
      <div key={node.id} className={`workspace-split is-${node.direction}`} data-split-id={node.id}>
        <div className="workspace-branch" style={firstStyle}>{renderNode(node.first)}</div>
        <div
          className={`workspace-divider is-${node.direction}`}
          role="separator"
          aria-label={t("workspace.resize-split")}
          aria-orientation={node.direction}
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(node.ratio)}
          tabIndex={0}
          onMouseDown={(event) => startDivider(event, node)}
          onKeyDown={(event) => {
            const decrement = node.direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
            const increment = node.direction === "horizontal" ? "ArrowRight" : "ArrowDown";
            if (event.key !== decrement && event.key !== increment) return;
            event.preventDefault();
            const delta = event.key === decrement ? -5 : 5;
            setWorkspace((current) => resizeWorkspaceSplit(current, node.id, node.ratio + delta));
          }}
        />
        <div className="workspace-branch" style={secondStyle}>{renderNode(node.second)}</div>
      </div>
    );
  }

  const contentPlacements = listWorkspacePanes(workspace.root).flatMap((paneNode) =>
    paneNode.tabs.map((ref) => ({
      paneNode,
      ref,
      active: paneNode.activeTabId === workspaceTabId(ref),
    })),
  );

  return (
    <div className="atelier-wrap modular-workspace">
      <div className="pane-row">
        <div className="workspace-root" ref={workspaceRootRef}>
          {renderNode(workspace.root)}
          <div className="workspace-content-pool" aria-hidden={false}>
            {contentPlacements.map(({ paneNode, ref, active }) => {
              const bounds = paneBounds[paneNode.id];
              return (
                <div
                  key={workspaceTabId(ref)}
                  className="workspace-content-layer"
                  data-workspace-content={workspaceTabId(ref)}
                  data-owner-pane={paneNode.id}
                  style={{
                    display: active && bounds ? "block" : "none",
                    left: bounds?.left ?? 0,
                    top: bounds?.top ?? 0,
                    width: bounds?.width ?? 0,
                    height: bounds?.height ?? 0,
                  }}
                  onMouseDownCapture={() => {
                    if (workspace.focusedPaneId === paneNode.id) return;
                    setWorkspace((current) => ({ ...current, focusedPaneId: paneNode.id }));
                    if (ref.kind === "surface") onActiveSurfaceChange(ref.surface);
                    else onActiveSurfaceChange("atelier");
                  }}
                >
                  {renderContent(paneNode, ref, active)}
                </div>
              );
            })}
          </div>
          {dragState && (
            <div className="workspace-drag-layer" aria-hidden="true">
              <div className="workspace-drag-shield" />
              {dragState.target && (
                <div
                  ref={dropPreviewRef}
                  className={`workspace-drop-preview is-${dragState.target.zone}`}
                  data-drop-zone={dragState.target.zone}
                  style={dragState.target.preview}
                >
                  <span>{t(`workspace.drop-${dragState.target.zone}`)}</span>
                </div>
              )}
              <div
                className="workspace-drag-ghost"
                style={{ transform: `translate3d(${dragState.clientX + 14}px, ${dragState.clientY + 12}px, 0)` }}
              >
                {tabTitle(dragState.ref)}
              </div>
            </div>
          )}
        </div>
        {showExplorer && <Explorer files={files} onOpen={onOpenFile} />}
      </div>
    </div>
  );
}
