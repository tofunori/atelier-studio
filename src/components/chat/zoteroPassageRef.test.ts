import { describe, expect, it, vi } from "vitest";
import { openGbrainPassage, openZoteroPassage, parseGbrainPassageRef, parseZoteroPassageRef } from "./md";

describe("lien de passage Zotero dans le chat", () => {
  const href = "#atelier-zotero-passage?key=ITEM1&pdfKey=PDF1&file=paper.pdf&page=7&quote=resultat+important";

  it("valide et décode un lien généré par l'outil", () => {
    expect(parseZoteroPassageRef(href)).toEqual({
      kind: "zotero", key: "ITEM1", pdfKey: "PDF1", pdfFile: "paper.pdf", page: 7, quote: "resultat important",
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

describe("lien de passage gbrain dans le chat (tâche 6)", () => {
  const href = "#atelier-gbrain-passage?slug=williamson-2021-fire-aerosol&quote=resultat+important";

  it("valide et décode un lien généré par l'outil", () => {
    expect(parseGbrainPassageRef(href)).toEqual({
      kind: "gbrain", slug: "williamson-2021-fire-aerosol", quote: "resultat important",
    });
  });

  it("rejette un slug hors de l'alphabet autorisé", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a/b"))).toBeNull();
  });

  it("rejette un slug vide ou trop long (>120)", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", ""))).toBeNull();
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a".repeat(121)))).toBeNull();
  });

  it("rejette une citation vide, tronque au-delà de 900 caractères", () => {
    expect(parseGbrainPassageRef(`#atelier-gbrain-passage?slug=s&quote=`)).toBeNull();
    const long = "x".repeat(950);
    const parsed = parseGbrainPassageRef(`#atelier-gbrain-passage?slug=s&quote=${long}`);
    expect(parsed?.quote.length).toBe(900);
  });

  it("n'est pas confondu avec un lien zotero", () => {
    expect(parseGbrainPassageRef("#atelier-zotero-passage?key=A&pdfKey=B&file=a.pdf&page=1&quote=q")).toBeNull();
  });

  it("émet l'action d'ouverture vers la surface Connaissances", () => {
    const handler = vi.fn();
    window.addEventListener("kb-open-gbrain-passage", handler);
    openGbrainPassage(parseGbrainPassageRef(href)!);
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ slug: "williamson-2021-fire-aerosol", quote: "resultat important" });
    window.removeEventListener("kb-open-gbrain-passage", handler);
  });
});
