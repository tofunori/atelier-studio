import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPos,
  countColumn,
  cm5KeyToCm6,
  createOperationBatcher,
  indexFromPos,
  normalizeScrollTarget,
  posFromIndex,
} from "../../assets/cm6/studio_compat.mjs";

test("clampPos: in-bounds position passes through", () => {
  assert.deepEqual(clampPos({line: 1, ch: 3}, 5, () => 10), {line: 1, ch: 3});
});

test("operation batcher flushes hundreds of updates through one dispatch", () => {
  const dispatches = [];
  const batcher = createOperationBatcher((updates) => dispatches.push(updates));
  batcher.run(() => {
    for (let line = 0; line < 500; line += 1) batcher.push({line});
  });
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].length, 500);
  assert.deepEqual(dispatches[0][0], {line: 0});
  assert.deepEqual(dispatches[0][499], {line: 499});
});

test("operation batcher is nested and preserves immediate updates outside operation", () => {
  const dispatches = [];
  const batcher = createOperationBatcher((updates) => dispatches.push(updates));
  batcher.push("outside-before");
  batcher.run(() => {
    batcher.push("outer");
    batcher.run(() => batcher.push("inner"));
  });
  batcher.push("outside-after");
  assert.deepEqual(dispatches, [["outside-before"], ["outer", "inner"], ["outside-after"]]);
});
test("clampPos: line beyond end clamps to last line, ch to its length", () => {
  assert.deepEqual(clampPos({line: 99, ch: 4}, 3, (l) => l === 2 ? 7 : 0), {line: 2, ch: 4});
  assert.deepEqual(clampPos({line: 99, ch: 40}, 3, (l) => l === 2 ? 7 : 0), {line: 2, ch: 7});
});
test("clampPos: negative values clamp to zero", () => {
  assert.deepEqual(clampPos({line: -2, ch: -5}, 3, () => 8), {line: 0, ch: 0});
});
test("normalizeScrollTarget preserves CM5 positions and ranges", () => {
  const lineLength = (line) => [5, 8, 3][line];
  assert.deepEqual(normalizeScrollTarget({line: 1, ch: 4}, 3, lineLength), {
    from: {line: 1, ch: 4}, to: null,
  });
  assert.deepEqual(normalizeScrollTarget({
    from: {line: 1, ch: 2}, to: {line: 99, ch: 99},
  }, 3, lineLength), {
    from: {line: 1, ch: 2}, to: {line: 2, ch: 3},
  });
});
test("countColumn: leading spaces and tabs", () => {
  assert.equal(countColumn("    x", null, 4), 4);
  assert.equal(countColumn("\tx", null, 4), 4);
  assert.equal(countColumn("\t  x", null, 4), 6);
  assert.equal(countColumn("", null, 4), 0);
});
test("cm5KeyToCm6 mappings", () => {
  assert.equal(cm5KeyToCm6("Alt-Q"), "Alt-q");
  assert.equal(cm5KeyToCm6("Esc"), "Escape");
  assert.equal(cm5KeyToCm6("Tab"), "Tab");
  assert.equal(cm5KeyToCm6("Shift-Cmd-F"), "Shift-Cmd-f");
});

const MULTILINE = "alpha\nbeta\n";

test("posFromIndex maps document boundaries and multiline offsets", () => {
  assert.deepEqual(posFromIndex(MULTILINE, 0), {line: 0, ch: 0});
  assert.deepEqual(posFromIndex(MULTILINE, 6), {line: 1, ch: 0});
  assert.deepEqual(posFromIndex(MULTILINE, MULTILINE.length), {line: 2, ch: 0});
  assert.deepEqual(posFromIndex(MULTILINE, 999), {line: 2, ch: 0});
});

test("indexFromPos maps document boundaries and clamps positions", () => {
  assert.equal(indexFromPos(MULTILINE, {line: 0, ch: 0}), 0);
  assert.equal(indexFromPos(MULTILINE, {line: 1, ch: 2}), 8);
  assert.equal(indexFromPos(MULTILINE, {line: 2, ch: 0}), MULTILINE.length);
  assert.equal(indexFromPos(MULTILINE, {line: 99, ch: 99}), MULTILINE.length);
});
