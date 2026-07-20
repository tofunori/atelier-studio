import type { Surface } from "../components/surfaces";

export const WORKSPACE_LAYOUT_VERSION = 1 as const;
export const WORKSPACE_LAYOUT_PREFIX = "atelier-studio.workspace.v1.";
export const LEGACY_SPLIT_PREFIX = "atelier-studio.split.";

export type WorkspaceDirection = "horizontal" | "vertical";
export type WorkspaceDropZone = "center" | "left" | "right" | "top" | "bottom";
export type WorkspaceRect = { left: number; top: number; width: number; height: number };

export type WorkspaceTabRef =
  | { kind: "document"; tabId: string }
  | { kind: "surface"; surface: Surface }
  | { kind: "ide" }
  | { kind: "agent"; threadId: string };

export type WorkspacePaneNode = {
  type: "pane";
  id: string;
  tabs: WorkspaceTabRef[];
  activeTabId: string | null;
};

export type WorkspaceSplitNode = {
  type: "split";
  id: string;
  direction: WorkspaceDirection;
  ratio: number;
  first: WorkspaceNode;
  second: WorkspaceNode;
};

export type WorkspaceNode = WorkspacePaneNode | WorkspaceSplitNode;

export type WorkspaceLayout = {
  version: typeof WORKSPACE_LAYOUT_VERSION;
  root: WorkspaceNode;
  focusedPaneId: string;
};

type IdFactory = () => string;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const SURFACES = new Set<Surface>([
  "atelier",
  "browser",
  "terminal",
  "git",
  "biblio",
  "connaissances",
  "generateur",
  "narval",
]);

let fallbackId = 0;

export function workspaceDropZoneAtPoint(
  rect: WorkspaceRect,
  clientX: number,
  clientY: number,
): WorkspaceDropZone {
  if (rect.width <= 0 || rect.height <= 0) return "center";
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const horizontalBand = Math.min(112, rect.width * 0.28);
  const verticalBand = Math.min(96, rect.height * 0.28);
  const candidates: Array<{ zone: Exclude<WorkspaceDropZone, "center">; score: number }> = [];
  if (x <= horizontalBand) candidates.push({ zone: "left", score: x / horizontalBand });
  if (rect.width - x <= horizontalBand) candidates.push({ zone: "right", score: (rect.width - x) / horizontalBand });
  if (y <= verticalBand) candidates.push({ zone: "top", score: y / verticalBand });
  if (rect.height - y <= verticalBand) candidates.push({ zone: "bottom", score: (rect.height - y) / verticalBand });
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.zone ?? "center";
}

export function workspaceDropPreviewRect(
  rect: WorkspaceRect,
  zone: WorkspaceDropZone,
  inset = 6,
): WorkspaceRect {
  const left = rect.left + inset;
  const top = rect.top + inset;
  const width = Math.max(0, rect.width - inset * 2);
  const height = Math.max(0, rect.height - inset * 2);
  if (zone === "left") return { left, top, width: width / 2, height };
  if (zone === "right") return { left: left + width / 2, top, width: width / 2, height };
  if (zone === "top") return { left, top, width, height: height / 2 };
  if (zone === "bottom") return { left, top: top + height / 2, width, height: height / 2 };
  return { left, top, width, height };
}

export function createWorkspaceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `workspace-${Date.now()}-${fallbackId}`;
}

export function workspaceTabId(tab: WorkspaceTabRef): string {
  if (tab.kind === "document") return `document:${tab.tabId}`;
  if (tab.kind === "surface") return `surface:${tab.surface}`;
  if (tab.kind === "agent") return `agent:${tab.threadId}`;
  return "ide";
}

export function externalTabRef(id: string): WorkspaceTabRef {
  if (id === "gallery") return { kind: "surface", surface: "atelier" };
  if (id === "ide") return { kind: "ide" };
  if (id.startsWith("agent:")) return { kind: "agent", threadId: id.slice("agent:".length) };
  return { kind: "document", tabId: id };
}

export function externalTabId(tab: WorkspaceTabRef): string {
  if (tab.kind === "surface" && tab.surface === "atelier") return "gallery";
  if (tab.kind === "ide") return "ide";
  if (tab.kind === "agent") return `agent:${tab.threadId}`;
  if (tab.kind === "document") return tab.tabId;
  return tab.surface;
}

function pane(idFactory: IdFactory, tabs: WorkspaceTabRef[] = []): WorkspacePaneNode {
  return {
    type: "pane",
    id: idFactory(),
    tabs,
    activeTabId: tabs.length ? workspaceTabId(tabs[0]) : null,
  };
}

export function createWorkspaceLayout(
  documentIds: string[],
  activeExternalId = "gallery",
  idFactory: IdFactory = createWorkspaceId,
): WorkspaceLayout {
  const tabs: WorkspaceTabRef[] = [
    { kind: "surface", surface: "atelier" },
    ...documentIds.map((tabId): WorkspaceTabRef => ({ kind: "document", tabId })),
  ];
  const activeRef = externalTabRef(activeExternalId);
  const activeId = workspaceTabId(activeRef);
  if (!tabs.some((tab) => workspaceTabId(tab) === activeId)) tabs.push(activeRef);
  const root = pane(idFactory, tabs);
  root.activeTabId = activeId;
  return { version: WORKSPACE_LAYOUT_VERSION, root, focusedPaneId: root.id };
}

export function listWorkspacePanes(node: WorkspaceNode): WorkspacePaneNode[] {
  if (node.type === "pane") return [node];
  return [...listWorkspacePanes(node.first), ...listWorkspacePanes(node.second)];
}

export function findWorkspacePane(node: WorkspaceNode, paneId: string): WorkspacePaneNode | null {
  if (node.type === "pane") return node.id === paneId ? node : null;
  return findWorkspacePane(node.first, paneId) ?? findWorkspacePane(node.second, paneId);
}

export function findTabPaneId(node: WorkspaceNode, tabId: string): string | null {
  for (const current of listWorkspacePanes(node)) {
    if (current.tabs.some((tab) => workspaceTabId(tab) === tabId)) return current.id;
  }
  return null;
}

function updatePane(
  node: WorkspaceNode,
  paneId: string,
  updater: (current: WorkspacePaneNode) => WorkspacePaneNode,
): WorkspaceNode {
  if (node.type === "pane") return node.id === paneId ? updater(node) : node;
  const first = updatePane(node.first, paneId, updater);
  const second = updatePane(node.second, paneId, updater);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function replaceNode(node: WorkspaceNode, nodeId: string, replacement: WorkspaceNode): WorkspaceNode {
  if (node.id === nodeId) return replacement;
  if (node.type === "pane") return node;
  const first = replaceNode(node.first, nodeId, replacement);
  const second = replaceNode(node.second, nodeId, replacement);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function removeTabKeepPanes(node: WorkspaceNode, tabId: string): WorkspaceNode {
  if (node.type === "pane") {
    const index = node.tabs.findIndex((tab) => workspaceTabId(tab) === tabId);
    if (index < 0) return node;
    const tabs = node.tabs.filter((_, current) => current !== index);
    const activeTabId = node.activeTabId === tabId
      ? (tabs[Math.min(index, Math.max(0, tabs.length - 1))] ? workspaceTabId(tabs[Math.min(index, tabs.length - 1)]) : null)
      : node.activeTabId;
    return { ...node, tabs, activeTabId };
  }
  const first = removeTabKeepPanes(node.first, tabId);
  const second = removeTabKeepPanes(node.second, tabId);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function collapseEmptyPanes(node: WorkspaceNode, keepRoot = true): WorkspaceNode | null {
  if (node.type === "pane") return node.tabs.length || keepRoot ? node : null;
  const first = collapseEmptyPanes(node.first, false);
  const second = collapseEmptyPanes(node.second, false);
  if (!first && !second) return keepRoot ? { type: "pane", id: node.id, tabs: [], activeTabId: null } : null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function ensureFocusedPane(layout: WorkspaceLayout): WorkspaceLayout {
  if (findWorkspacePane(layout.root, layout.focusedPaneId)) return layout;
  const first = listWorkspacePanes(layout.root)[0];
  return first ? { ...layout, focusedPaneId: first.id } : layout;
}

export function activateWorkspaceTab(layout: WorkspaceLayout, ref: WorkspaceTabRef): WorkspaceLayout {
  const id = workspaceTabId(ref);
  const existingPaneId = findTabPaneId(layout.root, id);
  const targetPaneId = existingPaneId ?? layout.focusedPaneId;
  let root = layout.root;
  if (!existingPaneId) {
    root = updatePane(root, targetPaneId, (current) => ({
      ...current,
      tabs: [...current.tabs, ref],
      activeTabId: id,
    }));
  } else {
    root = updatePane(root, targetPaneId, (current) => ({ ...current, activeTabId: id }));
  }
  return { ...layout, root, focusedPaneId: targetPaneId };
}

export function focusWorkspacePane(layout: WorkspaceLayout, paneId: string): WorkspaceLayout {
  return findWorkspacePane(layout.root, paneId) ? { ...layout, focusedPaneId: paneId } : layout;
}

export function setActiveWorkspaceTab(
  layout: WorkspaceLayout,
  paneId: string,
  tabId: string,
): WorkspaceLayout {
  const target = findWorkspacePane(layout.root, paneId);
  if (!target?.tabs.some((tab) => workspaceTabId(tab) === tabId)) return layout;
  return {
    ...layout,
    focusedPaneId: paneId,
    root: updatePane(layout.root, paneId, (current) => ({ ...current, activeTabId: tabId })),
  };
}

export function placeWorkspaceTab(
  layout: WorkspaceLayout,
  ref: WorkspaceTabRef,
  targetPaneId: string,
  zone: WorkspaceDropZone,
  idFactory: IdFactory = createWorkspaceId,
): WorkspaceLayout {
  const tabId = workspaceTabId(ref);
  const sourcePaneId = findTabPaneId(layout.root, tabId);
  const targetBefore = findWorkspacePane(layout.root, targetPaneId);
  if (!targetBefore) return layout;

  if (zone === "center" && sourcePaneId === targetPaneId) {
    return setActiveWorkspaceTab(layout, targetPaneId, tabId);
  }
  if (zone !== "center" && sourcePaneId === targetPaneId && targetBefore.tabs.length <= 1) {
    return layout;
  }

  let root = removeTabKeepPanes(layout.root, tabId);
  if (sourcePaneId !== targetPaneId) root = collapseEmptyPanes(root) ?? root;
  const target = findWorkspacePane(root, targetPaneId);
  if (!target) return layout;

  if (zone === "center") {
    root = updatePane(root, targetPaneId, (current) => ({
      ...current,
      tabs: [...current.tabs, ref],
      activeTabId: tabId,
    }));
    return ensureFocusedPane({ ...layout, root, focusedPaneId: targetPaneId });
  }

  const newPane = pane(idFactory, [ref]);
  newPane.activeTabId = tabId;
  const direction: WorkspaceDirection = zone === "left" || zone === "right" ? "horizontal" : "vertical";
  const before = zone === "left" || zone === "top";
  const split: WorkspaceSplitNode = {
    type: "split",
    id: idFactory(),
    direction,
    ratio: 50,
    first: before ? newPane : target,
    second: before ? target : newPane,
  };
  root = replaceNode(root, targetPaneId, split);
  return { ...layout, root, focusedPaneId: newPane.id };
}

export function closeWorkspaceTab(layout: WorkspaceLayout, tabId: string): WorkspaceLayout {
  const rootWithEmpty = removeTabKeepPanes(layout.root, tabId);
  const root = collapseEmptyPanes(rootWithEmpty) ?? rootWithEmpty;
  return ensureFocusedPane({ ...layout, root });
}

export function resizeWorkspaceSplit(
  layout: WorkspaceLayout,
  splitId: string,
  ratio: number,
): WorkspaceLayout {
  const bounded = Math.min(80, Math.max(20, ratio));
  function visit(node: WorkspaceNode): WorkspaceNode {
    if (node.type === "pane") return node;
    if (node.id === splitId) return { ...node, ratio: bounded };
    const first = visit(node.first);
    const second = visit(node.second);
    return first === node.first && second === node.second ? node : { ...node, first, second };
  }
  return { ...layout, root: visit(layout.root) };
}

function validTabRef(value: unknown): value is WorkspaceTabRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkspaceTabRef> & { kind?: unknown };
  if (candidate.kind === "ide") return true;
  if (candidate.kind === "document") return typeof candidate.tabId === "string" && candidate.tabId.length > 0;
  if (candidate.kind === "agent") return typeof candidate.threadId === "string" && candidate.threadId.length > 0;
  return candidate.kind === "surface" && typeof candidate.surface === "string" && SURFACES.has(candidate.surface as Surface);
}

function parseNode(value: unknown, depth = 0): WorkspaceNode | null {
  if (!value || typeof value !== "object" || depth > 32) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "pane") {
    if (typeof candidate.id !== "string" || !Array.isArray(candidate.tabs)) return null;
    const tabs = candidate.tabs.filter(validTabRef);
    const active = typeof candidate.activeTabId === "string" ? candidate.activeTabId : null;
    return {
      type: "pane",
      id: candidate.id,
      tabs,
      activeTabId: tabs.some((tab) => workspaceTabId(tab) === active)
        ? active
        : (tabs[0] ? workspaceTabId(tabs[0]) : null),
    };
  }
  if (candidate.type !== "split" || typeof candidate.id !== "string") return null;
  if (candidate.direction !== "horizontal" && candidate.direction !== "vertical") return null;
  const first = parseNode(candidate.first, depth + 1);
  const second = parseNode(candidate.second, depth + 1);
  if (!first || !second) return null;
  const ratio = typeof candidate.ratio === "number" && Number.isFinite(candidate.ratio)
    ? Math.min(80, Math.max(20, candidate.ratio))
    : 50;
  return { type: "split", id: candidate.id, direction: candidate.direction, ratio, first, second };
}

export function parseWorkspaceLayout(value: unknown): WorkspaceLayout | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== WORKSPACE_LAYOUT_VERSION || typeof candidate.focusedPaneId !== "string") return null;
  const root = parseNode(candidate.root);
  if (!root) return null;
  return ensureFocusedPane({ version: WORKSPACE_LAYOUT_VERSION, root, focusedPaneId: candidate.focusedPaneId });
}

export function reconcileWorkspaceLayout(
  layout: WorkspaceLayout,
  documentIds: string[],
  activeExternalId: string,
  activeAgentThreadId: string | null = null,
): WorkspaceLayout {
  const validDocuments = new Set(documentIds);
  const seen = new Set<string>();
  function clean(node: WorkspaceNode): WorkspaceNode {
    if (node.type === "split") return { ...node, first: clean(node.first), second: clean(node.second) };
    const tabs = node.tabs.filter((tab) => {
      if (tab.kind === "document" && !validDocuments.has(tab.tabId)) return false;
      if (tab.kind === "agent" && tab.threadId !== activeAgentThreadId) return false;
      const id = workspaceTabId(tab);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return {
      ...node,
      tabs,
      activeTabId: tabs.some((tab) => workspaceTabId(tab) === node.activeTabId)
        ? node.activeTabId
        : (tabs[0] ? workspaceTabId(tabs[0]) : null),
    };
  }

  let root = collapseEmptyPanes(clean(layout.root)) ?? clean(layout.root);
  let next = ensureFocusedPane({ ...layout, root });
  const missingDocuments = documentIds.filter((id) => !findTabPaneId(next.root, `document:${id}`));
  if (missingDocuments.length) {
    root = updatePane(next.root, next.focusedPaneId, (current) => ({
      ...current,
      tabs: [...current.tabs, ...missingDocuments.map((tabId): WorkspaceTabRef => ({ kind: "document", tabId }))],
      activeTabId: current.activeTabId ?? `document:${missingDocuments[0]}`,
    }));
    next = { ...next, root };
  }
  return activateWorkspaceTab(next, externalTabRef(activeExternalId));
}

function migrateLegacyLayout(
  legacyValue: unknown,
  documentIds: string[],
  activeExternalId: string,
  idFactory: IdFactory,
): WorkspaceLayout | null {
  if (!legacyValue || typeof legacyValue !== "object") return null;
  const legacy = legacyValue as { second?: unknown; pct?: unknown };
  if (typeof legacy.second !== "string" || !SURFACES.has(legacy.second as Surface) || legacy.second === "atelier") return null;
  const first = pane(idFactory, [
    { kind: "surface", surface: "atelier" },
    ...documentIds.map((tabId): WorkspaceTabRef => ({ kind: "document", tabId })),
  ]);
  const activeRef = externalTabRef(activeExternalId);
  if (!first.tabs.some((tab) => workspaceTabId(tab) === workspaceTabId(activeRef))) first.tabs.push(activeRef);
  first.activeTabId = workspaceTabId(activeRef);
  const second = pane(idFactory, [{ kind: "surface", surface: legacy.second as Surface }]);
  const root: WorkspaceSplitNode = {
    type: "split",
    id: idFactory(),
    direction: "horizontal",
    ratio: typeof legacy.pct === "number" ? Math.min(80, Math.max(20, legacy.pct)) : 50,
    first,
    second,
  };
  return { version: WORKSPACE_LAYOUT_VERSION, root, focusedPaneId: first.id };
}

function parseStoredJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadWorkspaceLayout(
  storage: StorageLike,
  projectRoot: string,
  documentIds: string[],
  activeExternalId: string,
  idFactory: IdFactory = createWorkspaceId,
): WorkspaceLayout {
  const stored = parseWorkspaceLayout(parseStoredJson(storage.getItem(`${WORKSPACE_LAYOUT_PREFIX}${projectRoot}`)));
  if (stored) return reconcileWorkspaceLayout(stored, documentIds, activeExternalId);
  const migrated = migrateLegacyLayout(
    parseStoredJson(storage.getItem(`${LEGACY_SPLIT_PREFIX}${projectRoot}`)),
    documentIds,
    activeExternalId,
    idFactory,
  );
  return migrated ?? createWorkspaceLayout(documentIds, activeExternalId, idFactory);
}

export function saveWorkspaceLayout(storage: StorageLike, projectRoot: string, layout: WorkspaceLayout): void {
  storage.setItem(`${WORKSPACE_LAYOUT_PREFIX}${projectRoot}`, JSON.stringify(layout));
}
