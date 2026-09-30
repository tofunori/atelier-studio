import test from "node:test";
import assert from "node:assert/strict";
import {diff} from "@codemirror/merge";
import {snapChangesToTokens, splitsToken} from "../../src/browser/cm6/review_tokens.ts";

const snapped = (a: string, b: string) => snapChangesToTokens(diff(a, b), a, b)
  .map((c) => [a.slice(c.fromA, c.toA), b.slice(c.fromB, c.toB)]);

test("splitsToken: mots et commandes LaTeX", () => {
  assert.equal(splitsToken("a", "b"), true);
  assert.equal(splitsToken("é", "t"), true);
  assert.equal(splitsToken("\\", "a"), true);
  assert.equal(splitsToken("\\", ","), true);
  assert.equal(splitsToken(" ", "a"), false);
  assert.equal(splitsToken("a", " "), false);
  assert.equal(splitsToken("\\", " "), false);
  assert.equal(splitsToken("}", "a"), false);
});

test("une commande ne se coupe plus : \\bar{ … } s'ajoute autour de \\alpha intact", () => {
  const a = "  \\alpha_{\\mathrm{JJA}} = x";
  const b = "  \\bar{\\alpha}_{\\mathrm{JJA}} = x";
  assert.deepEqual(snapped(a, b), [["", "\\bar{"], ["", "}"]]);
  // Sans glissement possible, la commande entamée est prise en entier.
  assert.deepEqual(snapped("x \\alpha y", "x \\beta y"), [["\\alpha", "\\beta"]]);
});

test("un mot retouché est remplacé en entier", () => {
  assert.deepEqual(snapped("les pixels contaminés ont", "les pixels nuageux ont"),
    [["contaminés", "nuageux"]]);
  assert.deepEqual(snapped("albedo decline", "albedo declines"), [["decline", "declines"]]);
});

test("un ajout entre deux mots reste un ajout pur", () => {
  assert.deepEqual(snapped("MOD10A1 pour", "MOD10A1 (collection 6.1) pour"), [["", "(collection 6.1) "]]);
});

test("les positions restent cohérentes et ordonnées", () => {
  const a = "Le \\emph{glacier} recule vite. La neige fond.";
  const b = "Le \\textbf{glacier} recule. La neige fondait.";
  const changes = snapChangesToTokens(diff(a, b), a, b);
  let lastA = 0, lastB = 0, rebuilt = "";
  for (const c of changes) {
    assert.ok(c.fromA >= lastA && c.fromB >= lastB);
    assert.equal(a.slice(lastA, c.fromA), b.slice(lastB, c.fromB));
    rebuilt += b.slice(lastB, c.fromB) + b.slice(c.fromB, c.toB);
    lastA = c.toA; lastB = c.toB;
  }
  rebuilt += b.slice(lastB);
  assert.equal(a.slice(lastA), b.slice(lastB));
  assert.equal(rebuilt, b);
  assert.deepEqual(changes.map((c) => [a.slice(c.fromA, c.toA), b.slice(c.fromB, c.toB)]),
    [["\\emph", "\\textbf"], [" vite", ""], ["fond", "fondait"]]);
});

test("un retrait qui peut glisser se pose entre deux mots, sans avaler le voisin", () => {
  const a = "Les glaciers sont les plus touchés, car leur zone d'ablation reste exposée plus longtemps.";
  const b = "Les glaciers sont les plus touchés.";
  assert.deepEqual(snapped(a, b), [[", car leur zone d'ablation reste exposée plus longtemps", ""]]);
  assert.deepEqual(snapped(b, a), [["", ", car leur zone d'ablation reste exposée plus longtemps"]]);
});
