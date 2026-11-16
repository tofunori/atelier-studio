import { describe, expect, it } from "vitest";
import { fileRefFromLink as fromLink } from "./fileRefLink";
import { FILE_REF } from "./md";

const fileRefFromLink = (label: string, href: string) => fromLink(label, href, FILE_REF);

describe("fileRefFromLink", () => {
  it("garde le chemin complet du href quand le libellé n'en montre que le nom", () => {
    expect(fileRefFromLink("rapport.html", "/var/folders/xy/T/noyau/rapport.html")).toBe("/var/folders/xy/T/noyau/rapport.html");
    expect(fileRefFromLink("plot.py:12", "scripts/plot.py")).toBe("scripts/plot.py:12");
  });

  it("garde le libellé quand le href désigne un autre fichier ou rien", () => {
    expect(fileRefFromLink("main.tex:31", "main.tex")).toBe("main.tex:31");
    expect(fileRefFromLink("notes.md", "autre/notes-v2.md")).toBe("notes.md");
    expect(fileRefFromLink("carte.html", "https://example.com")).toBe("carte.html");
    expect(fileRefFromLink("Voir la carte", "out/carte.html")).toBe("out/carte.html");
    expect(fileRefFromLink("Voir la carte", "https://example.com")).toBeNull();
    // Bilan des commentaires Word : `:13` = paragraphe p13.
    expect(fileRefFromLink("c14 · ¶ 13", "manuscrit/Chap_revCK.docx:13")).toBe("manuscrit/Chap_revCK.docx:13");
  });
});
