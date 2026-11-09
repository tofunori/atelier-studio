import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import { SideBottom } from "./SideColumnParts";

beforeEach(() => setLanguage("fr"));
afterEach(cleanup);

function setup(onAllProjects?: () => void) {
  renderUi(
    <SideBottom
      projects={["/p/Chapitre1-Albedo", "/p/GEO1063"]}
      meta={{}}
      headerProject="/p/Chapitre1-Albedo"
      discussionsActive={false}
      running={new Set()}
      onSelectProject={vi.fn()}
      onAddProject={vi.fn()}
      onAllProjects={onAllProjects}
      onDiscussions={vi.fn()}
      onSettings={vi.fn()}
      onSetMeta={vi.fn()}
      onRemoveProject={vi.fn()}
      onReorder={vi.fn()}
    />,
  );
}

describe("bas de la colonne : retour à l'accueil des projets", () => {
  it("la rangée « Tous les projets » et le titre « Projets » ouvrent l'accueil", () => {
    const onAll = vi.fn();
    setup(onAll);
    const row = screen.getByRole("button", { name: /Tous les projets/ });
    expect(row.getAttribute("aria-keyshortcuts")).toBe("Meta+Shift+P");
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Projets" }));
    expect(onAll).toHaveBeenCalledTimes(2);
    // le projet courant n'est pas répété en bas
    expect(screen.queryByRole("button", { name: "Chapitre1-Albedo" })).toBeNull();
  });

  it("sans accueil branché, rien de neuf", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Tous les projets/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Projets" })).toBeNull();
  });
});
