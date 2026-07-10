import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/cm6/studio_editor.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const studioHtml = await readFile(new URL("../../assets/latex_studio.html", import.meta.url), "utf8");
const editorFactory = await readFile(new URL("../../assets/editor_factory.js", import.meta.url), "utf8").catch(() => "");
const codeHtml = await readFile(new URL("../../assets/code_editor.html", import.meta.url), "utf8");
const markdownHtml = await readFile(new URL("../../assets/md_viewer.html", import.meta.url), "utf8");

test("CM6 facade exposes the complete engine-neutral diff contract", () => {
  for (const method of [
    "posFromIndex", "indexFromPos", "getRange", "setSelection", "setBookmark", "operation",
    "setGutterMarker", "clearGutter",
  ]) {
    assert.match(source, new RegExp(`\\b${method}\\s*:`), `missing ${method}`);
  }
  assert.doesNotMatch(source, /const facade = \{\s*view[,\s]/,
    "EditorView must stay private to the engine adapter");
});

test("CM6 uses native tracked decorations, readOnly compartments, and gutter markers", () => {
  assert.match(source, /Decoration\.widget/);
  assert.match(source, /EditorState\.readOnly/);
  assert.match(source, /EditorView\.editable/);
  assert.match(source, /GutterMarker/);
  assert.match(source, /gutterClick/);
});

test("CM6 selectAll and native hanging indent are implemented", () => {
  assert.match(source, /selectAll/);
  assert.match(source, /hangingIndent/);
  assert.match(editorFactory, /editor\.on\("renderLine"/);
});

test("CM6 bundles have one repository-owned deterministic build recipe", async () => {
  assert.equal(pkg.scripts["build:cm6"], "node scripts/build-cm6.mjs");
  const build = await readFile(new URL("../../scripts/build-cm6.mjs", import.meta.url), "utf8");
  assert.match(build, /studio_editor\.mjs/);
  assert.match(build, /latex_cm6_src\.js/);
  assert.match(build, /legalComments:\s*["']none["']/);
});

function factoryHarness({search = "", stored = null, cm6 = true, cm5 = true} = {}) {
  const calls = [];
  const storage = {getItem: key => key === "studioEngine" ? stored : null};
  const document = {documentElement: {dataset: {}}};
  const window = {localStorage: storage};
  if (cm6) window.AtelierStudioCM6 = {createStudioEditor: (parent, options) => {
    calls.push({engine: "cm6", parent, options}); return {engine: "cm6"};
  }};
  if (cm5) window.CodeMirror = (parent, options) => {
    calls.push({engine: "cm5", parent, options});
    return {engine: "cm5", on() {}, refresh() {}, getOption: () => 2, defaultCharWidth: () => 8};
  };
  window.CodeMirror && (window.CodeMirror.Pass = Symbol("pass"));
  vm.runInNewContext(editorFactory, {window, document, location: {search}, URLSearchParams, console: {info() {}, warn() {}}});
  return {factory: window.AtelierEditorFactory, calls, storage, document, window};
}

test("shared editor factory executes query then storage then default precedence", () => {
  assert.equal(factoryHarness({search: "?engine=cm6", stored: "cm5"}).factory.resolveEngine("?engine=cm6", {getItem: () => "cm5"}, "cm5"), "cm6");
  assert.equal(factoryHarness().factory.resolveEngine("?engine=bad", {getItem: () => "cm5"}, "cm6"), "cm5");
  assert.equal(factoryHarness().factory.resolveEngine("?engine=bad", {getItem: () => "bad"}, "cm6"), "cm6");
});

test("shared editor factory owns CM5 and CM6 creation for all editor surfaces", () => {
  for (const html of [studioHtml, codeHtml, markdownHtml]) {
    assert.match(html, /editor_factory\.js/);
    assert.match(html, /AtelierEditorFactory\.createEditor/);
    assert.match(html, /defaultEngine:\s*["']cm6["']/);
  }
  assert.match(editorFactory, /AtelierStudioCM6\.createStudioEditor/);
  assert.match(editorFactory, /CodeMirror\(options\.parent/);
});

test("createEditor behavior routes every extension and unknown text safely", () => {
  const extensions = ["tex", "sty", "bib", "py", "md", "r", "R", "jl", "sh", "bash", "js", "ts", "json", "yaml", "yml", "toml", "unknown"];
  for (const ext of extensions) {
    const cm6 = factoryHarness({search: "?engine=cm6"});
    cm6.factory.createEditor({parent: {}, value: "x", ext, wrap: true, readOnly: false, defaultEngine: "cm6"});
    assert.equal(cm6.calls[0].options.ext, ext === "R" ? "r" : ext);
    const cm5 = factoryHarness({search: "?engine=cm5"});
    assert.doesNotThrow(() => cm5.factory.createEditor({parent: {}, value: "x", ext, defaultEngine: "cm6"}));
    if (["yaml", "yml", "toml", "unknown"].includes(ext)) assert.equal(cm5.calls[0].options.mode, null);
  }
  const json = factoryHarness({search: "?engine=cm5"});
  json.factory.createEditor({parent: {}, value: "{}", ext: "json", defaultEngine: "cm6"});
  assert.equal(json.calls[0].options.mode.name, "javascript");
  assert.equal(json.calls[0].options.mode.json, true);
});

test("missing CM6 reports a controlled CM5 fallback", () => {
  const harness = factoryHarness({search: "?engine=cm6", cm6: false, cm5: true});
  const editor = harness.factory.createEditor({parent: {}, value: "x", ext: "txt", defaultEngine: "cm6"});
  assert.equal(editor.engine, "cm5");
  assert.equal(harness.document.documentElement.dataset.editorEngine, "cm5");
});

test("editor surfaces do not call CM5 APIs outside the factory seam", () => {
  for (const [name, html] of [["latex", studioHtml], ["code", codeHtml], ["markdown", markdownHtml]]) {
    assert.doesNotMatch(html, /\bCodeMirror\.(?:Pass|countColumn)|\bCodeMirror\s*\(|["'](?:inputRead|renderLine)["']/, `${name} leaks a CM5 API`);
  }
});
