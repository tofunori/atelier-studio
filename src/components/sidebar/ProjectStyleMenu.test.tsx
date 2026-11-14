import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import { ProjectStyleMenu } from "./ProjectStyleMenu";

afterEach(cleanup);

describe("menu du projet — renommer", () => {
  it("donne un nom d'affichage sans effacer l'icône ; vide ou égal au dossier, il reprend le dossier", async () => {
    setLanguage("fr");
    const onSetMeta = vi.fn();
    const onClose = vi.fn();
    renderUi(<ProjectStyleMenu root="/d/GEO1063/2026" meta={{ label: "icon:book", color: "#7aa2f7" }}
      onSetMeta={onSetMeta} onClose={onClose} anchor={{ x: 0, y: 0 }} onRemove={vi.fn()} />);
    fireEvent.click(await screen.findByText("Renommer"));
    const field = await screen.findByLabelText("Nom");
    expect(field).toHaveAttribute("placeholder", "2026");
    fireEvent.change(field, { target: { value: " GEO1063 · Automne 2026 " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSetMeta).toHaveBeenLastCalledWith("/d/GEO1063/2026", { label: "icon:book", color: "#7aa2f7", name: "GEO1063 · Automne 2026" });
    expect(onClose).toHaveBeenCalled();
  });

  it("le nom donné s'affiche en tête ; le choisir égal au dossier l'efface", async () => {
    setLanguage("fr");
    const onSetMeta = vi.fn();
    renderUi(<ProjectStyleMenu root="/d/GEO1063/2026" meta={{ name: "Cours GEO1063" }}
      onSetMeta={onSetMeta} onClose={vi.fn()} anchor={{ x: 0, y: 0 }} onRemove={vi.fn()} />);
    expect(await screen.findByText("Cours GEO1063")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Renommer"));
    const field = await screen.findByLabelText("Nom");
    expect(field).toHaveValue("Cours GEO1063");
    fireEvent.change(field, { target: { value: "2026" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSetMeta).toHaveBeenLastCalledWith("/d/GEO1063/2026", { name: undefined });
  });
});
