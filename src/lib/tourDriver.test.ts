import { afterEach, describe, expect, it, vi } from "vitest";

const sent: any[] = [];
vi.mock("./wsBus", () => ({ wsSend: (msg: unknown) => { sent.push(msg); return true; } }));

import { createTourDriver, type TourAppContext } from "./tourDriver";
import { registerTourDriver, resetGuidedTourForTests, startGuidedTour, nextTourStep } from "./guidedTour";

function app(overrides: Partial<TourAppContext> = {}): TourAppContext {
  return {
    activeProject: null,
    atelierUrl: "http://127.0.0.1:9000",
    openFileTab: vi.fn(),
    selectProject: vi.fn(),
    selectSurfaceFromBar: vi.fn(),
    switchToSurface: vi.fn(),
    addProject: vi.fn(async () => true),
    closeOverlays: vi.fn(),
    setProjects: vi.fn(),
    setActiveView: vi.fn(),
    setLayout: vi.fn(),
    setActiveTab: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  resetGuidedTourForTests();
  sent.length = 0;
  vi.useRealTimers();
});

describe("pilote de la visite", () => {
  it("demande le projet d'exemple au serveur, l'ajoute et l'ouvre", async () => {
    const ctx = app();
    const driver = createTourDriver(() => ctx);
    const opening = driver.openExample();
    expect(sent[0]).toMatchObject({ type: "createExampleProject" });
    window.dispatchEvent(new CustomEvent("project-created", {
      detail: { requestId: sent[0].requestId, root: "/home/t/Documents/Atelier/Glacier-Exemple" },
    }));
    await opening;
    expect(ctx.closeOverlays).toHaveBeenCalled();
    expect(ctx.selectProject).toHaveBeenCalledWith("/home/t/Documents/Atelier/Glacier-Exemple");
    expect(ctx.setLayout).toHaveBeenCalledWith("split");
  });

  it("une erreur du serveur fait échouer « Commencer » avec son motif", async () => {
    const driver = createTourDriver(() => app());
    const opening = driver.openExample();
    window.dispatchEvent(new CustomEvent("project-created", { detail: { requestId: sent[0].requestId, error: "Dossier personnel introuvable" } }));
    await expect(opening).rejects.toThrow("Dossier personnel introuvable");
  });

  it("l'arrêt Documents ouvre l'article, le cahier puis le rapport Word", async () => {
    const root = "/r/Glacier-Exemple";
    const ctx = app({ activeProject: root });
    const driver = createTourDriver(() => ctx);
    registerTourDriver(driver);
    const starting = startGuidedTour();
    window.dispatchEvent(new CustomEvent("project-created", { detail: { requestId: sent[0].requestId, root } }));
    await starting;
    for (let i = 0; i < 4; i++) nextTourStep();
    expect(ctx.openFileTab).toHaveBeenNthCalledWith(1, "documents/article.tex");
    expect(ctx.openFileTab).toHaveBeenNthCalledWith(2, "analyse.ipynb");
    expect(ctx.openFileTab).toHaveBeenNthCalledWith(3, "documents/rapport.docx");
  });

  it("attend le serveur galerie avant d'ouvrir les documents", async () => {
    vi.useFakeTimers();
    const root = "/r/Glacier-Exemple";
    const ctx = app({ activeProject: root, atelierUrl: null });
    const driver = createTourDriver(() => ctx);
    registerTourDriver(driver);
    const starting = startGuidedTour();
    window.dispatchEvent(new CustomEvent("project-created", { detail: { requestId: sent[0].requestId, root } }));
    await starting;
    for (let i = 0; i < 4; i++) nextTourStep();
    expect(ctx.openFileTab).not.toHaveBeenCalled();
    ctx.atelierUrl = "http://127.0.0.1:9000";
    vi.advanceTimersByTime(300);
    expect(ctx.openFileTab).toHaveBeenCalledTimes(3);
  });
});
