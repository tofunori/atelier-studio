// Rail après le déménagement des surfaces (plan 055) : la colonne ne porte
// plus que l'identité (projets), les vues, et ce qui tourne. Les surfaces se
// testent désormais dans TopBarSurfaces.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup } from "@testing-library/react";
import Rail from "./Rail";
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

describe("Rail — identité et vues", () => {
  it("ne porte plus aucune surface : elles vivent dans la barre du haut", () => {
    renderUi(<Rail {...makeProps()} />);
    expect(screen.queryByRole("button", { name: t("atelier.surface") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("atelier.biblio") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("atelier.narval") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("atelier.more") })).toBeNull();
  });

  it("garde les vues, Surlignés compris", () => {
    const onSelectView = vi.fn();
    renderUi(<Rail {...makeProps({ onSelectView })} />);
    expect(screen.getByRole("button", { name: t("view.chats") })).toBeTruthy();
    expect(screen.getByRole("button", { name: t("automations.title") })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("view.highlights") }));
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

  it("montre un agent au travail et une conversion en cours", () => {
    articleState.jobs = [
      { requestId: "r1", path: "/tmp/rounce-2023.pdf", phase: "converting", message: null },
    ];
    const { container } = renderUi(
      <Rail {...makeProps({ running: new Set(["/Users/t/thèse"]) })} />,
    );
    const pastilles = container.querySelectorAll(".rail-act");
    expect(pastilles.length).toBe(2);
    expect(screen.getByTitle(/thèse — agent au travail/)).toBeTruthy();
    expect(screen.getByTitle(/rounce-2023.pdf — conversion d'article/)).toBeTruthy();
  });

  it("l'infobulle dit l'étape en cours, pas seulement « conversion »", () => {
    articleState.jobs = [
      {
        requestId: "r3", path: "/tmp/aoki-2011.pdf", phase: "converting", message: null,
        stage: "converting", stageSeconds: 42,
      },
    ];
    renderUi(<Rail {...makeProps()} />);
    expect(screen.getByTitle("aoki-2011.pdf — conversion chez MinerU — 42 s")).toBeTruthy();
  });

  it("un échec se distingue et reste cliquable", () => {
    articleState.jobs = [
      { requestId: "r2", path: "/tmp/muff.pdf", phase: "error", message: "quota" },
    ];
    const { container } = renderUi(<Rail {...makeProps()} />);
    expect(container.querySelector(".rail-act.failed")).toBeTruthy();
    expect(screen.getByTitle(/muff.pdf — échec/)).toBeTruthy();
  });
});
