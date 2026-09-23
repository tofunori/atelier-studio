import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
await import("../../assets/pdf_selection.js");
const selection = globalThis.AtelierPdfSelection;

test("selects an exact word inside a PDF text item", () => {
  const text = "Wildfire smoke deposits light-absorbing carbon";
  assert.deepEqual(
    selection.buildSelection([text], {index: 0, offset: 9}, {index: 0, offset: 14}),
    {
      start: {index: 0, offset: 9},
      end: {index: 0, offset: 14},
      segments: [{index: 0, start: 9, end: 14, text: "smoke"}],
      text: "smoke",
    },
  );
});

test("keeps partial endpoints across several PDF items", () => {
  assert.deepEqual(
    selection.buildSelection(
      ["first complete line", "second complete line", "third complete line"],
      {index: 0, offset: 6},
      {index: 2, offset: 5},
    ),
    {
      start: {index: 0, offset: 6},
      end: {index: 2, offset: 5},
      segments: [
        {index: 0, start: 6, end: 19, text: "complete line"},
        {index: 1, start: 0, end: 20, text: "second complete line"},
        {index: 2, start: 0, end: 5, text: "third"},
      ],
      text: "complete line second complete line third",
    },
  );
});

test("reverse drags produce the same precise selection", () => {
  const texts = ["alpha bravo", "charlie delta"];
  assert.deepEqual(
    selection.buildSelection(texts, {index: 1, offset: 7}, {index: 0, offset: 6}),
    selection.buildSelection(texts, {index: 0, offset: 6}, {index: 1, offset: 7}),
  );
});

test("clicks and whitespace-only drags do not create annotations", () => {
  assert.equal(selection.buildSelection(["alpha"], {index: 0, offset: 2}, {index: 0, offset: 2}), null);
  assert.equal(selection.buildSelection(["alpha  bravo"], {index: 0, offset: 5}, {index: 0, offset: 7}), null);
});

test("uses PDF font metrics to align selection boxes around rendered glyphs", () => {
  assert.ok(Math.abs(selection.scaledFontAscent({ascent: 0.72, descent: -0.21}, 40) - 28.8) < 1e-9);
  assert.ok(Math.abs(selection.scaledFontAscent({descent: -0.22}, 40) - 31.2) < 1e-9);
  assert.equal(selection.scaledFontAscent({}, 40), 40);
  assert.equal(selection.scaledFontAscent(null, 40), 40);
  assert.ok(Math.abs(selection.scaledFontHeight({ascent: 0.72, descent: -0.21}, 40) - 37.2) < 1e-9);
  assert.equal(selection.scaledFontHeight({ascent: 0.72}, 40), 40);
  assert.deepEqual(
    selection.fitRectToFontMetrics({left: 10, right: 90, top: 20, width: 80, height: 40}, 40, 36),
    {left: 10, right: 90, top: 20, bottom: 56, width: 80, height: 36},
  );
});

test("the PDF viewer stores character-range rectangles instead of whole text spans", () => {
  const viewer = fs.readFileSync(new URL("../../assets/pdf_viewer.html", import.meta.url), "utf8");
  assert.match(viewer, /<script src="pdf_selection\.js"><\/script>/);
  assert.match(viewer, /document\.caretRangeFromPoint/);
  assert.match(viewer, /selectionClientRects\(model\)/);
  assert.match(viewer, /scaledFontAscent\(fontStyle, fontSize\)/);
  assert.match(viewer, /fitRectToFontMetrics/);
  assert.match(viewer, /r\.width\/pr\.width/);
  assert.doesNotMatch(viewer, /classList\.toggle\("hl"/);
});

// Un surlignage naît d'un rectangle par span pdf.js (souvent un par mot) :
// les mots d'une même ligne se fondent en un seul rectangle continu, les
// lignes restent séparées et une colonne voisine n'est jamais absorbée.
test("merges word rectangles of one line into a continuous rectangle", () => {
  const rects = [
    [0.10, 0.200, 0.05, 0.015], // « For »
    [0.16, 0.200, 0.12, 0.015], // « catchment-scale »
    [0.29, 0.201, 0.08, 0.014], // « studies » (léger décalage vertical)
  ];
  const out = selection.mergeLineRects(rects, {aspect: 792 / 612});
  assert.equal(out.length, 1);
  const [x, y, w, h] = out[0];
  assert.ok(Math.abs(x - 0.10) < 1e-9);
  assert.ok(Math.abs(x + w - 0.37) < 1e-9);
  assert.ok(Math.abs(y - 0.200) < 1e-9);
  assert.ok(Math.abs(y + h - 0.215) < 1e-9);
});

test("keeps separate lines and a neighbouring column apart", () => {
  const rects = [
    [0.10, 0.200, 0.05, 0.015], [0.16, 0.200, 0.10, 0.015], // ligne 1, colonne gauche
    [0.55, 0.200, 0.06, 0.015],                             // ligne 1, colonne droite (écart 0.29)
    [0.10, 0.220, 0.08, 0.015], [0.19, 0.220, 0.04, 0.015], // ligne 2
  ];
  const out = selection.mergeLineRects(rects, {aspect: 792 / 612});
  assert.deepEqual(out.map(r => r.map(v => +v.toFixed(3))), [
    [0.10, 0.20, 0.16, 0.015],
    [0.55, 0.20, 0.06, 0.015],
    [0.10, 0.22, 0.13, 0.015],
  ]);
});

test("merge is order-independent and tolerates empty input", () => {
  assert.deepEqual(selection.mergeLineRects([]), []);
  const a = [[0.3, 0.5, 0.1, 0.02], [0.1, 0.5, 0.1, 0.02], [0.2, 0.5, 0.1, 0.02]];
  assert.deepEqual(selection.mergeLineRects(a).map(r => r.map(v => +v.toFixed(3))), [[0.1, 0.5, 0.3, 0.02]]);
});
