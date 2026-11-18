import { describe, expect, it } from "vitest";
import { formatNotebookSelectionCitation } from "./notebook";
import { parseAttachment } from "./composerAttachments";

describe("citation d'un cahier envoyée au chat", () => {
  it("a la forme des autres éditeurs : la capsule montre le cahier, la cellule et les lignes", () => {
    const text = formatNotebookSelectionCitation("analyses/albedo.ipynb", 5, "code", "for i in r:\n    f(i)\n", [2, 3]);
    expect(text).toBe("analyses/albedo.ipynb [5] (L2-3) : « for i in r:\n    f(i) »");
    expect(parseAttachment(text)).toMatchObject({ name: "albedo.ipynb [5]", lines: "2-3" });
  });

  it("une sortie est nommée Out[n] ; une seule ligne n'a pas d'intervalle", () => {
    const text = formatNotebookSelectionCitation("albedo.ipynb", 7, "output", "0.42", [1, 1]);
    expect(text).toBe("albedo.ipynb Out[7] (L1) : « 0.42 »");
    expect(parseAttachment(text)).toMatchObject({ name: "albedo.ipynb Out[7]", lines: "1" });
  });

  it("la cellule entière (bouton Citer) couvre toutes ses lignes", () => {
    expect(formatNotebookSelectionCitation("a.ipynb", 2, "code", "x = 1\ny = 2")).toBe("a.ipynb [2] (L1-2) : « x = 1\ny = 2 »");
  });
});
