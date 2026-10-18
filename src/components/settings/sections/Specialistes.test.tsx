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
    await waitFor(() => expect(screen.getByText("1 ajouté(s)")).toBeTruthy());
    expect((onChange.mock.calls[0][0] as Specialiste[])[0]).toMatchObject({ nom: "Références", origine: { cle: "REFS" } });
  });

  it("dit pourquoi l'import a échoué", async () => {
    const importer = vi.fn().mockResolvedValue({ ok: false, error: "Aucune base Claude Science trouvée" });
    render(<Specialistes specialistes={[]} onChange={() => {}} importer={importer} />);
    fireEvent.click(screen.getByText("Importer depuis Claude Science"));
    await waitFor(() => expect(screen.getByText("Aucune base Claude Science trouvée")).toBeTruthy());
  });
});
