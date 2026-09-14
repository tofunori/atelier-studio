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
