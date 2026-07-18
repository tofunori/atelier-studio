// ContextShelf — rangée de contexte unifiée (plan 050 P2) : chaque pièce
// jointe est une pilule fine (.chip.context-pill). Les comportements métier
// restent couverts : aperçu (paste ET fichier), zoom image avec navigation,
// citations groupées en popover, retrait unitaire.
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

describe("ContextShelf en pilules unifiées", () => {
  it("référence simple → pilule fine, clic = aperçu du contenu, retrait nommé", () => {
    const { onRemoveAttachment, onOpenPaste, container } = shelf([
      { name: "plot.png", lines: null, kind: "file", text: "Fichier du projet : /p/figs/plot.png" },
    ]);

    const pill = container.querySelector(".chip.context-pill")!;
    expect(pill).toHaveTextContent("plot");
    expect(pill.getAttribute("title")).toContain("/p/figs/plot.png");
    // même gabarit que les pilules KB : pas de carte deux-lignes
    expect(container.querySelector('[data-slot="attachment"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir plot.png" }));
    expect(onOpenPaste).toHaveBeenCalledWith({ name: "plot.png", text: "Fichier du projet : /p/figs/plot.png" });
    fireEvent.click(screen.getByRole("button", { name: "Retirer plot.png" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
  });

  it("texte collé → clic ouvre l'aperçu existant", () => {
    const { onOpenPaste } = shelf([
      { name: "extrait.txt", lines: null, kind: "paste", text: "contenu collé" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir extrait.txt" }));
    expect(onOpenPaste).toHaveBeenCalledWith({ name: "extrait.txt", text: "contenu collé" });
  });

  it("citation avec lignes → suffixe de lignes tabulaire", () => {
    const { container } = shelf([
      { name: "will2020.pdf", lines: "12-19", kind: "quote", text: "extrait" },
    ]);
    expect(container.querySelector(".chip-lines")).toHaveTextContent("12-19");
  });

  it("image → pilule cliquable, zoom agrandi et suppression nommée", () => {
    const { onRemoveAttachment } = shelf([
      { name: "capture.png", lines: null, text: "img", imageUrl: "data:image/png;base64,x" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Aperçu de capture.png" }));
    const dialog = screen.getByRole("dialog", { name: "Aperçu agrandi de l’image" });
    expect(within(dialog).getByRole("img", { name: "capture.png" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fermer l’aperçu de l’image" }));
    expect(screen.queryByRole("dialog", { name: "Aperçu agrandi de l’image" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retirer capture.png" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
  });

  it("plusieurs images → navigation circulaire conservée", () => {
    shelf([
      { name: "one.png", lines: null, text: "one", imageUrl: "data:image/png;base64,one" },
      { name: "two.png", lines: null, text: "two", imageUrl: "data:image/png;base64,two" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Aperçu de one.png" }));
    expect(screen.getByText("one.png (1/2)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Image suivante" }));
    expect(screen.getByText("two.png (2/2)")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("one.png (1/2)")).toBeInTheDocument();
  });

  it("citations groupées → pilule avec compte, popover, retraits séparés", () => {
    const { onRemoveAttachment, container } = shelf([
      { name: "will2020.pdf", lines: "12-19", kind: "quote", text: "premier extrait" },
      { name: "will2020.pdf", lines: "40-44", kind: "quote", text: "second extrait" },
    ]);

    expect(container.querySelector(".context-pill-count")).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir will2020.pdf" }));
    expect(screen.getByText("second extrait")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retirer will2020.pdf 2" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(1);
  });

  it("le retrait d'un groupe retire tous ses extraits (ordre inverse)", () => {
    const { onRemoveAttachment } = shelf([
      { name: "a.md", lines: "1-2", kind: "quote", text: "x" },
      { name: "a.md", lines: "5-6", kind: "quote", text: "y" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Retirer a.md" }));
    expect(onRemoveAttachment.mock.calls.map((c) => c[0])).toEqual([1, 0]);
  });
});
