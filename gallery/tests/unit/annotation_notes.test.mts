// Notes d'annotation communes LaTeX / PDF compilé (variante B) : outils purs
// de annotation_notes.ts (teintes, pastilles, ancrage PDF ↔ source, colonne).
import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {fileURLToPath} from "node:url";

const out = await build({entryPoints: [fileURLToPath(new URL("../../src/studio/features/annotation_notes.ts", import.meta.url))],
  bundle: true, write: false, format: "esm"});
const notes = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0]!.text).toString("base64")}`);

test("noteColorName : nom .tex ou rgba du lecteur PDF, ambre par défaut", () => {
  assert.equal(notes.noteColorName("red"), "red");
  assert.equal(notes.noteColorName("violet"), "purple");
  assert.equal(notes.noteColorName("rgba(120,170,255,.40)"), "blue");
  assert.equal(notes.noteColorName("rgba(255, 213, 74, 0.4)"), "amber");
  assert.equal(notes.noteColorName("rgba(1,2,3,.4)"), "amber");
  assert.equal(notes.noteColorName(""), "amber");
  assert.equal(notes.noteColorName(undefined), "amber");
});

test("isPdfNote : un commentaire ou un marquage qui dit quelque chose, pas un surlignage nu", () => {
  const rects = [[.1, .1, .2, .02]];
  assert.equal(notes.isPdfNote({id: 1, kind: "comment", rects}), true);
  assert.equal(notes.isPdfNote({id: 2, kind: "hl", rects}), false);
  assert.equal(notes.isPdfNote({id: 3, kind: "hl", rects, memo: "  "}), false);
  assert.equal(notes.isPdfNote({id: 4, kind: "ul", rects, memo: "à revoir"}), true);
  assert.equal(notes.isPdfNote({id: 5, kind: "st", rects, by: "agent"}), true);
  assert.equal(notes.isPdfNote({id: 6, kind: "area", rects, memo: "x"}), false);
  assert.equal(notes.isPdfNote({id: 7, kind: "comment", rects: []}), false);
});

test("spreadPins : 24 px entre deux pastilles, la colonne remonte en bas de page", () => {
  assert.deepEqual(notes.spreadPins([100, 105, 110], 1000), [100, 124, 148]);
  assert.deepEqual(notes.spreadPins([990, 995], 1000), [964, 988]);
  assert.deepEqual(notes.spreadPins([0], 1000), [12]);
  assert.deepEqual(notes.spreadPins([], 1000), []);
});

test("pinSide et textBounds : marge du côté du passage, bornes du texte de la page", () => {
  assert.equal(notes.pinSide([.1, .2, .3, .02]), "left");
  assert.equal(notes.pinSide([.55, .2, .3, .02]), "right");
  assert.deepEqual(notes.textBounds([], 600), {min: .12, max: .88});
  const spans = Array.from({length: 40}, () => ({left: 72, right: 528}));
  spans.push({left: 290, right: 310}); // numéro de page centré
  const bounds = notes.textBounds(spans, 600);
  assert.equal(bounds.min, .12);
  assert.equal(bounds.max, .88);
});

test("anchorPdfQuote retrouve le passage malgré commandes, accents et césures", () => {
  const source = [
    "\\section{Introduction}",
    "L'albédo des glaciers \\citep{ren2021} diminue après les feux.",
    "",
    "Le dépôt de \\textbf{carbone suie} assombrit la glace.",
  ].join("\n");
  const anchor = notes.anchorPdfQuote(source, "carbone suie assom-brit la glace", 3);
  assert.ok(anchor);
  assert.equal(anchor.match, "exact");
  assert.equal(anchor.from.line, 3);
  assert.match(anchor.text, /^carbone suie\} assombrit la glace$/);
  const accent = notes.anchorPdfQuote(source, "L’albedo des glaciers diminue", 1);
  assert.equal(accent?.match, "exact");
  assert.equal(accent?.from.line, 1);
});

test("anchorPdfQuote : sans correspondance, la ligne SyncTeX ; homonyme trop loin écarté", () => {
  const filler = Array.from({length: 80}, (_, index) => `ligne ${index}`);
  const source = ["Le même passage répété.", ...filler, "Le même passage répété."].join("\n");
  const near = notes.anchorPdfQuote(source, "Le même passage répété", 79);
  assert.equal(near?.from.line, 81);
  const none = notes.anchorPdfQuote(source, "introuvable dans la source", 5);
  assert.equal(none?.match, "line");
  assert.equal(none?.from.line, 5);
  assert.equal(notes.anchorPdfQuote(source, "introuvable dans la source", null), null);
});

test("pageTextItems et locateOnPage dessinent une note .tex sur la page", () => {
  const page = {width: 600, height: 800};
  const items = notes.pageTextItems([
    {str: "Le dépôt de carbone", transform: [10, 0, 0, 10, 72, 700], width: 120},
    {str: "suie assombrit la glace.", transform: [10, 0, 0, 10, 72, 686], width: 150},
    {str: "Autre ligne.", transform: [10, 0, 0, 10, 72, 300], width: 80},
  ], page.height);
  assert.equal(items.length, 3);
  assert.ok(Math.abs(items[0].top - (100 - 8.2)) < 1e-9);
  const rects = notes.locateOnPage(items, "\\textbf{carbone suie} assombrit", 100, page);
  assert.ok(rects);
  assert.equal(rects.length, 2, "deux lignes, deux rectangles");
  assert.ok(rects[0][0] > 72 / 600, "commence après « Le dépôt de »");
  assert.ok(rects[1][1] > rects[0][1]);
  assert.equal(notes.locateOnPage(items, "absent du tout", 100, page), null);
  assert.equal(notes.locateOnPage(items, "ab", 100, page), null);
});

test("columnItemHtml : pastille de la teinte, citation échappée, page et ligne", () => {
  const html = notes.columnItemHtml({id: "pdf_a<1", number: 3, color: "blue", quote: "x < y\n  et z", note: "Vérifier <b>", page: 4, line: 18, src: "pdf", agent: "Claude", unread: true});
  assert.match(html, /class="tp-item note-c-blue" data-id="pdf_a&lt;1" data-src="pdf"/);
  assert.match(html, /atelier-annotation-number tp-ring note-c-blue is-agent is-unread">3</);
  assert.match(html, /<span class="tp-quote">x &lt; y et z<\/span>/);
  assert.match(html, /<span class="tp-note">Vérifier &lt;b&gt;<\/span>/);
  assert.match(html, /p\. 4/);
  assert.match(html, /ligne 18/);
  assert.match(html, /<span class="tp-who">Claude<\/span>/);
  assert.equal(notes.noteLocation({page: null, line: 2, lineEnd: 5}).includes("lignes 2-5"), true);
});

test("compareNotes : ordre du document, puis page et hauteur ; ids admis par atelier_revision", () => {
  const rows = [{line: 10, ch: 4}, {page: 2, top: 10}, {line: 3, ch: 0}, {line: 10, ch: 1}, {page: 1, top: 500}];
  assert.deepEqual([...rows].sort(notes.compareNotes), [{line: 3, ch: 0}, {line: 10, ch: 1}, {line: 10, ch: 4}, {page: 1, top: 500}, {page: 2, top: 10}]);
  assert.equal(notes.pdfNoteId("a.b/c-1_2"), "pdf_abc-1_2");
  assert.equal(notes.pdfNoteId("..."), "pdf_x");
  assert.match(notes.pdfNoteId("x".repeat(90)), /^pdf_x{56}$/);
  assert.equal(notes.reviewRequestKey("/p/main.tex"), "atelier.texReview:/p/main.tex");
});
