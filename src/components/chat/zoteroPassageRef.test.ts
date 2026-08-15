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

  it("rejette un slug hors de l'alphabet autorisé (segment)", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a b"))).toBeNull();
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a@b"))).toBeNull();
  });

  it("rejette un slug vide ou trop long (>200 au total)", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", ""))).toBeNull();
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a".repeat(201)))).toBeNull();
  });

  // Arbitrage contrôleur (post-revue) : les vrais slugs gbrain sont
  // hiérarchiques (papers/acp-19-1393-2019) et contiennent des points
  // (bair-e.-h.-stillinger…) — segments [A-Za-z0-9._-]+ séparés par "/",
  // sans slash de tête/queue, aucun segment vide ou "."/".." (anti-traversée).
  it("accepte un slug hiérarchique (segments avec points, tirets, chiffres)", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "papers/acp-19-1393-2019"))).toEqual({
      kind: "gbrain", slug: "papers/acp-19-1393-2019", quote: "resultat important",
    });
    expect(parseGbrainPassageRef(href.replace(
      "williamson-2021-fire-aerosol",
      "articles/bair-e.-h.-stillinger",
    ))?.slug).toBe("articles/bair-e.-h.-stillinger");
  });

  it("rejette une remontée de répertoire (segment . ou ..)", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a/../b"))).toBeNull();
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a/./b"))).toBeNull();
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", ".."))).toBeNull();
  });

  it("rejette un slash de tête", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "/tete"))).toBeNull();
  });

  it("rejette un slash de queue", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "fin/"))).toBeNull();
  });

  it("rejette un segment vide (double slash)", () => {
    expect(parseGbrainPassageRef(href.replace("williamson-2021-fire-aerosol", "a//b"))).toBeNull();
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
