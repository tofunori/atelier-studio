import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TOUR_OFFERED_KEY,
  closeGuidedTour,
  launchGuidedTour,
  nextTourStep,
  offerGuidedTour,
  previousTourStep,
  registerTourDriver,
  resetGuidedTourForTests,
  startGuidedTour,
  tourSnapshot,
} from "./guidedTour";

function driver(openExample = vi.fn(async () => {})) {
  const d = { openExample, prepare: vi.fn(), openOwnFolder: vi.fn() };
  registerTourDriver(d);
  return d;
}

afterEach(() => {
  resetGuidedTourForTests();
  localStorage.clear();
});

describe("visite guidée", () => {
  it("l'invitation ne se propose qu'une fois", () => {
    offerGuidedTour();
    expect(tourSnapshot().phase).toBe("invite");
    expect(localStorage.getItem(TOUR_OFFERED_KEY)).toBe("1");
    closeGuidedTour();
    offerGuidedTour();
    expect(tourSnapshot().phase).toBe("idle");
  });

  it("Commencer ouvre l'exemple puis pose le premier arrêt", async () => {
    const d = driver();
    offerGuidedTour();
    await startGuidedTour();
    expect(d.openExample).toHaveBeenCalledTimes(1);
    expect(tourSnapshot()).toMatchObject({ phase: "step", step: 0 });
    expect(d.prepare).toHaveBeenLastCalledWith("projects");
  });

  it("Suivant, retour, puis la carte de fin après le sixième arrêt", async () => {
    const d = driver();
    await startGuidedTour();
    nextTourStep();
    expect(d.prepare).toHaveBeenLastCalledWith("chat");
    previousTourStep();
    expect(tourSnapshot().step).toBe(0);
    for (let i = 0; i < 5; i++) nextTourStep();
    expect(tourSnapshot()).toMatchObject({ phase: "step", step: 5 });
    expect(d.prepare).toHaveBeenLastCalledWith("surfaces");
    nextTourStep();
    expect(tourSnapshot().phase).toBe("end");
  });

  it("un échec du projet d'exemple reste sur l'invitation, avec le motif", async () => {
    driver(vi.fn(async () => { throw new Error("disque plein"); }));
    await startGuidedTour();
    expect(tourSnapshot()).toMatchObject({ phase: "invite", error: "disque plein" });
  });

  it("relancer depuis les réglages saute l'invitation et ne la reproposera pas", async () => {
    const d = driver();
    launchGuidedTour();
    await Promise.resolve();
    await Promise.resolve();
    expect(d.openExample).toHaveBeenCalled();
    expect(tourSnapshot().phase).toBe("step");
    closeGuidedTour();
    offerGuidedTour();
    expect(tourSnapshot().phase).toBe("idle");
  });
});
