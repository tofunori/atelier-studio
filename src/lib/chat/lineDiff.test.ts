import { describe, expect, it } from "vitest";
import { countChanges, diffLines, foldUnchanged, pairChangedLines, parseUnifiedDiff, wordMarks } from "./lineDiff";
import { markHtml, splitHighlightedLines } from "../../components/chat/FileDiff";

describe("diffLines", () => {
  it("numérote les deux côtés et place le retrait avant l'ajout", () => {
    const rows = diffLines("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(rows.map((row) => row.kind)).toEqual(["ctx", "del", "add", "ctx", "add"]);
    expect(rows[1]).toMatchObject({ text: "b", oldNo: 2, newNo: null });
    expect(rows[2]).toMatchObject({ text: "B", oldNo: null, newNo: 2 });
    expect(rows[4]).toMatchObject({ text: "d", newNo: 4 });
    expect(countChanges(rows)).toEqual({ add: 2, del: 1 });
  });

  it("un fichier neuf n'a que des ajouts", () => {
    const rows = diffLines("", "x = 1\ny = 2");
    expect(countChanges(rows)).toEqual({ add: 2, del: 0 });
  });

  it("garde les numéros justes après un suffixe commun", () => {
    const rows = diffLines("a\nz", "a\nb\nc\nz");
    expect(rows[rows.length - 1]).toMatchObject({ kind: "ctx", text: "z", oldNo: 2, newNo: 4 });
  });
});

describe("parseUnifiedDiff", () => {
  it("suit les numéros des en-têtes @@ et ignore l'en-tête de fichier", () => {
    const rows = parseUnifiedDiff([
      "diff --git a/f.py b/f.py", "--- a/f.py", "+++ b/f.py",
      "@@ -10,3 +10,3 @@ def f():", " a", "-b", "+B", " c",
    ].join("\n"));
    expect(rows[0]).toEqual({ kind: "hunk", text: "def f():" });
    expect(rows[2]).toMatchObject({ kind: "del", text: "b", oldNo: 11 });
    expect(rows[3]).toMatchObject({ kind: "add", text: "B", newNo: 11 });
    expect(countChanges(rows)).toEqual({ add: 1, del: 1 });
  });
});

describe("foldUnchanged", () => {
  it("replie une longue zone inchangée en gardant 3 lignes de contexte", () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l20", "L20");
    const items = foldUnchanged(diffLines(before, after));
    expect(items[0].kind).toBe("fold");
    expect(items[0].kind === "fold" && items[0].rows).toHaveLength(17);
    // les 9 dernières lignes restent visibles (3 de contexte + 6 sous le seuil)
    expect(items.filter((item) => item.kind === "fold")).toHaveLength(1);
  });
});

describe("marques au mot près", () => {
  it("ne marque que le mot changé", () => {
    const marks = wordMarks("np.savez(sortie, x)", "np.savez_compressed(sortie, x)");
    expect(marks).toEqual([[[3, 8]], [[3, 19]]]);
  });

  it("deux lignes sans rapport ne sont pas marquées", () => {
    expect(wordMarks("import sys", "TOLERANCE = 1e-13")).toBeNull();
  });

  it("apparie les lignes retirées et ajoutées d'un même bloc", () => {
    const rows = diffLines("x = f(a)\n", "x = g(a)\n");
    const marks = pairChangedLines(rows);
    expect(marks.get(0)).toEqual([[4, 5]]);
    expect(marks.get(1)).toEqual([[4, 5]]);
  });
});

describe("rendu HTML", () => {
  it("referme et rouvre les spans hljs à chaque ligne", () => {
    const lines = splitHighlightedLines('<span class="hljs-string">"""a\nb"""</span> x');
    expect(lines).toEqual(['<span class="hljs-string">"""a</span>', '<span class="hljs-string">b"""</span> x']);
  });

  it("pose les marques en comptant une entité comme un caractère", () => {
    expect(markHtml('a &lt; <span class="k">bc</span>', [[2, 5]])).toBe('a <mark>&lt; </mark><span class="k"><mark>b</mark>c</span>');
  });
});

describe("appariement au plus proche", () => {
  it("une ligne retirée répond à la ligne ajoutée qui lui ressemble", () => {
    const rows = diffLines(
      'np.savez(sortie / f"{nom}.npz", **extraire(idata))\n',
      'tableaux = extraire(idata, logp=True)\nnp.savez_compressed(sortie / f"{nom}.npz", **tableaux)\n',
    );
    const marks = pairChangedLines(rows);
    expect(rows.map((row) => row.kind)).toEqual(["del", "add", "add"]);
    expect(marks.has(1)).toBe(false);
    expect(marks.get(2)?.length).toBeGreaterThan(0);
  });
});
