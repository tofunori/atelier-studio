import { describe, expect, it, vi } from "vitest";
import { openZoteroPassage, parseZoteroPassageRef } from "./md";

describe("lien de passage Zotero dans le chat", () => {
  const href = "#atelier-zotero-passage?key=ITEM1&pdfKey=PDF1&file=paper.pdf&page=7&quote=resultat+important";

  it("valide et décode un lien généré par l'outil", () => {
    expect(parseZoteroPassageRef(href)).toEqual({
      key: "ITEM1", pdfKey: "PDF1", pdfFile: "paper.pdf", page: 7, quote: "resultat important",
    });
  });

  it("rejette les noms de fichiers traversants", () => {
    expect(parseZoteroPassageRef(href.replace("paper.pdf", "..%2Fsecret.pdf"))).toBeNull();
  });

  it("émet l'action d'ouverture vers la Bibliothèque", () => {
    const handler = vi.fn();
    window.addEventListener("chat-open-zotero-passage", handler);
    openZoteroPassage(parseZoteroPassageRef(href)!);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener("chat-open-zotero-passage", handler);
  });
});
