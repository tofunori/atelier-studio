import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryProposalCard, type DetailPropositionMemoire } from "./MemoryProposalCard";
import { setLanguage } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => { setLanguage("fr"); localStorage.clear(); });

const event = (over: Partial<{ origin: "agent" | "extraction"; replacedText: string | null }> = {}) => ({
  kind: "memory_proposal" as const,
  id: "mp_1",
  origin: over.origin ?? ("agent" as const),
  proposal: {
    text: "La fenêtre d'été du panel est JJA.",
    replaceId: over.replacedText ? "mem_old" : null,
    replacedText: over.replacedText ?? null,
    projectRoot: "/Users/t/Chapitre1-Albedo",
  },
});

describe("MemoryProposalCard", () => {
  it("montre le souvenir et son projet, sans rien enregistrer avant le clic", () => {
    const ecoute = vi.fn();
    window.addEventListener("memoire-proposition", ecoute);
    render(<MemoryProposalCard event={event()} threadId="t1" />);
    expect(screen.getByText("La fenêtre d'été du panel est JJA.")).toBeTruthy();
    expect(screen.getByText("Chapitre1-Albedo")).toBeTruthy();
    expect(screen.getByText("Souvenir proposé")).toBeTruthy();
    expect(ecoute).not.toHaveBeenCalled();
    window.removeEventListener("memoire-proposition", ecoute);
  });

  it("Garder envoie la proposition et attend la réponse du backend", async () => {
    let recu: DetailPropositionMemoire | null = null;
    const ecoute = (e: Event) => { recu = (e as CustomEvent).detail; };
    window.addEventListener("memoire-proposition", ecoute);
    render(<MemoryProposalCard event={event({ replacedText: "Fenêtre JJAS" })} threadId="t1" />);
    expect(screen.getByText("Fenêtre JJAS")).toBeTruthy();
    fireEvent.click(screen.getByText("Garder"));
    expect(recu).not.toBeNull();
    expect(recu!.proposal.replaceId).toBe("mem_old");
    expect(recu!.threadId).toBe("t1");
    recu!.done(true);
    await waitFor(() => expect(screen.getByText("Gardé dans la mémoire du projet")).toBeTruthy());
    window.removeEventListener("memoire-proposition", ecoute);
    cleanup();
    render(<MemoryProposalCard event={event()} />);
    expect(screen.getByText("Gardé dans la mémoire du projet")).toBeTruthy();
  });

  it("une erreur du backend laisse la carte ouverte", async () => {
    const ecoute = (e: Event) => (e as CustomEvent<DetailPropositionMemoire>).detail.done(false, "Le souvenir est vide.");
    window.addEventListener("memoire-proposition", ecoute);
    render(<MemoryProposalCard event={event({ origin: "extraction" })} />);
    expect(screen.getByText("Souvenir extrait du tour")).toBeTruthy();
    fireEvent.click(screen.getByText("Garder"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Le souvenir est vide."));
    expect(screen.getByText("Garder")).toBeTruthy();
    window.removeEventListener("memoire-proposition", ecoute);
  });

  it("Écarter ne prévient personne", () => {
    const ecoute = vi.fn();
    window.addEventListener("memoire-proposition", ecoute);
    render(<MemoryProposalCard event={event()} />);
    fireEvent.click(screen.getByText("Écarter"));
    expect(ecoute).not.toHaveBeenCalled();
    expect(screen.getByText("Proposition écartée")).toBeTruthy();
    window.removeEventListener("memoire-proposition", ecoute);
  });
});
