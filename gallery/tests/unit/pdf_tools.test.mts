import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

await import("../../assets/pdf_tools.js");
const T = globalThis.AtelierPdfTools;
const html = fs.readFileSync(new URL("../../assets/pdf_viewer.html", import.meta.url), "utf8");

test("the reader loads the tools script before its page code", () => {
  assert.ok(html.indexOf('<script src="pdf_tools.js"></script>') > 0);
  assert.ok(html.indexOf('<script src="pdf_tools.js"></script>') < html.indexOf('data-atelier-source="gallery/src/browser/pages/pdf_viewer_6.ts"'));
});

test("six stamps with fixed meanings and colours, same order as the menu shortcuts", () => {
  assert.deepEqual(T.STAMPS.map(s => [s.id, s.label, s.color]), [
    ["verif", "À vérifier", "#d4921a"], ["imp", "Important", "#d9463b"], ["ok", "D'accord", "#2f9e5b"],
    ["no", "Désaccord", "#7c5cd6"], ["cite", "À citer", "#e07a2e"], ["def", "Définition", "#2f78d6"],
  ]);
  assert.equal(T.stampById("nope").id, "verif");
  assert.match(T.stampIcon("ok", 12), /^<svg[^>]*width="12"[^>]*stroke="currentColor"/);
});

test("tints are named by the meaning of Claude's legend", () => {
  assert.deepEqual(T.COLOR_MEANINGS, ["Résultats", "Méthode et données", "Contexte et lacune", "Limites", "À citer", "Désaccord"]);
  assert.equal(T.colorIndex("rgba(120,170,255,.40)"), 2);
  assert.equal(T.colorIndex("violet"), 5);
  assert.equal(T.colorIndex(""), 0);
  assert.equal(T.colorIndex("#123456"), -1);
});

test("text box style is clamped to the offered fonts, sizes and inks", () => {
  assert.deepEqual(T.textStyle(null), {font: "sans", size: 13, bold: false, italic: false, ink: "#2b2f35"});
  assert.deepEqual(T.textStyle({font: "serif", size: 40, bold: true, italic: "yes", ink: "#2f6fd6"}),
    {font: "serif", size: 24, bold: true, italic: false, ink: "#2f6fd6"});
  assert.equal(T.textStyle({size: 3}).size, 10);
  assert.equal(T.textStyle({ink: "#ff00ff", font: "comic"}).ink, "#2b2f35");
  assert.equal(T.textStyle({font: "comic"}).font, "sans");
  assert.match(T.fontCss("mono"), /monospace/);
});

test("shortcuts: letters follow the layout, digits the physical key, modifiers are left alone", () => {
  assert.deepEqual(T.shortcut({key: "H", code: "KeyH"}), {tool: "hl"});
  assert.deepEqual(T.shortcut({key: "s", code: "KeyS"}), {tool: "st"});
  assert.deepEqual(T.shortcut({key: "e", code: "KeyE"}), {tool: "erase"});
  assert.deepEqual(T.shortcut({key: "&", code: "Digit1"}), {color: 0});
  assert.deepEqual(T.shortcut({key: "1", code: "Digit1", shiftKey: true}), {stamp: 0});
  assert.deepEqual(T.shortcut({key: "6", code: "Numpad6"}), {color: 5});
  assert.equal(T.shortcut({key: "7", code: "Digit7"}), null);
  assert.equal(T.shortcut({key: "r", code: "KeyR"}), null, "R stays with the reading mode");
  assert.equal(T.shortcut({key: "h", code: "KeyH", metaKey: true}), null);
  assert.equal(T.shortcut({key: "H", code: "KeyH", shiftKey: true}), null);
});

test("margin or text: the text column ignores stray page numbers", () => {
  const lines = [[0.1, 0.5], [0.1, 0.52], [0.11, 0.49], [0.52, 0.9], [0.53, 0.9], [0.52, 0.88], [0.48, 0.5]];
  const col = T.textColumn(lines);
  assert.ok(col[0] <= 0.11 && col[1] >= 0.88, JSON.stringify(col));
  assert.equal(T.isMargin(0.05, col), true);
  assert.equal(T.isMargin(0.95, col), true);
  assert.equal(T.isMargin(0.3, col), false);
  assert.equal(T.textColumn([[0.1, 0.9]]), null);
  assert.equal(T.isMargin(0.05, null), true, "scans: the outer 12 % count as margin");
  assert.equal(T.isMargin(0.5, null), false);
});

test("outline flattening keeps depth and skips empty titles", () => {
  const flat = T.flattenOutline([{title: "1 Introduction", dest: "d1", items: [{title: " 1.1  Aim ", dest: [0]}, {title: "", dest: "x"}]},
    {title: "2 Methods", dest: null, items: []}]);
  assert.deepEqual(flat, [{title: "1 Introduction", dest: "d1", depth: 0}, {title: "1.1 Aim", dest: [0], depth: 1},
    {title: "2 Methods", dest: null, depth: 0}]);
  assert.deepEqual(T.flattenOutline(null), []);
});

test("Markdown export groups by page with quote, tint meaning and notes", () => {
  const md = T.annotationsMarkdown([
    {id: 3, page: 4, kind: "note", pin: [0.5, 0.1], note: "Revoir la figure"},
    {id: 1, page: 2, kind: "hl", rects: [[0.1, 0.5, 0.2, 0.01]], text: "grain  size\nmatters", color: "rgba(120,170,255,.40)", memo: "pour l'intro", note: "Explique"},
    {id: 2, page: 2, kind: "st", rects: [[0.1, 0.2, 0.2, 0.01]], text: "old claim", color: "rgba(185,150,255,.40)"},
    {id: 4, page: 4, kind: "stamp", stamp: "verif", pin: [0.05, 0.3], text: "Albedo drops by 12 %"},
    {id: 5, page: 4, kind: "text", rects: [[0.3, 0.6, 0.2, 0.05]], text: "Comparer avec Warren"},
  ], "Warren 1980");
  assert.equal(md, [
    "## Annotations — Warren 1980", "",
    "### p. 2",
    "- « old claim » (barré, violet · Désaccord)",
    "- « grain size matters » (surligné, bleu · Contexte et lacune)",
    "  - Note : pour l'intro",
    "  - Au chat : Explique",
    "",
    "### p. 4",
    "- Note : Revoir la figure",
    "- Tampon « À vérifier » près de : « Albedo drops by 12 % »",
    "- Zone de texte : Comparer avec Warren",
    "",
  ].join("\n"));
  assert.match(T.annotationsMarkdown([], "X"), /\(aucune annotation\)/);
});
