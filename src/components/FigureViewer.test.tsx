import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";
import type { KernelCell } from "../lib/kernel";

const sent: any[] = [];
vi.mock("../lib/wsBus", () => ({
  wsSend: (obj: unknown) => { sent.push(obj); return true; },
  wsReady: () => true,
}));

import KernelSurface from "./KernelSurface";

const DIR = "/app/kernel/figures/0123456789abcdef0123456789abcdef";
const RUNNING = { running: true, kernel: { pid: 1, pythonVersion: "3.12.4", env: { name: "pymc-albedo" }, cwd: "/p", startedAt: "" } };

function cell(id: number, figures: string[]): KernelCell {
  return { id, threadId: "fil", startedAt: "2026-10-21T13:18:00.000Z", durationMs: 6200, status: "ok", code: "fig.savefig('f.png')", stdout: "", figures };
}

function emit(name: string, detail: unknown) {
  act(() => { window.dispatchEvent(new CustomEvent(name, { detail })); });
}

/** Deux cellules, trois figures, comme un fil où l'on itère sur une figure. */
async function openWithFigures() {
  renderUi(<KernelSurface threadId="fil" threadTitle="Figure S" enabled projectRoot="/p" visible />);
  const req = sent.find((m) => m.type === "kernelCells");
  emit("kernel-cells", {
    requestId: req.requestId, threadId: "fil", status: RUNNING,
    cells: [cell(37, [`${DIR}/cellule-37-1.png`]), cell(38, [`${DIR}/cellule-38-1.png`, `${DIR}/cellule-38-2.png`])],
  });
  // Les aperçus arrivent après la lecture (asynchrone) de chaque image.
  await act(async () => {});
}

function loaded(img: HTMLImageElement, w = 1600, h = 1000) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  fireEvent.load(img);
}

describe("Visionneuse des figures du noyau", () => {
  beforeEach(() => {
    resetTestState();
    setLanguage("fr");
    sent.length = 0;
    // Sans animation : la fermeture est immédiate et le test reste synchrone.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("un clic sur l'aperçu ouvre la figure en grand, Échap la ferme et rend le focus", async () => {
    await openWithFigures();
    const thumb = screen.getByLabelText("Agrandir cellule-38-1.png");
    fireEvent.click(thumb);
    const viewer = screen.getByTestId("figure-viewer");
    expect(viewer.getAttribute("role")).toBe("dialog");
    expect(within(viewer).getByText("cellule-38-1.png")).toBeTruthy();
    expect(within(viewer).getByText("Cellule 38")).toBeTruthy();
    expect(within(viewer).getByText("2 / 3")).toBeTruthy();
    // La figure n'est pas copiée dans le projet en l'ouvrant.
    expect(sent.some((m) => m.op === "link")).toBe(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("figure-viewer")).toBeNull();
    expect(document.activeElement).toBe(thumb);
  });

  it("Tab reste dans la visionneuse", async () => {
    await openWithFigures();
    fireEvent.click(screen.getByLabelText("Agrandir cellule-38-1.png"));
    const viewer = screen.getByTestId("figure-viewer");
    const close = within(viewer).getByLabelText("Fermer", { selector: "button:not(.figure-viewer-scrim)" });
    close.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(viewer.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it("le bouton « Agrandir » de la barre de survol ouvre aussi la visionneuse", async () => {
    await openWithFigures();
    fireEvent.click(screen.getAllByLabelText("Agrandir")[0]);
    expect(within(screen.getByTestId("figure-viewer")).getByText("1 / 3")).toBeTruthy();
  });

  it("← → parcourent les figures du fil, en boucle", async () => {
    await openWithFigures();
    fireEvent.click(screen.getByLabelText("Agrandir cellule-37-1.png"));
    const viewer = screen.getByTestId("figure-viewer");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(viewer).getByText("cellule-38-1.png")).toBeTruthy();
    fireEvent.click(within(viewer).getByLabelText("Figure suivante"));
    expect(within(viewer).getByText("3 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(viewer).getByText("1 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(within(viewer).getByText("cellule-38-2.png")).toBeTruthy();
  });

  it("un clic à côté de la figure ferme, un clic sur la figure non", async () => {
    await openWithFigures();
    fireEvent.click(screen.getByLabelText("Agrandir cellule-37-1.png"));
    const viewer = screen.getByTestId("figure-viewer");
    fireEvent.click(viewer.querySelector("img.figure-viewer-img")!);
    expect(screen.getByTestId("figure-viewer")).toBeTruthy();
    fireEvent.click(viewer.querySelector(".figure-viewer-scrim")!);
    expect(screen.queryByTestId("figure-viewer")).toBeNull();
  });

  it("zoom : double-clic, boutons et touches, puis retour à « Ajustée »", async () => {
    await openWithFigures();
    fireEvent.click(screen.getByLabelText("Agrandir cellule-37-1.png"));
    const viewer = screen.getByTestId("figure-viewer");
    const img = viewer.querySelector<HTMLImageElement>("img.figure-viewer-img")!;
    loaded(img);
    const fit = within(viewer).getByLabelText("Ajuster à la fenêtre (0)");
    expect(fit.textContent).toBe("Ajustée");
    expect((within(viewer).getByLabelText("Dézoomer") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.doubleClick(img);
    expect(fit.textContent).toBe("200 %");
    expect(img.style.transform).toContain("scale(2)");
    fireEvent.click(within(viewer).getByLabelText("Zoomer"));
    expect(fit.textContent).toBe("250 %");
    fireEvent.keyDown(window, { key: "-" });
    expect(fit.textContent).toBe("200 %");
    fireEvent.keyDown(window, { key: "0" });
    expect(fit.textContent).toBe("Ajustée");
    fireEvent.doubleClick(img);
    fireEvent.click(fit);
    expect(fit.textContent).toBe("Ajustée");
  });

  it("« Citer dans le chat » ajoute la figure au brouillon et ferme", async () => {
    await openWithFigures();
    fireEvent.click(screen.getByLabelText("Agrandir cellule-38-2.png"));
    const appended = vi.fn();
    window.addEventListener("chat-compose-append", (e) => appended((e as CustomEvent).detail));
    fireEvent.click(within(screen.getByTestId("figure-viewer")).getByLabelText("Citer dans le chat"));
    expect(appended).toHaveBeenCalledWith({ text: `Figure de la cellule [38] : ${DIR}/cellule-38-2.png`, threadId: "fil" });
    expect(screen.queryByTestId("figure-viewer")).toBeNull();
  });

  it("la visionneuse reprend les actions galerie de l'aperçu", async () => {
    await openWithFigures();
    fireEvent.click(screen.getByLabelText("Agrandir cellule-37-1.png"));
    const viewer = screen.getByTestId("figure-viewer");
    expect(within(viewer).getByLabelText("Ouvrir dans la galerie")).toBeTruthy();
    expect(within(viewer).getByLabelText("Enregistrer dans la galerie")).toBeTruthy();
  });
});
