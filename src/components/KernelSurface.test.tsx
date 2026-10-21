import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";
import { figureCell, mergeCell, mergeProgress, selectionContext, type KernelCell } from "../lib/kernel";

const sent: any[] = [];
vi.mock("../lib/wsBus", () => ({
  wsSend: (obj: unknown) => { sent.push(obj); return true; },
  wsReady: () => true,
}));

import KernelSurface from "./KernelSurface";

function cell(over: Partial<KernelCell> = {}): KernelCell {
  return {
    id: 1, threadId: "fil", startedAt: "2026-10-18T10:00:00.000Z", durationMs: 1200,
    status: "ok", code: "df = pd.read_csv('albedo.csv')", stdout: "", filesRead: ["/p/albedo.csv"],
    ...over,
  };
}

const RUNNING = { running: true, kernel: { pid: 1, pythonVersion: "3.12.4", env: { name: "pymc-albedo" }, cwd: "/p", startedAt: "" } };

function emit(name: string, detail: unknown) {
  act(() => { window.dispatchEvent(new CustomEvent(name, { detail })); });
}

function open(enabled = true) {
  renderUi(<KernelSurface threadId="fil" threadTitle="Albédo 2024" enabled={enabled} projectRoot="/p" visible />);
  return sent.find((m) => m.type === "kernelCells");
}

describe("KernelSurface", () => {
  beforeEach(() => { resetTestState(); setLanguage("fr"); sent.length = 0; });
  afterEach(() => cleanup());

  it("montre les cellules du fil dans l'ordre, code coloré, erreur et fichiers", () => {
    const req = open();
    expect(req.threadId).toBe("fil");
    emit("kernel-cells", {
      requestId: req.requestId, threadId: "fil", status: RUNNING,
      cells: [
        cell(),
        cell({ id: 2, status: "error", code: "1/0", error: { ename: "ZeroDivisionError", evalue: "division by zero", traceback: "Traceback…" } }),
      ],
    });
    const cells = screen.getAllByTestId("kernel-cell");
    expect(cells.map((c) => c.getAttribute("data-cell"))).toEqual(["1", "2"]);
    expect(cells[0].querySelector("pre.kernel-code .hljs-string")?.textContent).toBe("'albedo.csv'");
    expect(cells[1].getAttribute("data-status")).toBe("error");
    expect(cells[1].querySelector(".kernel-ename")?.textContent).toBe("ZeroDivisionError");
    // Fichier du projet : une puce qui l'ouvre.
    const opened = vi.fn();
    window.addEventListener("chat-open-file", (e) => opened((e as CustomEvent).detail));
    fireEvent.click(screen.getAllByTitle("/p/albedo.csv")[0]);
    expect(opened).toHaveBeenCalledWith({ rel: "albedo.csv", line: null });
    expect(screen.getByText("En marche")).toBeTruthy();
    expect(screen.getByText("Python 3.12.4")).toBeTruthy();
    expect(screen.getByText("Fil « Albédo 2024 »")).toBeTruthy();
  });

  it("suit une cellule en direct, l'interrompt et ignore les autres fils", () => {
    open();
    emit("kernel-cell", { threadId: "autre", phase: "started", cell: cell({ id: 9, threadId: "autre", status: "running" }) });
    expect(screen.queryAllByTestId("kernel-cell")).toHaveLength(0);
    emit("kernel-cell", { threadId: "fil", phase: "started", cell: cell({ id: 3, status: "running", code: "fit()" }) });
    expect(screen.getByText("Cellule 3 en cours")).toBeTruthy();
    expect(screen.getByText("[*]")).toBeTruthy();
    fireEvent.click(screen.getByText("Interrompre"));
    expect(sent[sent.length - 1]).toMatchObject({ type: "kernelCommand", threadId: "fil", op: "interrupt" });
    emit("kernel-cell", { threadId: "fil", phase: "finished", cell: cell({ id: 3, status: "ok", code: "fit()", durationMs: 40 }) });
    expect(screen.getByText("40 ms")).toBeTruthy();
  });

  it("ne réécrit pas le code coloré d'une cellule quand une autre change (la sélection survit)", () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: RUNNING, cells: [cell()] });
    const before = screen.getByTestId("kernel-cell").querySelector("pre.kernel-code code")!.firstChild;
    emit("kernel-cell", { threadId: "fil", phase: "started", cell: cell({ id: 2, status: "running", code: "fit()" }) });
    const after = screen.getAllByTestId("kernel-cell")[0].querySelector("pre.kernel-code code")!.firstChild;
    expect(after).toBe(before);
  });

  it("liste les variables, redémarre et arrête", async () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", cells: [cell()], status: RUNNING });
    const ask = sent.find((m) => m.type === "kernelCommand" && m.op === "variables");
    expect(ask).toBeTruthy();
    emit("kernel-command", { requestId: ask.requestId, result: { variables: [
      { name: "df", type: "pandas.DataFrame", shape: [365, 4] },
      { name: "sites", type: "list", len: 3 },
    ] } });
    await act(async () => {});
    expect(screen.getByText("df")).toBeTruthy();
    expect(screen.getByText("DataFrame")).toBeTruthy();
    expect(screen.getByText("(365, 4)")).toBeTruthy();
    expect(screen.getByText("3 élém.")).toBeTruthy();
    fireEvent.click(screen.getByText("Redémarrer"));
    expect(sent[sent.length - 1]).toMatchObject({ type: "kernelCommand", op: "restart" });
    fireEvent.click(screen.getByText("Arrêter"));
    expect(sent[sent.length - 1]).toEqual({ type: "kernelStop", threadId: "fil" });
  });

  it("propose de l'allumer quand il est coupé", () => {
    open(false);
    expect(screen.getByText("Coupé")).toBeTruthy();
    const toggled = vi.fn();
    window.addEventListener("kernel-toggle", toggled);
    fireEvent.click(screen.getByText("Allumer le noyau"));
    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it("montre les figures captées avec leurs actions galerie", () => {
    const req = open();
    const png = "/app/kernel/figures/0123456789abcdef0123456789abcdef/cellule-4-1.png";
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: RUNNING, cells: [cell({ id: 4, figures: [png] })] });
    expect(screen.getByTestId("kernel-figure")).toBeTruthy();
    expect(screen.getByLabelText("Ouvrir dans la galerie")).toBeTruthy();
    expect(screen.getByLabelText("Enregistrer dans la galerie")).toBeTruthy();
    expect(screen.getByText("Dossier temporaire, pas encore dans le projet")).toBeTruthy();
  });
});

describe("KernelSurface : preuves et suivi", () => {
  beforeEach(() => { resetTestState(); setLanguage("fr"); sent.length = 0; });
  afterEach(() => cleanup());

  const turn = (id: number, turnId: string, over: Partial<KernelCell> = {}) =>
    cell({ id, turnId, turnPrompt: turnId === "t1" ? "Charge le panel" : "Compare 2012 et 2022", purpose: `But ${id}`, ...over });

  it("range les cellules par tour et replie les anciens tours, sauf erreur ou données modifiées", () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: RUNNING, cells: [
      turn(1, "t1"),
      turn(2, "t1", {
        prints: [{ path: "/p/albedo.csv", size: 10, mtimeMs: 0, sha256: "4e1a09c2aaaabbbb" }],
        stale: [{ path: "/p/albedo.csv", state: "modified", mtimeMs: Date.parse("2026-10-18T10:40:00Z") }],
      }),
      turn(3, "t2", { lineage: { created: ["cols"], modified: ["d"], uses: [{ name: "d", cell: 1 }] } }),
    ] });
    expect(screen.getByText("« Charge le panel »")).toBeTruthy();
    const cells = screen.getAllByTestId("kernel-cell");
    expect(cells.map((c) => c.getAttribute("data-folded"))).toEqual(["true", null, null]);
    expect(screen.getByText("Données modifiées depuis")).toBeTruthy();
    expect(screen.getByText(/modifié à/u)).toBeTruthy();
    expect(screen.getByText("sha 4e1a09c2")).toBeTruthy();
    // Lignée de la dernière cellule.
    const lineage = cells[2].querySelector(".kernel-lineage")!;
    expect(lineage.textContent).toBe("utilised [1]créecolsmodified");
    // Tout déplier le premier tour.
    fireEvent.click(screen.getByText("Tout déplier"));
    expect(screen.getAllByTestId("kernel-cell").map((c) => c.getAttribute("data-folded"))).toEqual([null, null, null]);
    // Replier une cellule d'un clic sur son titre.
    fireEvent.click(screen.getByText("But 3"));
    expect(screen.getAllByTestId("kernel-cell")[2].getAttribute("data-folded")).toBe("true");
  });

  it("modifier une cellule la relance comme nouvelle cellule liée à l'originale", () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: RUNNING, cells: [cell({ id: 31, code: "scatter(s=9)", purpose: "Tracer la figure" })] });
    fireEvent.click(screen.getByText("Modifier"));
    const area = screen.getByLabelText("Code de la cellule 31") as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "scatter(s=14)" } });
    expect(screen.getByText("Relancer comme cellule 32")).toBeTruthy();
    fireEvent.keyDown(area, { key: "Enter", shiftKey: true });
    expect(sent[sent.length - 1]).toMatchObject({ type: "kernelCommand", op: "rerun", code: "scatter(s=14)", fromCell: 31 });
    // La nouvelle cellule arrive, signée, avec ses lignes changées.
    emit("kernel-cell", { threadId: "fil", phase: "finished", cell: cell({
      id: 32, code: "scatter(s=14)", author: "user", fromCell: 31, purpose: "Tracer la figure",
      fromDiff: { removed: ["scatter(s=9)"], added: ["scatter(s=14)"], changed: 2 },
    }) });
    expect(screen.getByText("modifiée par toi, d'après [31]")).toBeTruthy();
    expect(screen.getByText("+ scatter(s=14)")).toBeTruthy();
    expect(screen.getByText("Tes cellules")).toBeTruthy();
  });

  it("sans agent : Démarrer, puis écrire et lancer sa propre cellule", async () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: { running: false }, cells: [] });
    expect(screen.getByText(/Écris du Python ci-dessous/u)).toBeTruthy();
    fireEvent.click(screen.getByText("Démarrer"));
    expect(sent[sent.length - 1]).toMatchObject({ type: "kernelCommand", op: "restart" });
    const area = screen.getByLabelText("Nouvelle cellule") as HTMLTextAreaElement;
    const run = screen.getByText("Lancer comme cellule 1").closest("button")!;
    expect(run.disabled).toBe(true);
    fireEvent.change(area, { target: { value: "x = 2 + 2\nprint(x)" } });
    fireEvent.keyDown(area, { key: "Enter", shiftKey: true });
    const ask = sent[sent.length - 1];
    expect(ask).toMatchObject({ type: "kernelCommand", op: "rerun", code: "x = 2 + 2\nprint(x)" });
    expect(ask.fromCell).toBeUndefined();
    emit("kernel-command", { requestId: ask.requestId, result: { cell: 1 } });
    await act(async () => {});
    expect(area.value).toBe("");
    emit("kernel-cell", { threadId: "fil", phase: "finished", cell: cell({ id: 1, code: "x = 2 + 2", author: "user", stdout: "4\n" }) });
    expect(screen.getByText("écrite par toi")).toBeTruthy();
    expect(screen.getByText("Lancer comme cellule 2")).toBeTruthy();
  });

  it("nouveau fil : reprend les cellules d'un fil précédent du projet", async () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: { running: false }, cells: [] });
    const ask = sent.find((m) => m.op === "projectThreads");
    emit("kernel-command", { requestId: ask.requestId, result: { threads: [
      { threadId: "ancien", title: "Albédo 2024", cells: 3, ok: 2, lastAt: "2026-10-18T10:00:00Z", lastPurpose: "Tracer" },
    ] } });
    await act(async () => {});
    expect(screen.getByText("Reprendre là où tu en étais")).toBeTruthy();
    fireEvent.click(screen.getByText("Albédo 2024"));
    // Les cellules du fil précédent s'affichent à l'ouverture.
    const peek = sent.find((m) => m.type === "kernelCells" && m.threadId === "ancien");
    emit("kernel-cells", { requestId: peek.requestId, threadId: "ancien", cells: [
      cell({ id: 1, threadId: "ancien", purpose: "Charger les données" }),
      cell({ id: 2, threadId: "ancien", status: "error", code: "1 / 0" }),
    ] });
    expect(screen.getByText("Charger les données")).toBeTruthy();
    fireEvent.click(screen.getByText("Reprendre ici (2 cellules)"));
    expect(sent[sent.length - 1]).toMatchObject({ type: "kernelCommand", op: "resume", threadId: "fil", fromThread: "ancien" });
    emit("kernel-resume", { threadId: "fil", fromThread: "ancien", state: "running", done: 0, total: 2, cell: 1 });
    expect(screen.getByText("Reprise 0/2")).toBeTruthy();
    emit("kernel-cell", { threadId: "fil", phase: "finished", cell: cell({
      id: 1, author: "user", purpose: "Charger les données", resumedFrom: { threadId: "ancien", title: "Albédo 2024", cell: 1 },
    }) });
    emit("kernel-resume", { threadId: "fil", fromThread: "ancien", state: "done", done: 2, total: 2 });
    expect(screen.getByText("Repris de « Albédo 2024 » : 2 cellules relancées")).toBeTruthy();
    expect(screen.getByText("Repris de « Albédo 2024 »")).toBeTruthy();
    expect(screen.getByText("reprise de [1]").getAttribute("title")).toBe("reprise de « Albédo 2024 », [1]");
    // Une fois des cellules là, la liste se rouvre depuis la cellule libre.
    fireEvent.click(screen.getByText("Reprendre un fil"));
    expect(screen.getByText("Reprendre là où tu en étais")).toBeTruthy();
  });

  it("coupé : ni Démarrer ni cellule libre", () => {
    open(false);
    expect(screen.queryByText("Démarrer")).toBeNull();
    expect(screen.queryByLabelText("Nouvelle cellule")).toBeNull();
  });

  it("Échap annule la modification", () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: RUNNING, cells: [cell()] });
    fireEvent.click(screen.getByText("Modifier"));
    fireEvent.keyDown(screen.getByLabelText("Code de la cellule 1"), { key: "Escape" });
    expect(screen.queryByLabelText("Code de la cellule 1")).toBeNull();
    expect(sent.some((m) => m.op === "rerun")).toBe(false);
  });

  it("rejoue à neuf, suit l'avancement et résume", () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: RUNNING, chain: { checked: 2 }, cells: [cell(), cell({ id: 2 })] });
    fireEvent.click(screen.getByText("Rejouer à neuf"));
    expect(sent[sent.length - 1]).toMatchObject({ type: "kernelCommand", op: "replay" });
    emit("kernel-replay", { threadId: "fil", state: "running", done: 1, total: 2, cell: 2 });
    expect(screen.getByText("Rejeu 1/2")).toBeTruthy();
    fireEvent.click(screen.getByText("Arrêter le rejeu"));
    expect(sent[sent.length - 1]).toMatchObject({ op: "cancelReplay" });
    emit("kernel-cell", { threadId: "fil", phase: "finished", cell: cell({ id: 2, replay: { at: "2026-10-18T10:05:00Z", status: "differs", detail: "ligne 1" } }) });
    emit("kernel-replay", { threadId: "fil", state: "done", summary: { total: 2, same: 1, files: 0, differs: 1, error: 0, skipped: 0, adopted: false, cancelled: false } });
    expect(screen.getByText("Rejeu à neuf : 1 sur 2 reproduites · 1 différente(s)")).toBeTruthy();
    expect(screen.getByText("Sortie différente")).toBeTruthy();
  });

  it("signale un journal retouché et montre les versions des paquets", () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", chain: { checked: 3, brokenAt: 2 }, cells: [cell()],
      status: { ...RUNNING, packages: [{ name: "numpy", version: "2.1.3" }], packagesTotal: 40 } });
    expect(screen.getByText(/modifié hors d'Atelier à partir de la cellule 2/u)).toBeTruthy();
    expect(screen.getByText("· numpy 2.1.3")).toBeTruthy();
    expect(screen.getByText("+39 paquets")).toBeTruthy();
  });

  it("exporte en .py et ouvre le fichier", async () => {
    const req = open();
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", status: RUNNING, cells: [cell()] });
    fireEvent.click(screen.getByText("Exporter"));
    await act(async () => {});
    fireEvent.click(await screen.findByText("Script Python (.py)"));
    const ask = sent.find((m) => m.op === "export");
    expect(ask).toMatchObject({ format: "py" });
    const opened = vi.fn();
    window.addEventListener("chat-open-file", (e) => opened((e as CustomEvent).detail));
    emit("kernel-command", { requestId: ask.requestId, result: { rel: "exports/noyau/fil-20261020-0200.py" } });
    await act(async () => {});
    expect(opened).toHaveBeenCalledWith({ rel: "exports/noyau/fil-20261020-0200.py", line: null });
  });
});

describe("noyau : utilitaires", () => {
  beforeEach(() => setLanguage("fr"));

  it("mergeCell remplace une cellule par sa version finie et garde l'ordre", () => {
    const merged = mergeCell([cell({ id: 2 }), cell({ id: 1, status: "running" })], cell({ id: 1, status: "ok" }));
    expect(merged.map((c) => [c.id, c.status])).toEqual([[1, "ok"], [2, "ok"]]);
  });

  it("mergeProgress ajoute la sortie en direct sans toucher au reste", () => {
    const merged = mergeProgress([cell({ id: 1, status: "running", purpose: "But" })], { id: 1, stdout: "époque 3\n", stderr: "" });
    expect(merged[0]).toMatchObject({ stdout: "époque 3\n", purpose: "But", status: "running" });
  });

  it("figureCell retrouve la cellule d'une figure captée, rien ailleurs", () => {
    expect(figureCell("/a/kernel/figures/0123456789abcdef0123456789abcdef/cellule-12-2.png")).toBe(12);
    expect(figureCell("/p/figures/plot.png")).toBeNull();
  });

  it("selectionContext dit d'où vient le passage envoyé au chat", () => {
    expect(selectionContext(3, "code", "df.mean()", [2, 2])).toBe("Noyau Python, cellule 3 (L2) : « df.mean() »");
    expect(selectionContext(3, "code", "a\nb", [2, 4])).toBe("Noyau Python, cellule 3 (L2-4) : « a\nb »");
    expect(selectionContext(5, "output", "0.42")).toBe("Noyau Python, cellule 5, sortie\n« 0.42 »");
  });
});
