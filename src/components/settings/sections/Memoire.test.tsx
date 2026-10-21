import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Memoire, type Requete } from "./Memoire";
import { setLanguage } from "../../../lib/i18n";
import type { Souvenir } from "../../../lib/memoire";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

const souvenir: Souvenir = {
  id: "mem_1", projectRoot: "/t/Chapitre1-Albedo", text: "Le dépôt vient de FireWork moins noFire.",
  origin: { kind: "claude-science", sourceProject: "Analyses Feux-Albédo" },
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
};

function faux(reponses: Record<string, unknown> = {}) {
  return vi.fn<Requete>(async (type) => {
    if (type === "memoryList") return { ok: true, items: [souvenir], total: 1, counts: { "/t/Chapitre1-Albedo": 1 } };
    return { ok: true, ...(reponses[type] as object) };
  });
}

const reglages = { injection: true, extraction: false };

describe("Réglages › Mémoire", () => {
  it("liste les souvenirs du projet actif avec leur origine", async () => {
    const requete = faux();
    render(<Memoire reglages={reglages} onReglages={() => {}} projets={["/t/Chapitre1-Albedo"]}
      projetActif="/t/Chapitre1-Albedo" requete={requete} />);
    await waitFor(() => expect(screen.getByText(souvenir.text)).toBeTruthy());
    expect(requete).toHaveBeenCalledWith("memoryList", expect.objectContaining({ projectRoot: "/t/Chapitre1-Albedo" }));
    expect(screen.getByText("Claude Science · Analyses Feux-Albédo")).toBeTruthy();
  });

  it("l'extraction est un interrupteur à part, coupé par défaut", () => {
    const onReglages = vi.fn();
    render(<Memoire reglages={reglages} onReglages={onReglages} projets={[]} requete={null} />);
    fireEvent.click(screen.getByRole("switch", { name: "Proposer des souvenirs en fin de tour" }));
    expect(onReglages).toHaveBeenCalledWith({ injection: true, extraction: true });
  });

  it("corrige et efface un souvenir", async () => {
    const requete = faux({ memoryDelete: { removed: 1 } });
    render(<Memoire reglages={reglages} onReglages={() => {}} projets={[]} requete={requete} />);
    await waitFor(() => expect(screen.getByText(souvenir.text)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(screen.getByLabelText("Souvenir"), { target: { value: "Dépôt : FireWork − noFire." } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(requete).toHaveBeenCalledWith("memorySave", expect.objectContaining({
      memory: { id: "mem_1", text: "Dépôt : FireWork − noFire.", projectRoot: "/t/Chapitre1-Albedo" },
    })));
    fireEvent.click(screen.getByLabelText("Effacer"));
    await waitFor(() => expect(requete).toHaveBeenCalledWith("memoryDelete", { ids: ["mem_1"] }));
  });

  it("importe de Claude Science vers le projet choisi", async () => {
    const requete = faux({
      memoryClaudeSciencePreview: { projects: [
        { id: "p1", name: "Analyses Feux-Albédo", count: 7671, imported: 0, projectRoot: null },
        { id: "p2", name: "Demande de bourse", count: 111, imported: 0, projectRoot: null },
      ] },
      memoryClaudeScienceImport: { added: 7671, updated: 0, unchanged: 0 },
    });
    render(<Memoire reglages={reglages} onReglages={() => {}} projets={["/t/Chapitre1-Albedo"]} requete={requete} />);
    fireEvent.click(screen.getByText("Lire les projets de Claude Science"));
    await waitFor(() => expect(screen.getByText("Demande de bourse")).toBeTruthy());
    fireEvent.click(screen.getByText("Importer"));
    await waitFor(() => expect(requete).toHaveBeenCalledWith("memoryClaudeScienceImport", {
      targets: [{ projectId: "p1", projectRoot: "/t/Chapitre1-Albedo" }],
    }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("7671 ajoutés"));
    expect(screen.getByRole("status").textContent).not.toContain("effacé");
  });

  it("le bilan d'un réimport dit combien de souvenirs effacés ont été ignorés", async () => {
    const requete = faux({
      memoryClaudeSciencePreview: { projects: [
        { id: "p1", name: "Analyses Feux-Albédo", count: 3, imported: 2, projectRoot: "/t/Chapitre1-Albedo" },
      ] },
      memoryClaudeScienceImport: { added: 0, updated: 0, unchanged: 2, forgotten: 1 },
    });
    render(<Memoire reglages={reglages} onReglages={() => {}} projets={["/t/Chapitre1-Albedo"]} requete={requete} />);
    fireEvent.click(screen.getByText("Lire les projets de Claude Science"));
    await waitFor(() => expect(screen.getByText("Analyses Feux-Albédo")).toBeTruthy());
    fireEvent.click(screen.getByText("Importer"));
    await waitFor(() => expect(screen.getByRole("status").textContent)
      .toContain("1 effacé à la main, non réimporté"));
  });
});
