import { describe, expect, it } from "vitest";
import {
  WORKSPACE_LAYOUT_PREFIX,
  activateWorkspaceTab,
  closeWorkspaceTab,
  createWorkspaceLayout,
  findTabPaneId,
  listWorkspacePanes,
  loadWorkspaceLayout,
  parseWorkspaceLayout,
  placeWorkspaceTab,
  resizeWorkspaceSplit,
  saveWorkspaceLayout,
  workspaceDropPreviewRect,
  workspaceDropZoneAtPoint,
  workspaceTabId,
  type WorkspaceLayout,
} from "./workspaceLayout";

function ids() {
  let current = 0;
  return () => `id-${++current}`;
}

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe("workspaceLayout", () => {
  it("rend les bords magnétiques et réserve le centre à l'empilement", () => {
    const rect = { left: 100, top: 50, width: 800, height: 600 };
    expect(workspaceDropZoneAtPoint(rect, 110, 350)).toBe("left");
    expect(workspaceDropZoneAtPoint(rect, 890, 350)).toBe("right");
    expect(workspaceDropZoneAtPoint(rect, 500, 58)).toBe("top");
    expect(workspaceDropZoneAtPoint(rect, 500, 642)).toBe("bottom");
    expect(workspaceDropZoneAtPoint(rect, 500, 350)).toBe("center");

    expect(workspaceDropPreviewRect(rect, "right", 0)).toEqual({
      left: 500, top: 50, width: 400, height: 600,
    });
  });

  it("crée un pane avec Galerie et les documents existants", () => {
    const layout = createWorkspaceLayout(["main.tex", "analysis.py"], "analysis.py", ids());
    const panes = listWorkspacePanes(layout.root);

    expect(panes).toHaveLength(1);
    expect(panes[0].tabs.map(workspaceTabId)).toEqual([
      "surface:atelier",
      "document:main.tex",
      "document:analysis.py",
    ]);
    expect(panes[0].activeTabId).toBe("document:analysis.py");
  });

  it.each([
    ["left", "horizontal"],
    ["right", "horizontal"],
    ["top", "vertical"],
    ["bottom", "vertical"],
  ] as const)("scinde un document vers %s", (zone, direction) => {
    const makeId = ids();
    const initial = createWorkspaceLayout(["a", "b"], "a", makeId);
    const targetPane = initial.focusedPaneId;
    const split = placeWorkspaceTab(
      initial,
      { kind: "document", tabId: "a" },
      targetPane,
      zone,
      makeId,
    );

    expect(split.root.type).toBe("split");
    expect(split.root.type === "split" ? split.root.direction : null).toBe(direction);
    expect(listWorkspacePanes(split.root)).toHaveLength(2);
    expect(findTabPaneId(split.root, "document:a")).not.toBe(findTabPaneId(split.root, "document:b"));
  });

  it("déplace un onglet au centre et collapse son ancien pane vide", () => {
    const makeId = ids();
    const initial = createWorkspaceLayout(["a", "b"], "a", makeId);
    const split = placeWorkspaceTab(initial, { kind: "document", tabId: "a" }, initial.focusedPaneId, "right", makeId);
    const paneB = findTabPaneId(split.root, "document:b")!;
    const moved = placeWorkspaceTab(split, { kind: "document", tabId: "a" }, paneB, "center", makeId);

    expect(listWorkspacePanes(moved.root)).toHaveLength(1);
    expect(findTabPaneId(moved.root, "document:a")).toBe(paneB);
    expect(findTabPaneId(moved.root, "document:b")).toBe(paneB);
  });

  it("place Zotero dans un split puis le réactive sans le dupliquer", () => {
    const makeId = ids();
    const initial = createWorkspaceLayout(["main.tex"], "main.tex", makeId);
    const split = placeWorkspaceTab(initial, { kind: "surface", surface: "biblio" }, initial.focusedPaneId, "right", makeId);
    const activated = activateWorkspaceTab(split, { kind: "surface", surface: "biblio" });

    const zoteroTabs = listWorkspacePanes(activated.root)
      .flatMap((current) => current.tabs)
      .filter((tab) => workspaceTabId(tab) === "surface:biblio");
    expect(zoteroTabs).toHaveLength(1);
    expect(activated.focusedPaneId).toBe(findTabPaneId(activated.root, "surface:biblio"));
  });

  it("collapse la branche quand le dernier onglet d'un pane ferme", () => {
    const makeId = ids();
    const initial = createWorkspaceLayout(["a", "b"], "a", makeId);
    const split = placeWorkspaceTab(initial, { kind: "document", tabId: "a" }, initial.focusedPaneId, "bottom", makeId);
    const closed = closeWorkspaceTab(split, "document:a");

    expect(listWorkspacePanes(closed.root)).toHaveLength(1);
    expect(findTabPaneId(closed.root, "document:b")).not.toBeNull();
  });

  it("borne les ratios de split à 20–80", () => {
    const makeId = ids();
    const initial = createWorkspaceLayout(["a", "b"], "a", makeId);
    const split = placeWorkspaceTab(initial, { kind: "document", tabId: "a" }, initial.focusedPaneId, "right", makeId);
    expect(split.root.type).toBe("split");
    if (split.root.type !== "split") return;

    const small = resizeWorkspaceSplit(split, split.root.id, 2);
    const large = resizeWorkspaceSplit(small, split.root.id, 96);
    expect(small.root.type === "split" ? small.root.ratio : null).toBe(20);
    expect(large.root.type === "split" ? large.root.ratio : null).toBe(80);
  });

  it("migre l'ancien split Atelier + Knowledge", () => {
    const project = "/tmp/project";
    const memory = storage({
      [`atelier-studio.split.${project}`]: JSON.stringify({ second: "connaissances", pct: 62 }),
    });
    const layout = loadWorkspaceLayout(memory, project, ["main.tex"], "main.tex", ids());

    expect(layout.root.type).toBe("split");
    expect(layout.root.type === "split" ? layout.root.ratio : null).toBe(62);
    expect(findTabPaneId(layout.root, "surface:connaissances")).not.toBeNull();
    expect(findTabPaneId(layout.root, "document:main.tex")).not.toBeNull();
  });

  it("rejette un JSON hostile et recharge un layout sain", () => {
    expect(parseWorkspaceLayout({ version: 1, focusedPaneId: "x", root: { type: "wat" } })).toBeNull();
    const project = "/tmp/project";
    const memory = storage({ [`${WORKSPACE_LAYOUT_PREFIX}${project}`]: "{broken" });
    const layout = loadWorkspaceLayout(memory, project, [], "gallery", ids());

    expect(listWorkspacePanes(layout.root)).toHaveLength(1);
    expect(findTabPaneId(layout.root, "surface:atelier")).not.toBeNull();
  });

  it("sérialise un layout versionné", () => {
    const project = "/tmp/project";
    const memory = storage();
    const layout: WorkspaceLayout = createWorkspaceLayout(["main.tex"], "main.tex", ids());
    saveWorkspaceLayout(memory, project, layout);

    expect(parseWorkspaceLayout(JSON.parse(memory.values.get(`${WORKSPACE_LAYOUT_PREFIX}${project}`)!))).toEqual(layout);
  });
});
