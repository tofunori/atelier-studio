import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const core = context.AtelierStudioCore;

test("shared Studio commands route save, select-all, compile, sync, and escape", () => {
  let handler;
  const calls = [];
  const doc = {addEventListener: (_event, callback) => { handler = callback; }, removeEventListener() {}};
  const editor = {execCommand: command => calls.push(command), focus: () => calls.push("focus"), getOption: () => false};
  core.installStudioCommands({
    document: doc, getEditor: () => editor, selectAll: true,
    save: () => calls.push("save"), compile: () => calls.push("compile"),
    sync: () => calls.push("sync"), escape: () => calls.push("escape"),
  });
  const press = (key, extra = {}) => handler({key, metaKey: true, ctrlKey: false, shiftKey: false,
    altKey: false, preventDefault: () => calls.push(`prevent:${key}`), ...extra});
  press("a"); press("s"); press("b"); press("j"); press("Escape", {metaKey: false});
  assert.deepEqual(calls, ["prevent:a", "selectAll", "focus", "prevent:s", "save",
    "prevent:b", "compile", "prevent:j", "sync", "escape"]);
});
