import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/studio_core.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const core = context.AtelierStudioCore;

test("typed diff controller preserves the legacy journal contract and DOM mapping", () => {
  const elements = Object.fromEntries(["diffGrp", "diffTag", "diffPrev", "diffNext", "diffRestore"]
    .map((id) => [id, {id}]));
  const calls = [];
  const journal = {
    push: (...args) => calls.push(args),
    isShown: () => true,
    isBusy: () => false,
  };
  const controller = core.createStudioDiffController({
    factory: (options) => {
      assert.equal(options.els.group.id, "diffGrp");
      assert.equal(options.els.restore.id, "diffRestore");
      return journal;
    },
    getEditor: () => null,
    path: "/tmp/demo.tex",
    notify: () => {},
    restoreText: async () => true,
    document: {getElementById: id => elements[id] || null},
    window: {},
  });
  controller.push("before", "after", {source: "user-save"});
  assert.deepEqual(calls, [["before", "after", {source: "user-save"}]]);
  assert.equal(controller.isShown(), true);
  assert.equal(controller.isBusy(), false);
});
