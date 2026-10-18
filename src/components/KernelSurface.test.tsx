import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";
import { figureCell, mergeCell, selectionContext, type KernelCell } from "../lib/kernel";

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

describe("noyau : utilitaires", () => {
  beforeEach(() => setLanguage("fr"));

  it("mergeCell remplace une cellule par sa version finie et garde l'ordre", () => {
    const merged = mergeCell([cell({ id: 2 }), cell({ id: 1, status: "running" })], cell({ id: 1, status: "ok" }));
    expect(merged.map((c) => [c.id, c.status])).toEqual([[1, "ok"], [2, "ok"]]);
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
