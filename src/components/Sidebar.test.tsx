// Caractérisation du panneau Projets (plan 024, étape 1) : ces tests décrivent
// les CONTRATS du panneau (callbacks, événements, capacités), pas son markup.
// Ils doivent rester verts avant ET après la restructuration en Research
// Navigator — seule exception documentée : « clic projet → onSelectProject »,
// qui disparaît avec la liste de projets (le rail/topbar restent les seuls
// sélecteurs globaux).
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { fireEvent, screen, cleanup } from "@testing-library/react";
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
    onAddProject: vi.fn(),
    onSelectProject: vi.fn(),
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onNewChat: vi.fn(),
    onImportSession: vi.fn(),
    onDelete: vi.fn(),
    onRemoveProject: vi.fn(),
    onRename: vi.fn(),
    onSettings: vi.fn(),
    onCompact: vi.fn(),
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

  it("sessions-list remplit la liste ; clic importe la session", () => {
    const p = makeProps({ threads: projectThreads() });
    renderUi(<Sidebar {...p} />);
    fireEvent(window, new CustomEvent("atelier-open-resume", { detail: { provider: "codex" } }));
    fireEvent(window, new CustomEvent("sessions-list", {
      detail: [{ id: "sess-1", title: "Session A", mtime: 1783684800000 }],
    }));
    fireEvent.click(screen.getByText("Session A"));
    expect(p.onImportSession).toHaveBeenCalledWith("codex", "sess-1", "Session A");
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
