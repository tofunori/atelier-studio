import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import { mergeCell, type KernelCell } from "../../lib/kernel";

const sent: any[] = [];
vi.mock("../../lib/wsBus", () => ({
  wsSend: (obj: unknown) => { sent.push(obj); return true; },
  wsReady: () => true,
}));

import { KernelPanel } from "./KernelPanel";

function cell(over: Partial<KernelCell> = {}): KernelCell {
  return {
    id: 1, threadId: "fil", startedAt: "2026-10-18T10:00:00.000Z", durationMs: 1200,
    status: "ok", code: "df = pd.read_csv('albedo.csv')", stdout: "", filesRead: ["/p/albedo.csv"],
    ...over,
  };
}

function emit(name: string, detail: unknown) {
  act(() => { window.dispatchEvent(new CustomEvent(name, { detail })); });
}

describe("KernelPanel", () => {
  beforeEach(() => { resetTestState(); setLanguage("fr"); sent.length = 0; });
  afterEach(() => cleanup());

  it("demande les cellules du fil et les montre, la plus récente en haut", () => {
    renderUi(<KernelPanel threadId="fil" enabled onClose={() => {}} />);
    const req = sent.find((m) => m.type === "kernelCells");
    expect(req.threadId).toBe("fil");
    emit("kernel-cells", {
      requestId: req.requestId, threadId: "fil",
      cells: [
        cell(),
        cell({ id: 2, status: "error", code: "1/0", error: { ename: "ZeroDivisionError", evalue: "division by zero", traceback: "ZeroDivisionError: division by zero" } }),
      ],
      status: { running: true, kernel: { pid: 1, pythonVersion: "3.12.4", env: { name: "pymc-albedo" }, cwd: "/p", startedAt: "" } },
    });
    const cells = screen.getAllByTestId("kernel-cell");
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toContain("1/0");
    expect(cells[0].getAttribute("data-status")).toBe("error");
    expect(cells[1].textContent).toContain("albedo.csv");
    expect(screen.getByText("pymc-albedo · Python 3.12.4")).toBeTruthy();
    expect(screen.getByText("En marche")).toBeTruthy();
  });

  it("suit une cellule en direct et ignore celles d'un autre fil", () => {
    renderUi(<KernelPanel threadId="fil" enabled onClose={() => {}} />);
    emit("kernel-cell", { threadId: "autre", phase: "started", cell: cell({ id: 9, threadId: "autre", status: "running" }) });
    expect(screen.queryAllByTestId("kernel-cell")).toHaveLength(0);
    emit("kernel-cell", { threadId: "fil", phase: "started", cell: cell({ id: 3, status: "running", code: "fit()" }) });
    expect(screen.getByText("Cellule 3 en cours")).toBeTruthy();
    emit("kernel-cell", { threadId: "fil", phase: "finished", cell: cell({ id: 3, status: "ok", code: "fit()", durationMs: 40 }) });
    expect(screen.getAllByTestId("kernel-cell")).toHaveLength(1);
    expect(screen.getByText("40 ms")).toBeTruthy();
  });

  it("arrête le noyau sur demande", () => {
    renderUi(<KernelPanel threadId="fil" enabled onClose={() => {}} />);
    const req = sent.find((m) => m.type === "kernelCells");
    emit("kernel-cells", { requestId: req.requestId, threadId: "fil", cells: [],
      status: { running: true, kernel: { pid: 1, pythonVersion: "3.11.0", env: { name: "base" }, cwd: "/p", startedAt: "" } } });
    fireEvent.click(screen.getByText("Arrêter le noyau"));
    expect(sent[sent.length - 1]).toEqual({ type: "kernelStop", threadId: "fil" });
  });

  it("dit où l'allumer quand il est coupé", () => {
    renderUi(<KernelPanel threadId="fil" enabled={false} onClose={() => {}} />);
    expect(screen.getByText(/Allume-le dans le menu \+/)).toBeTruthy();
    expect(screen.getByText("Coupé")).toBeTruthy();
  });
});

describe("mergeCell", () => {
  it("remplace une cellule par sa version finie et garde l'ordre", () => {
    const merged = mergeCell([cell({ id: 2 }), cell({ id: 1, status: "running" })], cell({ id: 1, status: "ok" }));
    expect(merged.map((c) => [c.id, c.status])).toEqual([[1, "ok"], [2, "ok"]]);
  });
});
