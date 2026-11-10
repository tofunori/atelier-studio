import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResultsSurface from "./ResultsSurface";
import { setLanguage } from "../lib/i18n";
import type { ResultDetail, ResultSummary } from "./results/resultsModel";

vi.mock("./AtelierDiffView", () => ({
  default: ({ before, after }: { before: string; after: string }) => <pre data-testid="diff">{before}→{after}</pre>,
}));
const reveal = vi.hoisted(() => vi.fn((_path: string) => Promise.resolve()));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: reveal }));

let socket: EventTarget;
function fakeWs() {
  const sent: any[] = [];
  socket = new EventTarget();
  const ws = Object.assign(socket, { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)) }) as unknown as WebSocket;
  return { ws, sent };
}

function reply(detail: Record<string, unknown>) {
  act(() => { socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(detail) })); });
}

const ROOT = "/proj/these";
const year = new Date().getFullYear();
const at = (m: number, d: number, h: number, min: number) => new Date(year, m - 1, d, h, min).getTime();

const fig3: ResultSummary = {
  path: "figures/fig3_regional_years.png", name: "fig3_regional_years.png", kind: "figure", ext: "png", version: 5,
  ts: at(11, 9, 11, 40), size: 212_000, origin: { kind: "script", label: "fig3_regional.py", path: "analysis/fig3_regional.py" },
  starred: true, stale: { input: "data/panel_bayes_JJA.parquet", name: "panel_bayes_JJA.parquet", changedAt: at(11, 9, 13, 10), count: 1 },
};
const mainPdf: ResultSummary = {
  path: "out/main.pdf", name: "main.pdf", kind: "pdf", ext: "pdf", version: 12, ts: at(11, 9, 14, 10), size: 1_400_000,
  origin: { kind: "command", label: "tectonic main.tex" }, starred: false, stale: null,
};
const tendances: ResultSummary = {
  path: "tables/tendances_regions.csv", name: "tendances_regions.csv", kind: "table", ext: "csv", version: 4,
  ts: at(11, 8, 1, 25), size: 4_200, origin: { kind: "cell", label: "29", cell: 29, threadId: "t1" }, starred: false, stale: null,
};
const RESULTS = [fig3, mainPdf, tendances];

const fig3Detail: ResultDetail = {
  ...fig3, width: 2400, height: 1500, abs: `${ROOT}/figures/fig3_regional_years.png`,
  sidecar: `${ROOT}/figures/fig3_regional_years.png.prov.json`,
  recipe: {
    script: { path: "analysis/fig3_regional.py", sha: "c81e44a" },
    command: "python analysis/fig3_regional.py --annees 2002-2023",
    cell: null,
    inputs: [
      { path: "data/panel_bayes_JJA.parquet", name: "panel_bayes_JJA.parquet", sha: "91bd77e", size: 10, state: "changed", changedAt: at(11, 9, 13, 10), result: false },
      { path: "tables/tendances_regions.csv", name: "tendances_regions.csv", sha: "5f02c1d", size: 10, state: "unchanged", changedAt: null, result: true },
    ],
    env: { name: "atelier", python: "3.12.13", sha: "7c2f1ab", packages: 212 },
    threadId: "t1", threadTitle: "Figure 3", head: "0123456",
  },
  entry: { command: "python analysis/fig3_regional.py --annees 2002-2023", scripts: ["analysis/fig3_regional.py"] },
  versions: [
    { version: 5, ts: at(11, 9, 11, 40), current: true, origin: fig3.origin, compare: null },
    { version: 4, ts: at(11, 7, 16, 22), current: false, origin: fig3.origin, compare: null },
    { version: 3, ts: at(11, 2, 9, 5), current: false, origin: fig3.origin, compare: null },
    { version: 2, ts: at(10, 30, 10, 0), current: false, origin: fig3.origin, compare: null },
    { version: 1, ts: at(10, 29, 10, 0), current: false, origin: fig3.origin, compare: null },
  ],
  versionCount: 5, diffPath: null,
  dependsOn: [{ path: "tables/tendances_regions.csv", name: "tendances_regions.csv", kind: "table", version: 4 }],
  usedBy: [{ path: "out/main.pdf", name: "main.pdf", kind: "pdf", version: 12 }],
};

const tendancesDetail: ResultDetail = {
  ...tendances, width: null, height: null, abs: `${ROOT}/tables/tendances_regions.csv`,
  sidecar: `${ROOT}/tables/tendances_regions.csv.prov.json`,
  recipe: {
    script: null, command: null, cell: { id: 29, purpose: "Tendances par région", env: "atelier", threadId: "t1" },
    inputs: [], env: { name: "atelier", python: "3.12.13", sha: null, packages: 0 }, threadId: "t1",
  },
  entry: { cell: { id: 29 } },
  versions: [
    { version: 4, ts: at(11, 8, 1, 25), current: true, origin: tendances.origin, compare: null },
    { version: 3, ts: at(11, 6, 10, 0), current: false, origin: tendances.origin, compare: { git: "feed1234" } },
  ],
  versionCount: 4, diffPath: "tables/tendances_regions.csv", dependsOn: [], usedBy: [],
};

const noPreview = () => Promise.resolve("");

function mount(extra: Partial<Parameters<typeof ResultsSurface>[0]> = {}) {
  const { ws, sent } = fakeWs();
  const onOpenFile = vi.fn();
  render(<ResultsSurface ws={ws} projectRoot={ROOT} visible onOpenFile={onOpenFile} previewUrl={noPreview} {...extra} />);
  const list = sent.find((m) => m.type === "projectResults");
  return { sent, list, onOpenFile };
}

function load(extra: Record<string, unknown> = {}) {
  const mounted = mount();
  reply({ type: "projectResults", projectRoot: ROOT, requestId: mounted.list.requestId, recipes: true, results: RESULTS, truncated: false, starsError: null, ...extra });
  return mounted;
}

const lastDetailRequest = (sent: any[]) => sent.filter((m) => m.type === "projectResultDetail").pop();
const rowOf = (path: string) => document.querySelector(`.res-row-main[title="${path}"]`) as HTMLElement;
const cardOf = (path: string) => document.querySelector(`.res-card-main[title="${path}"]`) as HTMLElement;
const rowNames = () => Array.from(document.querySelectorAll(".res-name-text")).map((node) => node.textContent);

describe("ResultsSurface", () => {
  beforeEach(() => { setLanguage("fr"); (globalThis as any).WebSocket ??= { OPEN: 1 }; localStorage.clear(); reveal.mockClear(); });
  afterEach(cleanup);

  it("liste les résultats, du plus récent au plus ancien, avec version, origine, date et « périmé »", () => {
    const { list } = load();
    expect(list).toMatchObject({ projectRoot: ROOT });
    expect(screen.getByText("3 résultats · 1 périmé")).toBeTruthy();
    expect(rowNames()).toEqual(["main.pdf", "fig3_regional_years.png", "tendances_regions.csv"]);

    const row = rowOf("figures/fig3_regional_years.png").closest(".res-row") as HTMLElement;
    expect(within(row).getByText("v5")).toBeTruthy();
    expect(within(row).getByText("fig3_regional.py")).toBeTruthy();
    expect(within(row).getByText("9 nov. 11:40")).toBeTruthy();
    expect(within(row).getByText("périmé")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Retirer l’étoile" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(rowOf("tables/tendances_regions.csv")).getByText("cellule 29")).toBeTruthy();
    expect(within(rowOf("out/main.pdf").closest(".res-row") as HTMLElement).queryByText("périmé")).toBeNull();

    // tri par date : un clic sur « Modifié » inverse l'ordre
    fireEvent.click(screen.getByRole("button", { name: /Modifié/ }));
    expect(rowNames()).toEqual(["tendances_regions.csv", "fig3_regional_years.png", "main.pdf"]);
  });

  it("filtre par famille avec compteurs, et par texte", () => {
    load();
    const filters = screen.getByRole("radiogroup", { name: "Filtrer les résultats" });
    expect(within(filters).getByRole("radio", { name: "Figures" }).textContent).toBe("Figures1");
    expect(within(filters).getByRole("radio", { name: "Tableaux" }).textContent).toBe("Tableaux1");
    expect(within(filters).getByRole("radio", { name: "PDF" }).textContent).toBe("PDF1");

    fireEvent.click(within(filters).getByRole("radio", { name: "Tableaux" }));
    expect(rowNames()).toEqual(["tendances_regions.csv"]);
    fireEvent.click(within(filters).getByRole("radio", { name: "Tout" }));
    expect(rowNames()).toHaveLength(3);

    fireEvent.change(screen.getByRole("searchbox", { name: "Chercher" }), { target: { value: "tectonic" } });
    expect(rowNames()).toEqual(["main.pdf"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Chercher" }), { target: { value: "zzz" } });
    expect(screen.getByText("Aucun résultat ne correspond.")).toBeTruthy();
  });

  it("bascule entre la liste et la grille, et retient le choix", () => {
    load();
    expect(document.querySelector(".res-list")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Grille" }));
    expect(document.querySelector(".res-list")).toBeNull();
    expect(document.querySelectorAll(".res-card")).toHaveLength(3);
    expect(within(cardOf("figures/fig3_regional_years.png")).getByText("périmé")).toBeTruthy();
    expect(localStorage.getItem("atelier-studio.resultsView")).toBe("grid");
    cleanup();
    load();
    expect(document.querySelectorAll(".res-card")).toHaveLength(3);
  });

  it("ouvre le détail : bandeau périmé, recette, versions, dépend de, utilisé par", () => {
    const { sent, onOpenFile } = load();
    fireEvent.click(rowOf("figures/fig3_regional_years.png"));
    const request = lastDetailRequest(sent);
    expect(request).toMatchObject({ projectRoot: ROOT, path: "figures/fig3_regional_years.png" });
    reply({ type: "projectResultDetail", projectRoot: ROOT, requestId: request.requestId, path: fig3.path, result: fig3Detail });

    const detail = document.querySelector(".res-detail") as HTMLElement;
    expect(within(detail).getByText("v5 · 9 nov. " + year + " à 11:40 · PNG 2400 × 1500 · 212 Ko")).toBeTruthy();
    expect(within(detail).getByRole("status").textContent)
      .toBe("Périmé. panel_bayes_JJA.parquet a changé le 9 nov. à 13:10, après cette version.");

    // recette
    expect(within(detail).getByText("analysis/fig3_regional.py")).toBeTruthy();
    expect(within(detail).getByText("c81e44a")).toBeTruthy();
    expect(within(detail).getByText("python analysis/fig3_regional.py --annees 2002-2023")).toBeTruthy();
    const changed = detail.querySelector('.res-input[title="data/panel_bayes_JJA.parquet"]') as HTMLElement;
    expect(within(changed).getByText("modifié").getAttribute("data-state")).toBe("changed");
    expect(within(detail.querySelector('.res-input[title="tables/tendances_regions.csv"]') as HTMLElement).getByText("inchangé")).toBeTruthy();
    expect(within(detail).getByText("atelier · Python 3.12.13")).toBeTruthy();

    // versions : trois montrées, le reste replié ; pas de « Comparer » pour une figure
    const versions = within(detail).getByRole("region", { name: "Versions" });
    expect(within(versions).getByText("actuelle")).toBeTruthy();
    expect(versions.querySelectorAll(".res-version")).toHaveLength(3);
    expect(within(versions).queryByText("Comparer")).toBeNull();
    fireEvent.click(within(versions).getByText("2 plus anciennes"));
    expect(versions.querySelectorAll(".res-version")).toHaveLength(5);

    // actions
    fireEvent.click(within(detail).getByText("Ouvrir"));
    expect(onOpenFile).toHaveBeenCalledWith("figures/fig3_regional_years.png");
    fireEvent.click(within(detail).getByText("Afficher dans le Finder"));
    expect(reveal).toHaveBeenCalledWith(`${ROOT}/figures/fig3_regional_years.png`);
    const drafts: string[] = [];
    const onDraft = (event: Event) => drafts.push((event as CustomEvent).detail.text);
    window.addEventListener("kernel-add-to-chat", onDraft);
    fireEvent.click(within(detail).getByText("Reproduire"));
    window.removeEventListener("kernel-add-to-chat", onDraft);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatch(/^Reproduis ce résultat : \/proj\/these\/figures\/fig3_regional_years\.png\nRecette : /);

    // liens : « utilisé par » mène au résultat lié
    expect(within(detail).getByText("Dépend de")).toBeTruthy();
    fireEvent.click(within(detail).getByTitle("out/main.pdf"));
    expect(lastDetailRequest(sent)).toMatchObject({ path: "out/main.pdf" });
    expect((document.querySelector(".res-row[data-selected]") as HTMLElement).textContent).toContain("main.pdf");
  });

  it("compare une ancienne version d'un tableau avec le diff de l'historique", async () => {
    const { sent } = load();
    fireEvent.click(rowOf("tables/tendances_regions.csv"));
    const request = lastDetailRequest(sent);
    reply({ type: "projectResultDetail", projectRoot: ROOT, requestId: request.requestId, path: tendances.path, result: tendancesDetail });

    const detail = document.querySelector(".res-detail") as HTMLElement;
    expect(within(detail).getByText("29 · Tendances par région")).toBeTruthy();
    expect(within(detail).getByText("2 versions plus anciennes hors de la recette")).toBeTruthy();
    fireEvent.click(within(detail).getByText("Comparer"));
    const diff = sent.find((m) => m.type === "projectHistoryDiff");
    expect(diff).toMatchObject({ projectRoot: ROOT, path: "tables/tendances_regions.csv", before: { git: "feed1234" }, after: { disk: true } });
    reply({ type: "projectHistoryDiff", projectRoot: ROOT, requestId: diff.requestId, path: diff.path,
      before: { state: "text", text: "a,b" }, after: { state: "text", text: "a,c" } });
    expect((await screen.findByTestId("diff")).textContent).toBe("a,b→a,c");
    expect(within(detail).getByText("v3 comparée à la version actuelle")).toBeTruthy();
    fireEvent.click(within(detail).getByText("Fermer"));
    expect(screen.queryByTestId("diff")).toBeNull();
  });

  it("pose une étoile tout de suite, et la retire si le store refuse", () => {
    const { sent } = load();
    const row = rowOf("out/main.pdf").closest(".res-row") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Marquer d’une étoile" }));
    const star = sent.find((m) => m.type === "projectResultStar");
    expect(star).toMatchObject({ projectRoot: ROOT, path: "out/main.pdf", starred: true });
    expect(within(row).getByRole("button", { name: "Retirer l’étoile" })).toBeTruthy();

    reply({ type: "projectResultStarred", projectRoot: ROOT, requestId: star.requestId, ok: false, error: "étoiles illisibles" });
    expect(within(row).getByRole("button", { name: "Marquer d’une étoile" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("recettes éteintes et rien à montrer : une phrase et le bouton qui les allume", () => {
    const { list } = mount();
    reply({ type: "projectResults", projectRoot: ROOT, requestId: list.requestId, recipes: false, results: [], truncated: false, starsError: null });
    expect(screen.getByText("Aucun résultat pour l’instant")).toBeTruthy();
    expect(screen.getByText("Les recettes sont éteintes : sans elles, Atelier ne note pas ce que chaque tour produit.")).toBeTruthy();

    const turnedOn = vi.fn();
    window.addEventListener("results-recipes-on", turnedOn);
    fireEvent.click(screen.getByRole("button", { name: "Allumer les recettes" }));
    window.removeEventListener("results-recipes-on", turnedOn);
    expect(turnedOn).toHaveBeenCalledTimes(1);
    // allumées : l'écran passe à la phrase d'attente, sans bouton
    expect(screen.getByText("Les figures, tableaux et PDF produits par les prochains tours apparaîtront ici, avec leur recette.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Allumer les recettes" })).toBeNull();
  });

  it("recettes allumées mais rien encore : une phrase, sans bouton", () => {
    const { list } = mount();
    reply({ type: "projectResults", projectRoot: ROOT, requestId: list.requestId, recipes: true, results: [], truncated: false, starsError: null });
    expect(screen.getByText("Les figures, tableaux et PDF produits par les prochains tours apparaîtront ici, avec leur recette.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Allumer les recettes" })).toBeNull();
    expect(document.querySelector(".res-body")).toBeNull();
  });

  it("recettes éteintes alors que des résultats existent : la liste reste, avec un avis", () => {
    load({ recipes: false });
    expect(rowNames()).toHaveLength(3);
    expect(screen.getByText("Les recettes sont éteintes : les nouveaux fichiers produits n’apparaîtront pas ici.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Allumer les recettes" }));
    expect(screen.queryByText("Les recettes sont éteintes : les nouveaux fichiers produits n’apparaîtront pas ici.")).toBeNull();
  });

  it("sans projet, ou sur une réponse d'un autre projet, ne montre rien de faux", () => {
    const { ws, sent } = fakeWs();
    const { rerender } = render(<ResultsSurface ws={ws} projectRoot="" visible onOpenFile={() => {}} previewUrl={noPreview} />);
    expect(screen.getByText("Ouvre un projet pour voir ses résultats.")).toBeTruthy();
    expect(sent).toHaveLength(0);

    rerender(<ResultsSurface ws={ws} projectRoot={ROOT} visible onOpenFile={() => {}} previewUrl={noPreview} />);
    const list = sent.find((m) => m.type === "projectResults");
    reply({ type: "projectResults", projectRoot: "/proj/autre", requestId: list.requestId, recipes: true, results: RESULTS });
    expect(rowNames()).toEqual([]);
    reply({ type: "projectResults", projectRoot: ROOT, requestId: list.requestId, recipes: true, results: [], error: "projet illisible" });
    expect(screen.getByText("projet illisible")).toBeTruthy();
    expect(screen.queryByText("Aucun résultat pour l’instant")).toBeNull();
  });
});
