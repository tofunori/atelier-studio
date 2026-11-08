import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import { ProjectHeader } from "./ProjectHeader";

afterEach(cleanup);

describe("nom du projet", () => {
  it("ouvre le menu des projets récents, de l'écran des projets et de la création", async () => {
    setLanguage("fr");
    const menu = { recents: [{ root: "/p/Feux", name: "Chapitre2-Feux" }], onSelect: vi.fn(), onAll: vi.fn(), onOpenFolder: vi.fn(), onNew: vi.fn() };
    const settings = vi.fn();
    renderUi(<ProjectHeader mode="project" name="Chapitre1-Albedo" root="/p/Albedo" query=""
      onQueryChange={() => {}} onNew={() => {}} onOpenResume={() => {}}
      onProjectSettings={settings} switchMenu={menu} />);
    fireEvent.click(screen.getByRole("button", { name: /Chapitre1-Albedo — Changer de projet/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Chapitre2-Feux" }));
    expect(menu.onSelect).toHaveBeenCalledWith("/p/Feux");
    fireEvent.click(screen.getByRole("button", { name: /Changer de projet/ }));
    expect(await screen.findByRole("menuitem", { name: "Tous les projets…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Ouvrir un dossier…" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Nouveau projet…" }));
    expect(menu.onNew).toHaveBeenCalled();
  });
});
