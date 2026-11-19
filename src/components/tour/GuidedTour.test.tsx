import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuidedTour from "./GuidedTour";
import { t } from "../../lib/i18n";
import {
  offerGuidedTour,
  registerTourDriver,
  resetGuidedTourForTests,
  startGuidedTour,
  tourSnapshot,
} from "../../lib/guidedTour";

const extras: HTMLElement[] = [];
function attach<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el);
  extras.push(el);
  return el;
}

afterEach(() => {
  cleanup();
  act(() => resetGuidedTourForTests());
  for (const el of extras.splice(0)) el.remove();
  localStorage.clear();
});

function setup() {
  const d = { openExample: vi.fn(async () => {}), prepare: vi.fn(), openOwnFolder: vi.fn() };
  registerTourDriver(d);
  return d;
}

describe("GuidedTour", () => {
  it("invitation discrète : Plus tard ferme sans rien ouvrir", () => {
    const d = setup();
    act(() => offerGuidedTour());
    render(<GuidedTour />);
    expect(screen.getByRole("dialog", { name: t("tour.invite-title") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("tour.later") }));
    expect(tourSnapshot().phase).toBe("idle");
    expect(d.openExample).not.toHaveBeenCalled();
  });

  it("un arrêt montre son rang, son texte et un anneau autour de la cible", async () => {
    setup();
    const target = document.createElement("div");
    target.setAttribute("data-tour", "composer");
    target.getBoundingClientRect = () => ({ left: 300, top: 600, width: 500, height: 80, right: 800, bottom: 680, x: 300, y: 600, toJSON: () => ({}) });
    attach(target);
    render(<GuidedTour />);
    await act(async () => { await startGuidedTour(); });
    fireEvent.click(screen.getByRole("button", { name: t("tour.next") }));
    expect(screen.getByText(t("tour.count", { n: 2, total: 6 }))).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: t("tour.chat-title") })).toBeInTheDocument();
    expect(document.querySelectorAll(".tour-ring")).toHaveLength(1);
  });

  it("le dernier arrêt dit Terminer, puis la carte de fin propose d'ouvrir son dossier", async () => {
    const d = setup();
    render(<GuidedTour />);
    await act(async () => { await startGuidedTour(); });
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: t("tour.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("tour.finish") }));
    expect(screen.getByRole("dialog", { name: t("tour.end-title") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("tour.open-own") }));
    expect(d.openOwnFolder).toHaveBeenCalled();
    expect(tourSnapshot().phase).toBe("idle");
  });

  it("Échap arrête la visite, flèches pour avancer et reculer", async () => {
    setup();
    render(<GuidedTour />);
    await act(async () => { await startGuidedTour(); });
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(tourSnapshot().step).toBe(1);
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(tourSnapshot().step).toBe(0);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(tourSnapshot().phase).toBe("idle");
  });

  it("une frappe dans le composer n'avance pas la visite", async () => {
    setup();
    const input = attach(document.createElement("textarea"));
    render(<GuidedTour />);
    await act(async () => { await startGuidedTour(); });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(tourSnapshot().step).toBe(0);
  });
});
