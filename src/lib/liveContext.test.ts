// Contexte vivant : validation du message des iframes, mémoire de l'œil,
// trace de bulle (miroir de live_context::trace côté Rust) et libellés.
import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "./i18n";
import {
  LIVE_CONTEXT_ON_KEY, articleLiveContext, imageTabLiveContext, liveContextDisplayPath, liveContextHeadline,
  liveContextSentence, liveContextTrace, liveContextWhere, parseLiveContext, readLiveContextOn, writeLiveContextOn,
} from "./liveContext";

beforeEach(() => setLanguage("fr"));

describe("parseLiveContext", () => {
  it("refuse ce qui sort du contrat (chemin relatif, genre inconnu, non-objet)", () => {
    expect(parseLiveContext(null)).toBeNull();
    expect(parseLiveContext("x")).toBeNull();
    expect(parseLiveContext({ path: "rel/a.tex", name: "a.tex", kind: "tex" })).toBeNull();
    expect(parseLiveContext({ path: "zotero/K1/ryan.pdf", name: "ryan.pdf", kind: "pdf", page: 2 }))
      .toMatchObject({ path: "zotero/K1/ryan.pdf", page: 2 });
    expect(parseLiveContext({ path: "/p/a.mp4", name: "a.mp4", kind: "video" })).toBeNull();
  });

  it("borne les commentaires ; la sélection (texte et lignes) ne passe jamais", () => {
    const ctx = parseLiveContext({
      path: "/p/a.tex", name: "a.tex", kind: "tex", lineFrom: 25, lineTo: 23, line: -1,
      selection: "x".repeat(13_000), extra: "ignoré",
      comments: [...Array.from({ length: 12 }, (_, i) => ({ text: `c${i}`, line: i + 1 })), { text: "  " }, 3],
    })!;
    expect(ctx.line).toBeUndefined();
    expect(ctx.comments).toHaveLength(10);
    // Le chat sait qu'il n'en voit qu'une partie.
    expect(ctx.commentsTotal).toBe(12);
    expect(parseLiveContext({ path: "/p/a.docx", name: "a.docx", kind: "docx", comments: [{ text: "x" }], commentsTotal: 14 })!.commentsTotal).toBe(14);
    expect(parseLiveContext({ path: "/p/a.docx", name: "a.docx", kind: "docx", comments: [{ text: "x" }] })!.commentsTotal).toBeUndefined();
    for (const key of ["extra", "selection", "lineFrom", "lineTo"]) expect(key in ctx).toBe(false);
  });
});

describe("libellés et trace", () => {
  const tex = parseLiveContext({ path: "/p/ch/chapitre1.tex", name: "chapitre1.tex", kind: "tex",
    line: 23, comments: [{ text: "x" }] })!;

  it("position courte et phrase du détail", () => {
    expect(liveContextWhere(tex)).toBe("ligne 23");
    expect(liveContextWhere({ lineFrom: 23, lineTo: 25 })).toBe("lignes 23-25"); // trace d'un ancien message
    expect(liveContextSentence(tex)).toBe("curseur à la ligne 23");
    expect(liveContextWhere({ line: 42 })).toBe("ligne 42");
    expect(liveContextSentence({ path: "/p/a", name: "a", kind: "code", line: 42 })).toBe("curseur à la ligne 42");
    expect(liveContextSentence({ path: "/p/a.pdf", name: "a.pdf", kind: "pdf", page: 7, pageCount: 14 })).toBe("page 7 sur 14");
    setLanguage("en");
    expect(liveContextWhere(tex)).toBe("line 23");
    expect(liveContextWhere({ page: 7 })).toBe("page 7");
  });

  it("trace sans le texte, commentaires comptés", () => {
    expect(liveContextTrace(tex)).toEqual({ path: "/p/ch/chapitre1.tex", name: "chapitre1.tex", line: 23, comments: 1 });
  });

  it("l'œil est allumé par défaut et se souvient d'être coupé", () => {
    localStorage.removeItem(LIVE_CONTEXT_ON_KEY);
    expect(readLiveContextOn()).toBe(true);
    writeLiveContextOn(false);
    expect(readLiveContextOn()).toBe(false);
    writeLiveContextOn(true);
    expect(readLiveContextOn()).toBe(true);
    localStorage.removeItem(LIVE_CONTEXT_ON_KEY);
  });

  it("chemin relatif au projet quand le fichier est dedans", () => {
    expect(liveContextDisplayPath("/p/ch/chapitre1.tex", "/p/")).toBe("ch/chapitre1.tex");
    expect(liveContextDisplayPath("/ailleurs/a.pdf", "/p")).toBe("/ailleurs/a.pdf");
    expect(liveContextDisplayPath("/p2/a.pdf", "/p")).toBe("/p2/a.pdf");
  });
});

describe("nouvelles sources (2026-11-09)", () => {
  it("figure, .docx, article et page web passent ; chemins et liens hors contrat tombent", () => {
    expect(parseLiveContext({ kind: "figure", path: "/p/fig3.png", name: "fig3.png" }))
      .toEqual({ kind: "figure", path: "/p/fig3.png", name: "fig3.png" });
    expect(parseLiveContext({ kind: "figure", path: "fig3.png" })).toBeNull();
    expect(parseLiveContext({ kind: "docx", path: "/p/revue.docx", paragraph: 12 }))
      .toMatchObject({ kind: "docx", name: "revue.docx", paragraph: 12 });
    expect(parseLiveContext({ kind: "article", path: "zotero/ABC", name: "Ryan 2018", title: "Dark zone", url: "https://doi.org/10.1/x" }))
      .toEqual({ kind: "article", path: "zotero/ABC", name: "Ryan 2018", title: "Dark zone", url: "https://doi.org/10.1/x" });
    expect(parseLiveContext({ kind: "web", path: "https://nsidc.org/data", name: "nsidc.org/data", url: "javascript:alert(1)" }))
      .toEqual({ kind: "web", path: "https://nsidc.org/data", name: "nsidc.org/data" });
    expect(parseLiveContext({ kind: "web", path: "file:///etc/passwd" })).toBeNull();
    expect(parseLiveContext({ kind: "video", path: "/p/a.mp4" })).toBeNull();
  });

  it("libellés : ¶ du paragraphe, figure, page web, article", () => {
    expect(liveContextWhere({ paragraph: 12 })).toBe("¶ 12");
    expect(liveContextSentence({ kind: "docx", path: "/p/r.docx", name: "r.docx", paragraph: 12 })).toBe("curseur au paragraphe 12");
    expect(liveContextSentence({ kind: "figure", path: "/p/f.png", name: "f.png" })).toContain("Image");
    const web = { kind: "web" as const, path: "https://a.org/x", url: "https://a.org/x", name: "a.org/x" };
    expect(liveContextHeadline(web, "/p")).toBe("https://a.org/x");
    expect(liveContextHeadline({ kind: "article", path: "zotero/K", name: "Ryan 2018", title: "Dark zone" }, "/p")).toBe("Dark zone");
    expect(liveContextHeadline({ kind: "figure", path: "/p/figs/f.png", name: "f.png" }, "/p")).toBe("figs/f.png");
    expect(liveContextTrace({ kind: "docx", path: "/p/r.docx", name: "r.docx", paragraph: 3 }))
      .toEqual({ path: "/p/r.docx", name: "r.docx", paragraph: 3 });
  });

  it("onglet image brute → figure ; pas d'image ou pas de projet → rien", () => {
    expect(imageTabLiveContext({ url: "http://127.0.0.1:1/figs/a%20b.PNG", title: "a b.PNG", projectRoot: "/p/" }))
      .toEqual({ kind: "figure", path: "/p/figs/a b.PNG", name: "a b.PNG" });
    expect(imageTabLiveContext({ url: "http://127.0.0.1:1/.fig_thumbs/latex_studio.html?path=x", title: "x", projectRoot: "/p" })).toBeNull();
    expect(imageTabLiveContext({ url: "http://127.0.0.1:1/figs/a.png", title: "a.png" })).toBeNull();
  });

  it("article Zotero : premier auteur, et al., année, lien DOI", () => {
    expect(articleLiveContext({ key: "K1", title: "Dark zone", creators: "Ryan, J.; Hubbard, A.", year: "2018", doi: "10.1/x" }))
      .toEqual({ kind: "article", path: "zotero/K1", name: "Ryan et al. 2018", title: "Dark zone", url: "https://doi.org/10.1/x" });
    expect(articleLiveContext({ key: "K2", title: "Solo", creators: "Box, J.", year: "2012", doi: "https://doi.org/10.2/y" }))
      .toMatchObject({ name: "Box 2012", url: "https://doi.org/10.2/y" });
  });
});
