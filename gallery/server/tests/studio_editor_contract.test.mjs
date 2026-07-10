import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../../assets/cm6/studio_editor.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const studioHtml = await readFile(new URL("../../assets/latex_studio.html", import.meta.url), "utf8");

test("CM6 facade exposes the complete engine-neutral diff contract", () => {
  for (const method of [
    "posFromIndex", "indexFromPos", "getRange", "setBookmark", "operation",
    "setGutterMarker", "clearGutter",
  ]) {
    assert.match(source, new RegExp(`\\b${method}\\s*:`), `missing ${method}`);
  }
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
