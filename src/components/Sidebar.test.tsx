// Caractérisation du panneau Projets (plan 024, étape 1) : ces tests décrivent
// les CONTRATS du panneau (callbacks, événements, capacités), pas son markup.
// Ils doivent rester verts avant ET après la restructuration en Research
// Navigator — seule exception documentée : « clic projet → onSelectProject »,
// qui disparaît avec la liste de projets (le rail/topbar restent les seuls
// sélecteurs globaux).
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { fireEvent, screen, cleanup, waitFor, within } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { renderUi, resetTestState } from "../test/render";
import { makeThread, PROJECT_ROOT, OTHER_PROJECT_ROOT, FIXED_ISO } from "../test/fixtures";
import { setLanguage, t } from "../lib/i18n";
import type { Thread } from "../lib/ws";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
  message: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(async () => {}),
  openUrl: vi.fn(async () => {}),
}));
vi.mock("../lib/wsBus", () => ({
  wsSend: vi.fn(() => true),
  wsReady: vi.fn(() => true),
  setWs: vi.fn(),
}));

import { wsSend } from "../lib/wsBus";

function makeProps(over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return {
    projects: [PROJECT_ROOT, OTHER_PROJECT_ROOT],
    threads: [] as Thread[],
    unread: new Set<string>(),
    favorites: [] as string[],
    onToggleFavorite: vi.fn(),
    threadOrder: "recent" as const,
    activeProject: PROJECT_ROOT,
    activeId: null,
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onNewChat: vi.fn(),
    onImportSession: vi.fn(),
    onDelete: vi.fn(),
    onRemoveProject: vi.fn(),
    onRename: vi.fn(),
    projMeta: {},
    onSetMeta: vi.fn(),
    ...over,
  };
}

// trois conversations du projet actif, titres distincts, plus une hors contexte
function projectThreads(): Thread[] {
  return [
    makeThread({ id: "th-a", title: "Analyse albédo", updatedAt: FIXED_ISO }),
    makeThread({ id: "th-b", title: "Révision figure", updatedAt: FIXED_ISO }),
    makeThread({ id: "th-c", title: "Notes méthodo", updatedAt: FIXED_ISO }),
    makeThread({ id: "th-x", title: "Chat autre projet", projectRoot: OTHER_PROJECT_ROOT }),
  ];
}

beforeAll(() => setLanguage("fr"));

beforeEach(() => {
  cleanup();
  resetTestState();
  vi.clearAllMocks();
});

describe("Sidebar — contrats du panneau (projet actif)", () => {
  it("affiche les conversations du projet actif", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    expect(screen.getByText("Analyse albédo")).toBeTruthy();
    expect(screen.getByText("Révision figure")).toBeTruthy();
    expect(screen.getByText("Notes méthodo")).toBeTruthy();
  });

  it("clic sur une conversation appelle onSelect(id, root)", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByText("Révision figure"));
    expect(p.onSelect).toHaveBeenCalledWith("th-b", PROJECT_ROOT);
  });

  it("double-clic ouvre le renommage inline ; Entrée appelle onRename", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.doubleClick(screen.getByText("Analyse albédo"));
    const input = screen.getByDisplayValue("Analyse albédo");
    fireEvent.change(input, { target: { value: "Albédo v2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onRename).toHaveBeenCalledWith("th-a", "Albédo v2");
  });

  it("Échap annule le renommage sans appeler onRename", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.doubleClick(screen.getByText("Analyse albédo"));
    const input = screen.getByDisplayValue("Analyse albédo");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(p.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Analyse albédo")).toBeTruthy();
  });

  it("menu contextuel : Renommer / Favori / Supprimer appellent leurs callbacks", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);

    fireEvent.contextMenu(screen.getByText("Analyse albédo"));
    fireEvent.click(screen.getByText(t("action.add-favorite")));
    expect(p.onToggleFavorite).toHaveBeenCalledWith("th-a");

    fireEvent.contextMenu(screen.getByText("Révision figure"));
    fireEvent.click(screen.getByText(t("action.delete")));
    expect(p.onDelete).toHaveBeenCalledWith("th-b");
  });

  it("Continuer avec… choisit un provider compatible sans ouvrir de modale", async () => {
    const onContinueWith = vi.fn();
    const p = makeProps({
      threads: projectThreads(),
      linkProviders: [
        { id: "kimi", label: "Kimi" },
        { id: "codex", label: "Codex" },
      ],
      onContinueWith,
    });
    renderUi(<Sidebar {...p} />);
    fireEvent.contextMenu(screen.getByText("Analyse albédo"));
    const continueItem = await screen.findByRole("menuitem", {
      name: t("linkedConversation.continueWith"),
    });
    fireEvent.click(continueItem);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Codex" }));
    expect(onContinueWith).toHaveBeenCalledWith(
      expect.objectContaining({ id: "th-a" }),
      "codex",
    );
  });

  it("représente les deux conversations liées et délie toujours via l'id enfant", async () => {
    const parent = makeThread({ id: "kimi-parent", provider: "kimi", title: "Analyse initiale" });
    const child = makeThread({
      id: "codex-child",
      provider: "codex",
      title: "Analyse initiale",
      agentLink: {
        parentThreadId: "kimi-parent",
        role: "collaborator",
        access: "read_write",
        createdAt: FIXED_ISO,
        createdBy: "user",
        autoDeliveryLimit: 1,
        autoDeliveryUsed: 0,
        paused: false,
      },
    });
    const onUnlinkConversation = vi.fn();
    const p = makeProps({
      threads: [parent, child],
      activeId: "kimi-parent",
      onUnlinkConversation,
    });
    renderUi(<Sidebar {...p} />);
    const markerLabel = t("linkedConversation.markerLabel", { count: 2 });
    const markers = screen.getAllByRole("button", { name: markerLabel });
    expect(markers).toHaveLength(2);
    expect(screen.queryByRole("tree", {
      name: t("linkedConversation.treeLabel"),
    })).toBeNull();

    fireEvent.click(markers[0]);
    const tree = await screen.findByRole("tree", {
      name: t("linkedConversation.treeLabel"),
    });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(2);
    fireEvent.click(within(tree).getByRole("button", {
      name: t("linkedConversation.unlinkFrom", { title: "Analyse initiale" }),
    }));
    expect(onUnlinkConversation).toHaveBeenCalledWith("codex-child");
  });

  it("ouvre au clic du marqueur toute la continuité 1 → {2, 3} et 3 → 4", async () => {
    const linked = (id: string, title: string, parentThreadId?: string, createdAt = FIXED_ISO) => makeThread({
      id,
      title,
      provider: id === "1" ? "kimi" : id === "2" ? "codex" : id === "3" ? "claude" : "grok",
      agentLink: parentThreadId ? {
        parentThreadId,
        role: "collaborator",
        access: "read_write",
        createdAt,
        createdBy: "user",
        autoDeliveryLimit: 1,
        autoDeliveryUsed: 0,
        paused: false,
      } : undefined,
    });
    const threads = [
      linked("1", "Conversation 1"),
      linked("2", "Conversation 2", "1", "2026-07-20T00:00:01.000Z"),
      linked("3", "Conversation 3", "1", "2026-07-20T00:00:02.000Z"),
      linked("4", "Conversation 4", "3", "2026-07-20T00:00:03.000Z"),
    ];
    const p = makeProps({ threads, activeId: "4" });
    renderUi(<Sidebar {...p} />);
    const markerLabel = t("linkedConversation.markerLabel", { count: 4 });
    const markers = screen.getAllByRole("button", { name: markerLabel });

    expect(markers).toHaveLength(4);
    expect(screen.queryByRole("tree", { name: t("linkedConversation.treeLabel") })).toBeNull();
    fireEvent.click(markers[3]);
    const tree = await screen.findByRole("tree", { name: t("linkedConversation.treeLabel") });
    const treeItems = within(tree).getAllByRole("treeitem");

    expect(screen.queryByText("Continuer", { exact: true })).toBeNull();
    expect(treeItems.map((item) => item.getAttribute("aria-level"))).toEqual(["1", "2", "2", "3"]);
    expect(treeItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Conversation 1"),
      expect.stringContaining("Conversation 2"),
      expect.stringContaining("Conversation 3"),
      expect.stringContaining("Conversation 4"),
    ]);

    fireEvent.click(within(tree).getByText("Conversation 3"));
    expect(p.onSelect).toHaveBeenCalledWith("3", PROJECT_ROOT);
  });

  it("révèle au survol uniquement les membres de la même famille", () => {
    const makeLinkedPair = (rootId: string, childId: string, createdAt: string) => [
      makeThread({ id: rootId, title: `Racine ${rootId}` }),
      makeThread({
        id: childId,
        title: `Enfant ${childId}`,
        agentLink: {
          parentThreadId: rootId,
          role: "collaborator",
          access: "read_write",
          createdAt,
          createdBy: "user",
          autoDeliveryLimit: 1,
          autoDeliveryUsed: 0,
          paused: false,
        },
      }),
    ];
    renderUi(<Sidebar {...makeProps({
      threads: [
        ...makeLinkedPair("a", "b", "2026-07-20T00:00:01.000Z"),
        ...makeLinkedPair("c", "d", "2026-07-20T00:00:02.000Z"),
      ],
    })} />);

    const markerLabel = t("linkedConversation.markerLabel", { count: 2 });
    expect(screen.getAllByRole("button", { name: markerLabel })).toHaveLength(4);

    const row = (title: string) => screen.getByText(title, { selector: ".title" }).closest(".pnav-row")!;
    fireEvent.mouseEnter(within(row("Racine a") as HTMLElement).getByRole("button", {
      name: markerLabel,
    }));
    expect(row("Racine a")).toHaveClass("family-preview");
    expect(row("Enfant b")).toHaveClass("family-preview");
    expect(row("Racine c")).not.toHaveClass("family-preview");
    expect(row("Enfant d")).not.toHaveClass("family-preview");
  });

  it("menu contextuel : Déplacer vers… envoie moveThread vers l'autre projet", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.contextMenu(screen.getByText("Analyse albédo"));
    fireEvent.click(screen.getByText(t("thread.move")));
    // le nom du projet cible peut aussi exister ailleurs dans le panneau :
    // ne cliquer que l'entrée du menu ouvert
    const inMenu = screen
      .getAllByText("manuscrit-ch1")
      .find((el) => el.closest('[class*="menu"]'));
    expect(inMenu).toBeTruthy();
    fireEvent.click(inMenu!);
    expect(wsSend).toHaveBeenCalledWith({
      type: "moveThread",
      threadId: "th-a",
      projectRoot: OTHER_PROJECT_ROOT,
    });
  });

  it("shift-clic étend la sélection ; Suppr supprime toute la plage", async () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByText("Analyse albédo"), { metaKey: true });
    fireEvent.click(screen.getByText("Notes méthodo"), { shiftKey: true });
    fireEvent.keyDown(window, { key: "Delete" });
    await vi.waitFor(() => expect(p.onDelete).toHaveBeenCalledTimes(3));
    expect(p.onDelete).toHaveBeenCalledWith("th-a");
    expect(p.onDelete).toHaveBeenCalledWith("th-b");
    expect(p.onDelete).toHaveBeenCalledWith("th-c");
  });

  it("Échap vide la sélection multiple : Suppr ne supprime plus rien", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByText("Analyse albédo"), { metaKey: true });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(p.onDelete).not.toHaveBeenCalled();
  });

  it("cmd-clic bascule un thread dans la sélection sans le sélectionner", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByText("Analyse albédo"), { metaKey: true });
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it("thread actif marqué, unread et running signalés", () => {
    const threads = [
      makeThread({ id: "th-a", title: "Analyse albédo" }),
      makeThread({ id: "th-b", title: "Révision figure", status: "running" }),
    ];
    const p = makeProps({ threads, activeId: "th-a", unread: new Set(["th-b"]) });
    const { container } = renderUi(<Sidebar {...p} />);
    expect(container.querySelector(".active")).toBeTruthy();
    expect(container.querySelector(".unread-dot, .unread-badge")).toBeTruthy();
    expect(container.querySelector(".arc")).toBeTruthy();
  });

  it("atelier-open-resume envoie listSessions avec le projectRoot actif", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    fireEvent(window, new CustomEvent("atelier-open-resume", { detail: { provider: "claude" } }));
    expect(wsSend).toHaveBeenCalledWith({
      type: "listSessions",
      provider: "claude",
      projectRoot: PROJECT_ROOT,
    });
  });

  it("sessions-list remplit la liste ; clic importe la session", async () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent(window, new CustomEvent("atelier-open-resume", { detail: { provider: "codex" } }));
    fireEvent(window, new CustomEvent("sessions-list", {
      detail: [
        { id: "sess-1", title: "Session A", mtime: 1783684800000, projectRoot: "/tmp/projet-a" },
        { id: "sess-2", title: "Session B", mtime: 1783684700000, projectRoot: "/tmp/projet-b" },
      ],
    }));
    // le popup Base UI (resume-pop) monte en portal après une microtâche
    const searchbox = await screen.findByRole("searchbox");
    fireEvent.change(searchbox, { target: { value: "projet-a" } });
    expect(screen.queryByText("Session B")).toBeNull();
    fireEvent.click(screen.getByText("Session A"));
    expect(p.onImportSession).toHaveBeenCalledWith("codex", "sess-1", "Session A", "/tmp/projet-a");
  });

  it("remount : les listeners sessions-list ne sont pas dupliqués", () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const p = makeProps({ threads: projectThreads() });
    const { unmount } = renderUi(<Sidebar {...p} />);
    unmount();
    const addCount = added.mock.calls.filter(([type]) => type === "sessions-list").length;
    const removeCount = removed.mock.calls.filter(([type]) => type === "sessions-list").length;
    expect(addCount).toBeGreaterThan(0);
    expect(removeCount).toBe(addCount);
    added.mockRestore();
    removed.mockRestore();
  });
});

describe("Sidebar — contrats du panneau (chats sans projet)", () => {
  const unscopedThreads = () => [
    makeThread({ id: "th-u1", title: "Chat libre un", projectRoot: "" }),
    makeThread({ id: "th-u2", title: "Chat libre deux", projectRoot: "" }),
    makeThread({ id: "th-p", title: "Chat de projet", projectRoot: PROJECT_ROOT }),
  ];

  it("sans projet actif, les chats sans projet restent visibles et sélectionnables", () => {
    const p = makeProps({ activeProject: null, threads: unscopedThreads() });
    renderUi(<Sidebar {...p} />);
    expect(screen.getByText("Chat libre un")).toBeTruthy();
    fireEvent.click(screen.getByText("Chat libre deux"));
    expect(p.onSelect).toHaveBeenCalledWith("th-u2", "");
  });

  it("Nouveau chat sans projet appelle onNewChat", () => {
    const p = makeProps({ activeProject: null, threads: unscopedThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByText(t("action.new-chat")));
    expect(p.onNewChat).toHaveBeenCalled();
  });

  it("atelier-open-resume sans projet actif envoie listSessions avec root vide", () => {
    renderUi(<Sidebar {...makeProps({ activeProject: null, threads: unscopedThreads() })} />);
    fireEvent(window, new CustomEvent("atelier-open-resume", { detail: { provider: "claude" } }));
    expect(wsSend).toHaveBeenCalledWith({
      type: "listSessions",
      provider: "claude",
      projectRoot: "",
    });
  });
});

// ---------------------------------------------------------------------------
// Research Navigator (plan 024, étapes 3-5) : header, sections, accessibilité
// ---------------------------------------------------------------------------
describe("Research Navigator — header du projet actif", () => {
  it("le panneau ne répète PAS l'identité projet (crumb TopBar = source unique)", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    // demande Thierry (2026-07-10) : le nom du projet ne vit qu'au crumb
    expect(screen.queryByText("albedo-pipeline")).toBeNull();
    // le chemin complet reste accessible sur le bouton d'actions du projet
    expect(screen.getByTitle(PROJECT_ROOT)).toBeTruthy();
    // le projet B n'est jamais rendu : le rail/topbar restent les sélecteurs globaux
    expect(screen.queryByText("manuscrit-ch1")).toBeNull();
    expect(screen.queryByText("Chat autre projet")).toBeNull();
  });

  it("Nouveau chat en mode projet appelle onNew(activeProject)", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByText(t("action.new-chat")));
    expect(p.onNew).toHaveBeenCalledWith(PROJECT_ROOT);
    expect(p.onNewChat).not.toHaveBeenCalled();
  });

  it("l'overflow ⋯ expose Resume, Révéler, Personnaliser et Retirer le projet", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByRole("button", { name: t("project.actions") }));
    expect(screen.getByText(t("sidebar.resume-claude"))).toBeTruthy();
    expect(screen.getByText(t("sidebar.resume-codex"))).toBeTruthy();
    expect(screen.getByText(t("project.reveal-finder"))).toBeTruthy();
    expect(screen.getByText(t("project.customize"))).toBeTruthy();
    fireEvent.click(screen.getByText(t("project.remove")));
    expect(p.onRemoveProject).toHaveBeenCalledWith(PROJECT_ROOT);
  });

  it("Resume via l'overflow envoie listSessions avec le root actif", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    fireEvent.click(screen.getByRole("button", { name: t("project.actions") }));
    fireEvent.click(screen.getByText(t("sidebar.resume-codex")));
    expect(wsSend).toHaveBeenCalledWith({
      type: "listSessions",
      provider: "codex",
      projectRoot: PROJECT_ROOT,
    });
  });

  it("mode sans projet : titre dédié, overflow sans action projet", () => {
    renderUi(<Sidebar {...makeProps({ activeProject: null, threads: [] })} />);
    expect(screen.getByText(t("sidebar.no-project-title"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("project.actions") }));
    expect(screen.getByText(t("sidebar.resume-claude"))).toBeTruthy();
    expect(screen.queryByText(t("project.remove"))).toBeNull();
    expect(screen.queryByText(t("project.reveal-finder"))).toBeNull();
  });
});

describe("Research Navigator — recherche locale", () => {
  it("le bouton recherche ouvre un input ; la requête filtre le contexte", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    fireEvent.click(screen.getByRole("button", { name: t("sidebar.search-local") }));
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "figure" } });
    expect(screen.getByText(t("sidebar.results"))).toBeTruthy();
    expect(screen.getByText("Révision figure")).toBeTruthy();
    expect(screen.queryByText("Analyse albédo")).toBeNull();
  });

  it("zéro résultat : message dédié", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    fireEvent.click(screen.getByRole("button", { name: t("sidebar.search-local") }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText(t("sidebar.no-results", { q: "zzz" }))).toBeTruthy();
  });

  it("Échap ferme la recherche et rend le focus au bouton", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    const btn = screen.getByRole("button", { name: t("sidebar.search-local") });
    fireEvent.click(btn);
    const input = screen.getByRole("searchbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(document.activeElement).toBe(btn);
    // la requête est vidée : les conversations réapparaissent
    expect(screen.getByText("Analyse albédo")).toBeTruthy();
  });
});

describe("Research Navigator — sections et déduplication", () => {
  it("Épinglés et Conversations sont conditionnels et sans doublon", () => {
    const p = makeProps({
      threads: projectThreads(),
      activeId: "th-a",
      favorites: ["th-a", "th-b"],
    });
    renderUi(<Sidebar {...p} />);
    expect(screen.queryByText("Continuer", { exact: true })).toBeNull();
    expect(screen.getByText(t("sidebar.pinned"))).toBeTruthy();
    expect(screen.getByText(t("sidebar.conversations"))).toBeTruthy();
    // th-a et th-b en Épinglés uniquement
    expect(screen.getAllByText("Analyse albédo")).toHaveLength(1);
    expect(screen.getAllByText("Révision figure")).toHaveLength(1);
  });

  it("panneau vide : phrase d'orientation, pas de sections", () => {
    renderUi(<Sidebar {...makeProps({ threads: [] })} />);
    expect(screen.getByText(t("sidebar.empty-project"))).toBeTruthy();
    expect(screen.queryByText(t("sidebar.conversations"))).toBeNull();
  });

  it("« N conversations plus anciennes » étend la liste ; « Afficher moins » la replie", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      makeThread({ id: `t${i}`, title: `Conversation numéro ${i}` }),
    );
    renderUi(<Sidebar {...makeProps({ threads: many, activeId: "t0" })} />);
    const more = screen.getByText(t("sidebar.older-count", { count: 4 }));
    fireEvent.click(more);
    expect(screen.getByText("Conversation numéro 8")).toBeTruthy();
    fireEvent.click(screen.getByText(t("sidebar.show-less")));
    expect(screen.queryByText("Conversation numéro 8")).toBeNull();
  });

  it("le thread actif porte aria-current sur son bouton principal", () => {
    renderUi(<Sidebar {...makeProps({ threads: projectThreads(), activeId: "th-b" })} />);
    const current = document.querySelector('[aria-current="true"]');
    expect(current).toBeTruthy();
    expect(current!.textContent).toContain("Révision figure");
  });

  it("le bouton ⋯ d'une ligne ouvre le menu de conversation (accès clavier)", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    const rowMenuBtns = screen.getAllByRole("button", { name: t("thread.more-actions") });
    fireEvent.click(rowMenuBtns[0]);
    fireEvent.click(screen.getByText(t("action.rename")));
    expect(screen.getByDisplayValue("Analyse albédo")).toBeTruthy();
  });
});

describe("Research Navigator — actions projet de l'overflow (câblage réel)", () => {
  it("Révéler dans le Finder appelle revealItemInDir avec le root actif", async () => {
    const opener = await import("@tauri-apps/plugin-opener");
    renderUi(<Sidebar {...makeProps({ threads: projectThreads() })} />);
    fireEvent.click(screen.getByRole("button", { name: t("project.actions") }));
    fireEvent.click(screen.getByText(t("project.reveal-finder")));
    expect(opener.revealItemInDir).toHaveBeenCalledWith(PROJECT_ROOT);
  });

  it("Personnaliser ouvre le popover couleur/icône ; un swatch appelle onSetMeta", async () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent.click(screen.getByRole("button", { name: t("project.actions") }));
    fireEvent.click(screen.getByText(t("project.customize")));
    // le popover monte en portal Base UI (document.body), hors du container
    const swatch = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(".swatches .swatch");
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(swatch);
    expect(p.onSetMeta).toHaveBeenCalledWith(
      PROJECT_ROOT,
      expect.objectContaining({ color: expect.any(String) }),
    );
  });
});
