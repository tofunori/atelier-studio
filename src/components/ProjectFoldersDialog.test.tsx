import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi } from "../test/render";
import { setLanguage } from "../lib/i18n";
import ProjectFoldersDialog from "./ProjectFoldersDialog";
import type { ProjectFolders } from "../lib/projectFolders";
import { open } from "@tauri-apps/plugin-dialog";
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
afterEach(cleanup);
describe("project folders dialog", () => {
  it("keeps access options inside the modal and persists read-write selection", async () => {
    setLanguage("fr");
    const changes = vi.fn();
    function Harness() {
      const [value, setValue] = useState<ProjectFolders>({ mainGallery: true, folders: [{ path: "/data", name: "Data", access: "read", gallery: true }] });
      return <ProjectFoldersDialog root="/main" value={value} onChange={next => { changes(next); setValue(next); }} onClose={() => {}}/>;
    }
    renderUi(<Harness/>);
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("data-slot")).toBe("dialog-content"));
    fireEvent.click(screen.getByRole("combobox", { name: "Accès Codex" }));
    const option = await screen.findByRole("option", { name: "Lecture et écriture" });
    expect(screen.getByRole("dialog").closest('[data-slot="dialog-viewport"]')).toContainElement(option);
    fireEvent.click(option);
    fireEvent.keyDown(option, { key: "Enter" });
    await waitFor(() => expect(changes.mock.calls.slice(-1)[0]?.[0].folders[0].access).toBe("write"));
  });
  it("adds a read-only folder, separates gallery visibility, and unlinks without deleting", async () => {
    setLanguage("fr"); vi.mocked(open).mockResolvedValue("/data"); const changes = vi.fn();
    function Harness() { const [value, setValue] = useState<ProjectFolders>({ mainGallery: true, folders: [] }); return <ProjectFoldersDialog root="/main" value={value} onChange={next => { changes(next); setValue(next); }} onClose={() => {}}/>; }
    renderUi(<Harness/>);
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("data-slot")).toBe("dialog-content"));
    expect(screen.getByRole("dialog", { name: "Dossiers du projet" })).toBeVisible();
    expect(document.querySelector(".project-folders-help")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un dossier" }));
    await waitFor(() => expect(changes).toHaveBeenCalled());
    expect(changes.mock.calls[0][0].folders[0]).toMatchObject({ path: "/data", access: "read", gallery: true });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(changes.mock.calls.slice(-1)[0][0].folders[0]).toMatchObject({ access: "read", gallery: false });
    fireEvent.click(screen.getByRole("button", { name: "Dissocier le dossier" }));
    expect(changes.mock.calls.slice(-1)[0][0].folders).toEqual([]);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("édite la revue et l'échéance de la carte du projet", async () => {
    setLanguage("fr"); const patch = vi.fn();
    renderUi(<ProjectFoldersDialog root="/main" value={{ mainGallery: true, folders: [] }} onChange={() => {}} onClose={() => {}}
      card={{ due: { date: "2026-12-01" } }} onCardChange={patch}/>);
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("data-slot")).toBe("dialog-content"));
    fireEvent.change(screen.getByLabelText("Revue"), { target: { value: "The Cryosphere" } });
    expect(patch).toHaveBeenLastCalledWith({ journal: "The Cryosphere" });
    fireEvent.change(screen.getByLabelText("Libellé"), { target: { value: "Soumission" } });
    expect(patch).toHaveBeenLastCalledWith({ due: { date: "2026-12-01", label: "Soumission" } });
    fireEvent.change(screen.getByLabelText("Échéance"), { target: { value: "" } });
    expect(patch).toHaveBeenLastCalledWith({ due: undefined });
  });
  it("renomme le projet sans toucher au dossier : vide, il reprend le nom du dossier", async () => {
    setLanguage("fr"); const patch = vi.fn();
    renderUi(<ProjectFoldersDialog root="/d/GEO1063/2026" value={{ mainGallery: true, folders: [] }} onChange={() => {}} onClose={() => {}}
      card={{ name: "GEO1063" }} onCardChange={patch}/>);
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("data-slot")).toBe("dialog-content"));
    const name = screen.getByLabelText("Nom");
    expect(name).toHaveValue("GEO1063");
    expect(name).toHaveAttribute("placeholder", "2026");
    fireEvent.change(name, { target: { value: "GEO1063 · Automne 2026" } });
    expect(patch).toHaveBeenLastCalledWith({ name: "GEO1063 · Automne 2026" });
    fireEvent.change(name, { target: { value: "" } });
    expect(patch).toHaveBeenLastCalledWith({ name: undefined });
    // le dossier principal garde son nom
    expect(screen.getByText("/d/GEO1063/2026")).toBeInTheDocument();
  });
});
