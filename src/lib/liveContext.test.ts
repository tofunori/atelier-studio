// Contexte vivant : validation du message des iframes, identité de retrait,
// trace de bulle (miroir de live_context::trace côté Rust) et libellés.
import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "./i18n";
import {
  liveContextDisplayPath, liveContextKey, liveContextSentence, liveContextTrace, liveContextWhere,
  parseLiveContext,
} from "./liveContext";

beforeEach(() => setLanguage("fr"));

describe("parseLiveContext", () => {
  it("refuse ce qui sort du contrat (chemin relatif, genre inconnu, non-objet)", () => {
    expect(parseLiveContext(null)).toBeNull();
    expect(parseLiveContext("x")).toBeNull();
    expect(parseLiveContext({ path: "rel/a.tex", name: "a.tex", kind: "tex" })).toBeNull();
    expect(parseLiveContext({ path: "zotero/K1/ryan.pdf", name: "ryan.pdf", kind: "pdf", page: 2 }))
      .toMatchObject({ path: "zotero/K1/ryan.pdf", page: 2 });
    expect(parseLiveContext({ path: "/p/a.docx", name: "a.docx", kind: "docx" })).toBeNull();
  });

  it("borne la sélection et les commentaires, remet l'intervalle dans l'ordre", () => {
    const ctx = parseLiveContext({
      path: "/p/a.tex", name: "a.tex", kind: "tex", lineFrom: 25, lineTo: 23, line: -1,
      selection: "x".repeat(13_000), extra: "ignoré",
      comments: [...Array.from({ length: 12 }, (_, i) => ({ text: `c${i}`, line: i + 1 })), { text: "  " }, 3],
    })!;
    expect(ctx.lineFrom).toBe(23);
    expect(ctx.lineTo).toBe(25);
    expect(ctx.line).toBeUndefined();
    expect(ctx.selection).toHaveLength(12_000);
    expect(ctx.comments).toHaveLength(10);
    expect("extra" in ctx).toBe(false);
  });
});

describe("libellés et trace", () => {
  const tex = parseLiveContext({ path: "/p/ch/chapitre1.tex", name: "chapitre1.tex", kind: "tex",
    lineFrom: 23, lineTo: 25, selection: "a\nb\nc", comments: [{ text: "x" }] })!;

  it("position courte et phrase du détail", () => {
    expect(liveContextWhere(tex)).toBe("lignes 23-25");
    expect(liveContextSentence(tex)).toBe("lignes 23 à 25 sélectionnées");
    expect(liveContextWhere({ line: 42 })).toBe("ligne 42");
    expect(liveContextSentence({ path: "/p/a", name: "a", kind: "code", line: 42 })).toBe("curseur à la ligne 42");
    expect(liveContextSentence({ path: "/p/a.pdf", name: "a.pdf", kind: "pdf", page: 7, pageCount: 14 })).toBe("page 7 sur 14");
    setLanguage("en");
    expect(liveContextWhere(tex)).toBe("lines 23-25");
    expect(liveContextWhere({ page: 7 })).toBe("page 7");
  });

  it("trace sans le texte, commentaires comptés ; identité = fichier + position", () => {
    expect(liveContextTrace(tex)).toEqual({ path: "/p/ch/chapitre1.tex", name: "chapitre1.tex", lineFrom: 23, lineTo: 25, comments: 1 });
    expect(liveContextKey(tex)).toBe(liveContextKey({ ...tex, selection: "autre texte" }));
    expect(liveContextKey(tex)).not.toBe(liveContextKey({ ...tex, lineTo: 26 }));
    expect(liveContextKey(tex)).not.toBe(liveContextKey({ ...tex, path: "/p/ch/autre.tex" }));
  });

  it("chemin relatif au projet quand le fichier est dedans", () => {
    expect(liveContextDisplayPath("/p/ch/chapitre1.tex", "/p/")).toBe("ch/chapitre1.tex");
    expect(liveContextDisplayPath("/ailleurs/a.pdf", "/p")).toBe("/ailleurs/a.pdf");
    expect(liveContextDisplayPath("/p2/a.pdf", "/p")).toBe("/p2/a.pdf");
  });
});
