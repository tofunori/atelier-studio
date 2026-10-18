import { describe, expect, it } from "vitest";
import { fileRefFromLink } from "./md";

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
  });
});
