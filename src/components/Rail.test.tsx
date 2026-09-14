// Rail après le déménagement des surfaces (plan 055) : la colonne ne porte
// plus que l'identité (projets), les vues, et ce qui tourne. Les surfaces se
// testent désormais dans TopBarSurfaces.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup } from "@testing-library/react";
import Rail from "./Rail";
import { chatSealFor } from "./sidebar/ChatSeal";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage, t } from "../lib/i18n";
import type { Surface } from "./surfaces";
import type { ViewId } from "../lib/settings";

const articleState: { jobs: unknown[]; focused: string | null; open: boolean } = {
  jobs: [], focused: null, open: false,
};
vi.mock("../lib/articleImports", () => ({
  articleImportSnapshot: () => articleState,
  subscribeArticleImport: () => () => {},
  openArticleDialog: vi.fn(),
  fileName: (path: string) => String(path).split("/").pop() ?? path,
  stageLabel: (job: { stage?: string | null; stageSeconds?: number | null }) =>
    (job.stage === "converting"
      ? `conversion chez MinerU — ${job.stageSeconds} s`
      : "conversion d'article"),
}));

function makeProps(over: Partial<React.ComponentProps<typeof Rail>> = {}) {
  return {
    projects: ["/Users/t/thèse", "/Users/t/albedo"],
    activeProject: "/Users/t/thèse",
    meta: { "/Users/t/thèse": { color: "#e77f3e" } },
    running: new Set<string>(),
    activeView: "chats" as ViewId,
    compact: true,
    layout: "split" as const,
    activeSurface: "atelier" as Surface,
    onSelectSurface: vi.fn(),
    onSelectGallery: vi.fn(),
    onSelectIde: vi.fn(),
    ideActive: false,
    showExplorer: false,
    onToggleExplorer: vi.fn(),
    onSelectView: vi.fn(),
    onSelectProject: vi.fn(),
    onAddProject: vi.fn(),
    onExpand: vi.fn(),
    onSettings: vi.fn(),
    onSetMeta: vi.fn(),
    onRemoveProject: vi.fn(),
    onReorder: vi.fn(),
    moreOpen: false,
    onToggleMore: vi.fn(),
    onNewChat: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
  articleState.jobs = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("signale une réponse non lue, puis retire le point à l'ouverture", () => {
  const thread = { id: "finished", title: "Résultats", projectRoot: "/albedo", status: "done" } as any;
  const favorites = { threads: [thread], activeId: null as string | null, unread: new Set([thread.id]), seals: { finished: "disk" }, onOpen: vi.fn(), onToggle: vi.fn(), onReorder: vi.fn() };
  const { container, rerender } = renderUi(<Rail {...makeProps({ favorites })} />);
  expect(screen.getByRole("button", { name: /Réponse terminée · non lue/ })).toBeTruthy();
  expect(container.querySelector(".rail-favorite-unread")).toBeTruthy();
  expect(container.querySelector('.rail-favorite [data-seal="disk"]')).toBeTruthy();
  rerender(<Rail {...makeProps({ favorites: { ...favorites, activeId: thread.id } })} />);
  expect(container.querySelector(".rail-favorite-unread")).toBeNull();
});

it("ne montre pas le point pendant une exécution et conserve le symbole choisi", () => {
  const thread = { id: "running", title: "Calcul", projectRoot: "/albedo", status: "running" } as any;
  const { container } = renderUi(<Rail {...makeProps({ favorites: { threads: [thread], activeId: null, unread: new Set([thread.id]), onOpen: vi.fn(), onToggle: vi.fn(), onReorder: vi.fn() } })} />);
  expect(container.querySelector(".rail-favorite-unread")).toBeNull();
  expect(chatSealFor("thread", { thread: "tiles" })).toBe("tiles");
  expect(chatSealFor("thread", { thread: "invalid" })).toBe(chatSealFor("thread"));
});

describe("Rail — identité et vues", () => {
  it("ne porte plus aucune surface : elles vivent dans la barre du haut", () => {
    renderUi(<Rail {...makeProps()} />);
    expect(screen.queryByRole("button", { name: t("atelier.surface") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("atelier.biblio") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("atelier.calculs") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("atelier.more") })).toBeNull();
  });

  it("garde les vues dans les actions secondaires", async () => {
    const onSelectView = vi.fn();
    renderUi(<Rail {...makeProps({ onSelectView })} />);
    expect(screen.getByRole("button", { name: t("view.chats") })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }));
    expect(await screen.findByRole("menuitem", { name: t("automations.title") })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: t("view.highlights") }));
    expect(onSelectView).toHaveBeenCalledWith("highlights");
  });

  it("liste les projets et signale celui qui travaille", () => {
    const { container } = renderUi(
      <Rail {...makeProps({ running: new Set(["/Users/t/thèse"]) })} />,
    );
    expect(container.querySelectorAll(".rail-proj").length).toBe(2);
    expect(container.querySelector(".rail-proj.on")).toBeTruthy();
    expect(container.querySelector(".rail-dot")).toBeTruthy();
  });
});

describe("Rail — zone d'activité", () => {
  it("reste absente quand rien ne tourne", () => {
    const { container } = renderUi(<Rail {...makeProps()} />);
    expect(container.querySelector(".rail-activity")).toBeNull();
  });

  it("montre un agent au travail et une conversion en cours", async () => {
    articleState.jobs = [
      { requestId: "r1", path: "/tmp/rounce-2023.pdf", phase: "converting", message: null },
    ];
    const { container } = renderUi(
      <Rail {...makeProps({ running: new Set(["/Users/t/thèse"]) })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Activité en cours" }));
    const pastilles = container.querySelectorAll(".rail-act");
    expect(pastilles.length).toBe(2);
    expect(screen.getByTitle(/thèse — agent au travail/)).toBeTruthy();
    expect(screen.getByTitle(/rounce-2023.pdf — conversion d'article/)).toBeTruthy();
  });

  it("l'infobulle dit l'étape en cours, pas seulement « conversion »", async () => {
    articleState.jobs = [
      {
        requestId: "r3", path: "/tmp/aoki-2011.pdf", phase: "converting", message: null,
        stage: "converting", stageSeconds: 42,
      },
    ];
    renderUi(<Rail {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Activité en cours" }));
    expect(screen.getByTitle("aoki-2011.pdf — conversion chez MinerU — 42 s")).toBeTruthy();
  });

  it("un échec se distingue et reste cliquable", async () => {
    articleState.jobs = [
      { requestId: "r2", path: "/tmp/muff.pdf", phase: "error", message: "quota" },
    ];
    const { container } = renderUi(<Rail {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Activité en cours" }));
    expect(container.querySelector(".rail-act.failed")).toBeTruthy();
    expect(screen.getByTitle(/muff.pdf — échec/)).toBeTruthy();
  });
});

describe("Rail — menu contextuel d'un projet", () => {
  it("clic droit sur une puce : « Retirer le projet » remonte la racine visée", async () => {
    const onRemoveProject = vi.fn();
    renderUi(<Rail {...makeProps({ onRemoveProject })} />);
    fireEvent.contextMenu(screen.getByTitle("albedo"));
    const remove = await screen.findByRole("button", { name: t("project.remove") });
    fireEvent.click(remove);
    expect(onRemoveProject).toHaveBeenCalledWith("/Users/t/albedo");
  });
});


describe("Rail — favoris globaux", () => {
  it("choisit un symbole depuis le sous-menu du favori", async () => {
    const onSetSeal = vi.fn();
    const thread = { id: "other", title: "Discussion", projectRoot: "/Users/t/albedo" } as any;
    renderUi(<Rail {...makeProps({ favorites: { threads: [thread], activeId: null, onOpen: vi.fn(), onToggle: vi.fn(), onReorder: vi.fn(), onSetSeal } })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Discussion — albedo" }));
    const submenu = await screen.findByRole("menuitem", { name: "Changer l’icône" });
    submenu.focus();
    fireEvent.keyDown(submenu, { key: "ArrowRight" });
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Quatre cases" }));
    expect(onSetSeal).toHaveBeenCalledWith("other", "tiles");
  });
  it("ouvre un favori d'un autre projet sans développer la barre", async () => {
    const onOpen = vi.fn();
    const thread = { id: "other", title: "Discussion", projectRoot: "/Users/t/albedo" } as any;
    renderUi(<Rail {...makeProps({ favorites: { threads: [thread], activeId: null, onOpen, onToggle: vi.fn(), onReorder: vi.fn() } })} />);
    const button = screen.getByRole("button", { name: "Discussion — albedo" });
    fireEvent.pointerDown(button, { button: 0 });
    fireEvent.mouseDown(button, { button: 0 });
    fireEvent.mouseUp(button, { button: 0 });
    fireEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onOpen).toHaveBeenCalledWith(thread);
  });
  it("désépingle depuis le menu contextuel", async () => {
    const onToggle = vi.fn();
    const thread = { id: "other", title: "Discussion", projectRoot: "/Users/t/albedo" } as any;
    renderUi(<Rail {...makeProps({ favorites: { threads: [thread], activeId: "other", onOpen: vi.fn(), onToggle, onReorder: vi.fn() } })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Discussion — albedo" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Désépingler" }));
    expect(onToggle).toHaveBeenCalledWith("other");
  });
});


it("ouvre au clavier et affiche tous les favoris sans panneau supplémentaire", async () => {
  const onOpen = vi.fn();
  const threads = Array.from({ length: 7 }, (_, i) => ({ id: String(i), title: `Chat ${i}`, projectRoot: `/projet${i}` })) as any;
  const { container } = renderUi(<Rail {...makeProps({ favorites: { threads, activeId: "0", onOpen, onToggle: vi.fn(), onReorder: vi.fn() } })} />);
  expect(container.querySelectorAll(".rail-favorite")).toHaveLength(7);
  fireEvent.keyDown(screen.getByRole("button", { name: "Chat 0 — projet0" }), { key: "Enter" });
  expect(onOpen).toHaveBeenCalledWith(threads[0]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.queryByRole("button", { name: "Gérer les chats épinglés" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Chat 6 — projet6" }));
  expect(onOpen).toHaveBeenLastCalledWith(threads[6]);
});
