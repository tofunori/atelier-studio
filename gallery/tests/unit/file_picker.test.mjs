import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const core = context.AtelierStudioCore;

test("recent Studio files are deduplicated, ordered, and capped", () => {
  const values = new Map([["studioRecents", JSON.stringify(Array.from({length: 12}, (_, index) => `/p/${index}.tex`))]]);
  const storage = {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
  core.addRecentStudioFile("/p/5.tex", storage);
  const recent = core.recentStudioFiles(storage);
  assert.equal(recent[0], "/p/5.tex");
  assert.equal(recent.length, 10);
  assert.equal(recent.filter(item => item === "/p/5.tex").length, 1);
});

test("Studio file routing keeps TeX in LaTeX and everything else in Code", () => {
  assert.equal(core.studioPageForPath("/project/main.tex"), "latex_studio.html");
  assert.equal(core.studioPageForPath("/project/notes.md"), "code_editor.html");
  assert.equal(core.studioPageForPath("/project/model.py"), "code_editor.html");
});
