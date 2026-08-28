// La vue tableau CSV câblée sur le DOM réel des deux surfaces éditeur.
// `csv_table.test.mjs` couvre le parseur ; ici on vérifie ce qui manquait
// vraiment : un `.csv` ouvert depuis le chat atterrit dans `latex_studio.html`,
// et cette coquille-là doit basculer en tableau comme `code_editor.html`.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {JSDOM} from "jsdom";

const codeFeatures = await readFile(new URL("../../assets/code_features.bundle.js", import.meta.url), "utf8");
const csvToolkitSource = await readFile(new URL("../../assets/csv_table.js", import.meta.url), "utf8");
const featuresContext = {};
vm.runInNewContext(codeFeatures, featuresContext);
const {createCsvViewController} = featuresContext.AtelierStudioCode;
const toolkitModule = {exports: {}};
vm.runInNewContext(csvToolkitSource, {module: toolkitModule, exports: toolkitModule.exports, globalThis: {}});
const toolkit = toolkitModule.exports;

const CSV = [
  "series,start_year,mass_balance_gt_per_year",
  "Alaska,2000,45.88379869548132",
  "Alaska,2001,-27.10431231414758",
  "Global,2000,-78.04414729402814",
].join("\n");

function fakeEditor(text) {
  const lines = text.split("\n");
  return {
    getValue: () => text,
    getLine: (line) => lines[line] ?? "",
    lineCount: () => lines.length,
    refresh: () => {},
    getWrapperElement: () => ({style: {}}),
    setOption: () => {},
  };
}

/** jsdom ne fait pas de mise en page : sans rectangle, le contrôleur refuse
 *  d'ancrer la pastille. On lui en donne un, comme le ferait un navigateur. */
function stubRectangles(win) {
  const rect = {left: 10, right: 210, top: 40, bottom: 60, width: 200, height: 20};
  win.Range.prototype.getBoundingClientRect = () => rect;
  win.Element.prototype.getBoundingClientRect = () => (
    {left: 0, right: 900, top: 0, bottom: 600, width: 900, height: 600});
  return rect;
}

/** Sélectionne le contenu des cellules `first` → `last` (indices d'affichage). */
function selectRows(dom, doc, first, last) {
  const rows = doc.querySelectorAll("#csvTable tbody tr");
  const range = doc.createRange();
  range.setStart(rows[first].children[1], 0);
  range.setEnd(rows[last].children[2], rows[last].children[2].childNodes.length);
  const selection = dom.window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return rows;
}

function memoryStorage() {
  const map = new Map();
  return {getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value))};
}

async function mountSurface(file, options) {
  const html = await readFile(new URL(`../../assets/${file}`, import.meta.url), "utf8");
  // `runScripts` reste désactivé : on veut la coquille, pas ses bundles.
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const controller = createCsvViewController({
    enabled: true,
    getEditor: () => fakeEditor(CSV),
    toolkit,
    document: doc,
    window: dom.window,
    storage: memoryStorage(),
    ...options(doc),
  });
  return {dom, doc, controller};
}

test("the LaTeX studio renders a CSV as a sortable table and hides the editor split", async () => {
  const {doc, controller} = await mountSurface("latex_studio.html", (document) => ({
    editorHost: document.getElementById("split"),
    onModeChange: (mode) => document.body.classList.toggle("csvtable", mode === "table"),
  }));
  controller.activate();

  assert.equal(controller.mode(), "table");
  assert.equal(doc.getElementById("csvView").classList.contains("show"), true);
  assert.equal(doc.getElementById("csvTools").classList.contains("show"), true);
  assert.equal(doc.getElementById("split").style.display, "none");
  assert.equal(doc.body.classList.contains("csvtable"), true);

  const headers = Array.from(doc.querySelectorAll("#csvTable thead th")).map((cell) => cell.textContent);
  assert.deepEqual(headers, ["#", "series", "start_year", "mass_balance_gt_per_year"]);
  const firstRow = Array.from(doc.querySelectorAll("#csvTable tbody tr")).map((row) =>
    Array.from(row.children).map((cell) => cell.textContent));
  assert.equal(firstRow.length, 3);
  assert.deepEqual(firstRow[0], ["2", "Alaska", "2000", "45.88379869548132"]);
  // Les nombres se lisent en colonne : alignés à droite via la classe de type.
  assert.equal(doc.querySelector("#csvTable tbody tr td:last-child").className, "csv-number");
  assert.match(doc.getElementById("csvMeta").textContent, /3 lignes × 3 colonnes · séparateur ,/);
});

test("the LaTeX studio never reveals the header wrap select it keeps hidden", async () => {
  // Cette surface pilote le wrap depuis sa barre d'état ; le `<select>` de
  // l'en-tête doit rester masqué dans les deux modes.
  const {doc, controller} = await mountSurface("latex_studio.html", (document) => ({
    editorHost: document.getElementById("split"),
  }));
  controller.activate();
  assert.equal(doc.getElementById("wrapSel").style.display, "none");
  controller.setMode("source");
  assert.equal(doc.getElementById("wrapSel").style.display, "none");
  assert.equal(doc.getElementById("split").style.display, "flex");
  assert.equal(doc.getElementById("csvView").classList.contains("show"), false);
});

test("searching and sorting the table keeps the source rows intact", async () => {
  const {doc, controller} = await mountSurface("latex_studio.html", (document) => ({
    editorHost: document.getElementById("split"),
  }));
  controller.activate();
  const search = doc.getElementById("csvSearch");
  search.value = "Global";
  controller.render(true);
  const rows = Array.from(doc.querySelectorAll("#csvTable tbody tr")).map((row) => row.children[1].textContent);
  assert.deepEqual(rows, ["Global"]);
  assert.match(doc.getElementById("csvMeta").textContent, /^1 lignes/);
});

test("the code editor surface keeps its own default host and wrap control", async () => {
  const wrapCalls = [];
  const {doc, controller} = await mountSurface("code_editor.html", () => ({
    wrap: {current: () => "win", apply: () => {}, refresh: () => {}, setControlVisible: (visible) => wrapCalls.push(visible)},
  }));
  controller.activate();
  assert.equal(doc.getElementById("ed").style.display, "none");
  assert.deepEqual(wrapCalls, [false]);
  controller.setMode("source");
  assert.equal(doc.getElementById("ed").style.display, "flex");
  assert.deepEqual(wrapCalls, [false, true]);
});

test("selecting rows in the table sends the source lines, not the rendered cells", async () => {
  const seen = [];
  const {dom, doc, controller} = await mountSurface("latex_studio.html", (document) => ({
    editorHost: document.getElementById("split"),
    onSelection: (selection) => seen.push(selection),
  }));
  stubRectangles(dom.window);
  controller.activate();
  selectRows(dom, doc, 0, 1);
  controller.readSelection();

  assert.equal(seen.length, 1);
  const [selection] = seen;
  // Lignes 2 et 3 du fichier (l'en-tête est la ligne 1) — le passage est le
  // SOURCE, pas les cellules rendues, sinon un agent reçoit du texte qu'il ne
  // retrouve pas dans le fichier.
  assert.equal(selection.from.line, 1);
  assert.equal(selection.from.ch, 0);
  assert.equal(selection.to.line, 2);
  assert.equal(selection.text, [
    "Alaska,2000,45.88379869548132",
    "Alaska,2001,-27.10431231414758",
  ].join("\n"));
  assert.equal(selection.lines, 2);
  assert.equal(selection.anchor.caret.bottom, 60);
});

test("a sorted table still reports the file order, not the screen order", async () => {
  const seen = [];
  const {dom, doc, controller} = await mountSurface("latex_studio.html", (document) => ({
    editorHost: document.getElementById("split"),
    onSelection: (selection) => seen.push(selection),
  }));
  stubRectangles(dom.window);
  controller.activate();
  // Tri décroissant sur la 1re colonne : « Global » (ligne 4) passe en tête,
  // au-dessus des lignes 2-3.
  const header = doc.querySelectorAll("#csvTable thead th")[1];
  header.onclick();
  header.onclick();
  const rows = selectRows(dom, doc, 0, 1);
  assert.deepEqual([rows[0].dataset.line, rows[1].dataset.line], ["4", "3"]);
  controller.readSelection();

  // À l'écran la sélection descend de la ligne 4 vers la ligne 3 ; le passage
  // publié, lui, suit le fichier : lignes 3 puis 4.
  const [selection] = seen;
  assert.deepEqual([selection.from.line, selection.to.line], [2, 3]);
  assert.equal(selection.text, [
    "Alaska,2001,-27.10431231414758",
    "Global,2000,-78.04414729402814",
  ].join("\n"));
});

test("collapsing or leaving the table clears the published selection", async () => {
  const events = [];
  const {dom, doc, controller} = await mountSurface("latex_studio.html", (document) => ({
    editorHost: document.getElementById("split"),
    onSelection: () => events.push("selection"),
    onSelectionCleared: () => events.push("cleared"),
  }));
  stubRectangles(dom.window);
  controller.activate();
  selectRows(dom, doc, 0, 0);
  controller.readSelection();
  dom.window.getSelection().removeAllRanges();
  controller.readSelection();
  assert.deepEqual(events, ["selection", "cleared"]);

  // Une sélection hors du tableau (l'en-tête de la page) n'est pas la nôtre :
  // on la laisse à qui de droit plutôt que d'effacer la sienne.
  const outside = doc.createRange();
  outside.selectNodeContents(doc.getElementById("csvTableBtn"));
  const selection = dom.window.getSelection();
  selection.removeAllRanges();
  selection.addRange(outside);
  controller.readSelection();
  assert.deepEqual(events, ["selection", "cleared"]);
});

test("the source mode leaves the selection to the editor bridge", async () => {
  const events = [];
  const {dom, doc, controller} = await mountSurface("latex_studio.html", (document) => ({
    editorHost: document.getElementById("split"),
    onSelection: () => events.push("selection"),
  }));
  stubRectangles(dom.window);
  controller.activate();
  selectRows(dom, doc, 0, 0);
  controller.setMode("source");
  controller.readSelection();
  assert.deepEqual(events, []);
});
