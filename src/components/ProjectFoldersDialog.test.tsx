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
});
