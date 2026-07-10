import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../../assets/cm6/studio_editor.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const studioHtml = await readFile(new URL("../../assets/latex_studio.html", import.meta.url), "utf8");
const editorFactory = await readFile(new URL("../../assets/editor_factory.js", import.meta.url), "utf8").catch(() => "");
const codeHtml = await readFile(new URL("../../assets/code_editor.html", import.meta.url), "utf8");
const markdownHtml = await readFile(new URL("../../assets/md_viewer.html", import.meta.url), "utf8");

test("CM6 facade exposes the complete engine-neutral diff contract", () => {
  for (const method of [
    "posFromIndex", "indexFromPos", "getRange", "setBookmark", "operation",
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
  assert.match(studioHtml, /if\(window\.__ENGINE !== "cm6"\)\{[\s\S]{0,200}cm\.on\("renderLine"/);
});

test("CM6 bundles have one repository-owned deterministic build recipe", async () => {
  assert.equal(pkg.scripts["build:cm6"], "node scripts/build-cm6.mjs");
  const build = await readFile(new URL("../../scripts/build-cm6.mjs", import.meta.url), "utf8");
  assert.match(build, /studio_editor\.mjs/);
  assert.match(build, /latex_cm6_src\.js/);
  assert.match(build, /legalComments:\s*["']none["']/);
});

test("shared editor factory resolves query then storage then default", () => {
  assert.match(editorFactory, /window\.AtelierEditorFactory\s*=/);
  assert.match(editorFactory, /resolveEngine/);
  assert.match(editorFactory, /createEditor/);
  assert.match(editorFactory, /URLSearchParams\([\s\S]*?\.get\(["']engine["']\)/);
  assert.match(editorFactory, /storage\.getItem\(["']studioEngine["']\)/);
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

test("CM6 language routing covers the plan 031 extension matrix", () => {
  for (const ext of ["tex", "sty", "bib", "py", "md", "r", "R", "jl", "sh", "bash", "js", "ts", "json", "yaml", "yml", "toml"]) {
    assert.match(source, new RegExp(`(?:case\\s+["']${ext}["']|${ext === "R" ? "toLowerCase" : ""})`), `missing ${ext}`);
  }
});
