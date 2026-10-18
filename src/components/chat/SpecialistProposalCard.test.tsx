import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecialistProposalCard } from "./SpecialistProposalCard";
import { setLanguage } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => { setLanguage("fr"); localStorage.clear(); });

const event = {
  kind: "specialist_proposal" as const,
  id: "sp_1",
  proposal: {
    nom: "Spécialiste Peyto", nomCourt: "Peyto", role: "Bilan de masse de Peyto",
    instructions: "Tu connais Peyto.", skills: ["bilan-energie-fonte"], connecteurs: ["scholar"], replaceId: null,
  },
};

describe("SpecialistProposalCard", () => {
  it("montre la fiche proposée et n'enregistre rien avant le clic", () => {
    const ecoute = vi.fn();
    window.addEventListener("specialiste-proposition", ecoute);
    render(<SpecialistProposalCard event={event} />);
    expect(screen.getByText("Spécialiste Peyto")).toBeTruthy();
    expect(screen.getByText("@Peyto")).toBeTruthy();
    expect(screen.getByText("bilan-energie-fonte")).toBeTruthy();
    expect(ecoute).not.toHaveBeenCalled();
    window.removeEventListener("specialiste-proposition", ecoute);
  });

  it("Garder envoie la proposition à l'app et retient la décision", () => {
    const ecoute = vi.fn();
    window.addEventListener("specialiste-proposition", ecoute);
    render(<SpecialistProposalCard event={event} />);
    fireEvent.click(screen.getByText("Garder"));
    expect((ecoute.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ action: "garder", proposal: event.proposal });
    expect(screen.getByText("Gardé dans tes spécialistes")).toBeTruthy();
    cleanup();
    render(<SpecialistProposalCard event={event} />);
    expect(screen.queryByText("Garder")).toBeNull();
    window.removeEventListener("specialiste-proposition", ecoute);
  });

  it("Écarter n'envoie rien", () => {
    const ecoute = vi.fn();
    window.addEventListener("specialiste-proposition", ecoute);
    render(<SpecialistProposalCard event={event} />);
    fireEvent.click(screen.getByText("Écarter"));
    expect(ecoute).not.toHaveBeenCalled();
    expect(screen.getByText("Proposition écartée")).toBeTruthy();
    window.removeEventListener("specialiste-proposition", ecoute);
  });
});
