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
  return {
    getValue: () => text,
    refresh: () => {},
    getWrapperElement: () => ({style: {}}),
    setOption: () => {},
  };
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
