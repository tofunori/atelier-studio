// ContextShelf — chaque pièce jointe compose la primitive Attachment shadcn;
// les comportements métier (paste, image, citations groupées) restent testés.
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

describe("ContextShelf avec Attachment shadcn", () => {
  it("référence simple → Attachment avec média, métadonnées et action accessible", () => {
    const { onRemoveAttachment, container } = shelf([
      { name: "plot.png", lines: null, kind: "file", text: "Fichier du projet : /p/figs/plot.png" },
    ]);

    const attachment = container.querySelector('[data-slot="attachment"]')!;
    expect(attachment).toHaveTextContent("plot");
    expect(attachment).toHaveTextContent("fichier");
    expect(attachment.getAttribute("title")).toContain("/p/figs/plot.png");
    expect(container.querySelector('[data-slot="attachment-media"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="attachment-action"]')).toHaveClass("tw:rounded-full");
    expect(attachment).toHaveClass("tw:bg-background/70");

    fireEvent.click(screen.getByRole("button", { name: "Retirer plot.png" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
  });

  it("texte collé → AttachmentTrigger ouvre l’aperçu existant", () => {
    const { onOpenPaste } = shelf([
      { name: "extrait.txt", lines: null, kind: "paste", text: "contenu collé" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir extrait.txt" }));
    expect(onOpenPaste).toHaveBeenCalledWith({ name: "extrait.txt", text: "contenu collé" });
  });

  it("image → AttachmentMedia image et suppression nommée", () => {
    const { onRemoveAttachment, container } = shelf([
      { name: "capture.png", lines: null, text: "img", imageUrl: "data:image/png;base64,x" },
    ]);

    expect(container.querySelector('[data-slot="attachment-media"][data-variant="image"] img')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retirer capture.png" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
  });

  it("citations groupées → Popover et Attachments compacts supprimables séparément", () => {
    const { onRemoveAttachment } = shelf([
      { name: "will2020.pdf", lines: "12-19", kind: "quote", text: "premier extrait" },
      { name: "will2020.pdf", lines: "40-44", kind: "quote", text: "second extrait" },
    ]);

    expect(screen.getByText("2 quote")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir will2020.pdf" }));
    expect(screen.getByText("second extrait")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retirer will2020.pdf 2" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(1);
  });

  it.each(["article-zotero.pdf", "chapitre.tex", "analyse.py"])(
    "deux extraits de %s → le déclencheur groupé reste transparent",
    (name) => {
      shelf([
        { name, lines: "10-14", kind: "quote", text: "premier extrait" },
        { name, lines: "30-35", kind: "quote", text: "second extrait" },
      ]);

      expect(screen.getByRole("button", { name: `Ouvrir ${name}` })).toHaveClass(
        "tw:appearance-none",
        "tw:border-0",
        "tw:bg-transparent",
        "tw:p-0",
      );
    },
  );
});
