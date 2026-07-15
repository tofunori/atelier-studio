import test from "node:test";
import assert from "node:assert/strict";
await import("../../assets/pdf_passage.js");
const passage = globalThis.AtelierPdfPassage;

test("a deep-linked quote maps back to the PDF text spans", () => {
  const spans = ["Our results", "show a measurable", "decrease in August", "albedo of 2.4 percent."];
  assert.deepEqual(
    passage.findPassageSpanRange(spans, "Our results show a measurable decrease in August albedo of 2.4 percent."),
    { start: 0, end: 3 },
  );
});

test("accent and punctuation differences do not break passage matching", () => {
  const spans = ["Résultats :", "diminution prévue", "de l’albédo."];
  assert.deepEqual(passage.findPassageSpanRange(spans, "Resultats, diminution prevue de l'albedo"), { start: 0, end: 2 });
  assert.equal(passage.findPassageSpanRange(spans, "unrelated sentence"), null);
});

test("a damaged PDF symbol still highlights the complete focused sentence", () => {
  const spans = ["These equations", "describe measurements", "with root-mean-square", "differences of ≈ 0.016."];
  assert.deepEqual(
    passage.findPassageSpanRange(spans, "These equations describe measurements with root-mean-square differences of f 0.016."),
    { start: 0, end: 3 },
  );
});
