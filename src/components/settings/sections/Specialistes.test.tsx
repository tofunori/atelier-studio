import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Specialistes } from "./Specialistes";
import { setLanguage } from "../../../lib/i18n";
import type { Specialiste } from "../../../lib/specialistes";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

const glacio: Specialiste = {
  id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue", role: "Albédo des glaciers",
  instructions: "Tu es glaciologue.", skills: [], tousSkills: true, connecteurs: [], visible: true,
};

describe("Réglages › Spécialistes", () => {
  it("crée une fiche vide et la sélectionne", () => {
    const onChange = vi.fn();
    render(<Specialistes specialistes={[glacio]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Nouveau spécialiste"));
    const liste = onChange.mock.calls[0][0] as Specialiste[];
    expect(liste).toHaveLength(2);
    expect(liste[1]).toMatchObject({ id: "sp2", nom: "", visible: true });
  });

  it("une fiche importée dit d'où elle vient", () => {
    render(<Specialistes specialistes={[{ ...glacio, origine: { source: "claude-science", cle: "G", empreinte: "e" } }]} onChange={() => {}} />);
    expect(screen.getByText("Importé de Claude Science.")).toBeTruthy();
  });

  it("signale les connecteurs absents du Mac", () => {
    render(<Specialistes specialistes={[{ ...glacio, connecteurs: ["Scholar", "zotero"] }]} onChange={() => {}}
      mcpDuMac={[{ nom: "scholar", sources: ["claude-desktop"] }, { nom: "gbrain", sources: ["codex"] }]} />);
    expect(screen.getByText("Absents du Mac : zotero")).toBeTruthy();
    expect(screen.getByText("Sur ton Mac : scholar, gbrain")).toBeTruthy();
  });

  it("signale les skills absents et les copie sur demande", async () => {
    const copier = vi.fn().mockResolvedValue({ ok: true, bilan: { copies: [{ nom: "bilan-energie-fonte", pour: "codex", depuis: "compte" }], introuvables: ["literature-review"] } });
    render(<Specialistes specialistes={[{ ...glacio, tousSkills: false, skills: ["bilan-energie-fonte", "literature-review"] }]} onChange={() => {}}
      skillsDuMac={[{ nom: "bilan-energie-fonte", claude: true, codex: false }]} copierSkills={copier} />);
    expect(screen.getByText("Absents pour Codex : bilan-energie-fonte, literature-review")).toBeTruthy();
    expect(screen.getByText("Absents pour Claude : literature-review")).toBeTruthy();
    fireEvent.click(screen.getByText("Copier ceux qui manquent"));
    await waitFor(() => expect(screen.getByText("Skills copiés sur le Mac : 1. Introuvables sur le Mac : literature-review.")).toBeTruthy());
    expect(copier).toHaveBeenCalledWith(["literature-review", "bilan-energie-fonte"]);
  });

  it("sans liste du Mac, ne signale aucun absent", () => {
    render(<Specialistes specialistes={[{ ...glacio, connecteurs: ["zotero"] }]} onChange={() => {}} />);
    expect(screen.queryByText(/Absents du Mac/)).toBeNull();
  });

  it("le nom court reste un mot", () => {
    const onChange = vi.fn();
    render(<Specialistes specialistes={[glacio]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Nom court"), { target: { value: "@Albédo glace" } });
    expect((onChange.mock.calls[0][0] as Specialiste[])[0].nomCourt).toBe("Albédoglace");
  });

  it("importe depuis Claude Science et résume le bilan", async () => {
    const onChange = vi.fn();
    const importer = vi.fn().mockResolvedValue({
      ok: true,
      specialistes: [{ cle: "REFS", nom: "Références", role: "", instructions: "x", skills: [], tousSkills: true, connecteurs: [], actif: true, modifieLe: "" }],
    });
    render(<Specialistes specialistes={[]} onChange={onChange} importer={importer} />);
    fireEvent.click(screen.getByText("Importer depuis Claude Science"));
    await waitFor(() => expect(screen.getByText("1 ajouté")).toBeTruthy());
    expect((onChange.mock.calls[0][0] as Specialiste[])[0]).toMatchObject({ nom: "Références", origine: { cle: "REFS" } });
  });

  it("dit pourquoi l'import a échoué", async () => {
    const importer = vi.fn().mockResolvedValue({ ok: false, error: "Aucune base Claude Science trouvée" });
    render(<Specialistes specialistes={[]} onChange={() => {}} importer={importer} />);
    fireEvent.click(screen.getByText("Importer depuis Claude Science"));
    await waitFor(() => expect(screen.getByText("Aucune base Claude Science trouvée")).toBeTruthy());
  });
});
