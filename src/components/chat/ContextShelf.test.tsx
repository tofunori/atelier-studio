// ContextShelf (plan 018, étape 5) — l'hybride : les références simples
// (kind "file") deviennent des ContextChip avec source/type ; le markup
// riche (images, groupes ×N, lignes, aperçus) est CONSERVÉ ; supprimer un
// chip n'appelle QUE onRemoveAttachment (jamais la source) ; tous les
// contrôles de suppression ont un nom accessible.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ContextShelf, type ShelfAttachment } from "./ContextShelf";
import { setLanguage } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

function shelf(attachments: ShelfAttachment[]) {
  const onRemoveAttachment = vi.fn();
  const onOpenPaste = vi.fn();
  const utils = render(
    <ContextShelf attachments={attachments} onRemoveAttachment={onRemoveAttachment} onOpenPaste={onOpenPaste} />,
  );
  return { onRemoveAttachment, onOpenPaste, ...utils };
}

describe("ContextShelf", () => {
  it("référence simple (kind file) → ContextChip avec type et source complète au survol", () => {
    const { onRemoveAttachment, onOpenPaste, container } = shelf([
      { name: "plot.png", lines: null, kind: "file", text: "Fichier du projet ajouté au contexte : /p/figs/plot.png" },
    ]);
    const chip = container.querySelector(".ui-ctxchip")!;
    expect(chip).toHaveTextContent("fichier"); // type
    expect(chip.getAttribute("title")).toContain("/p/figs/plot.png"); // source
    fireEvent.click(screen.getByRole("button", { name: "Fermer plot.png" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
    expect(onOpenPaste).not.toHaveBeenCalled(); // la source n'est jamais touchée
  });

  it("paste → markup riche conservé, le libellé ouvre l'aperçu", () => {
    const { onOpenPaste, container } = shelf([
      { name: "extrait.txt", lines: null, kind: "paste", text: "contenu collé" },
    ]);
    expect(container.querySelector(".ui-ctxchip")).toBeNull();
    fireEvent.click(container.querySelector(".chip-label")!);
    expect(onOpenPaste).toHaveBeenCalledWith({ name: "extrait.txt", text: "contenu collé" });
  });

  it("image → vignette .img-chip conservée avec suppression nommée", () => {
    const { onRemoveAttachment, container } = shelf([
      { name: "capture.png", lines: null, text: "img", imageUrl: "data:image/png;base64,x" },
    ]);
    expect(container.querySelector(".img-chip img")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fermer capture.png" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
  });

  it("citations groupées ×N conservées : popover avec suppressions unitaires nommées", () => {
    const { onRemoveAttachment, container } = shelf([
      { name: "will2020.pdf", lines: "12-19", kind: "quote", text: "a" },
      { name: "will2020.pdf", lines: "40-44", kind: "quote", text: "b" },
    ]);
    expect(container.querySelector(".chip-count")).toHaveTextContent("×2");
    fireEvent.click(container.querySelector(".chip-count")!);
    const rows = container.querySelectorAll(".cgp-row");
    expect(rows).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Fermer will2020.pdf 2" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(1);
  });
});
