import { describe, expect, it } from "vitest";
import { dropEchoedPassageQuotes } from "./md";

const Q = "The only bias correction applied to the ERA5 input data is a lapse rate adjustment (2 m).";
const LINK = `[« p. 14 »](#atelier-zotero-passage?key=A1&pdfKey=B2&file=a.pdf&page=14&quote=${encodeURIComponent(Q).replace(/%28/g, "(").replace(/%29/g, ")")})`;

describe("dropEchoedPassageQuotes", () => {
  it("retire la citation `>` qui répète la carte", () => {
    const md = `Avant :\n\n${LINK}\n\n> The only bias correction applied to the ERA5 input data\n> is a lapse rate adjustment (2 m).\n\nAprès.`;
    expect(dropEchoedPassageQuotes(md)).toBe(`Avant :\n\n${LINK}\n\nAprès.`);
  });

  it("retire aussi une copie en italique entre guillemets", () => {
    const md = `${LINK}\n\n*« ${Q} »*\n\nSuite.`;
    expect(dropEchoedPassageQuotes(md)).toBe(`${LINK}\n\nSuite.`);
  });

  it("garde un bloc différent, et un lien passage en ligne", () => {
    const other = `${LINK}\n\n> Une autre phrase, pas la citation.`;
    expect(dropEchoedPassageQuotes(other)).toBe(other);
    const inline = `Voir ${LINK} ici.\n\n> ${Q}`;
    expect(dropEchoedPassageQuotes(inline)).toBe(inline);
  });

  it("en streaming, retire un écho encore partiel en queue seulement", () => {
    const partial = `${LINK}\n\n> The only bias correction`;
    expect(dropEchoedPassageQuotes(partial, true)).toBe(LINK);
    expect(dropEchoedPassageQuotes(partial, false)).toBe(partial);
  });

  it("ne touche pas le contenu d'un bloc de code", () => {
    const md = "```\n" + `${LINK}\n> ${Q}\n` + "```";
    expect(dropEchoedPassageQuotes(md)).toBe(md);
  });
});
