import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/code_features.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const code = context.AtelierStudioCode;

test("CSV view filtering and sorting preserves source row identity", () => {
  const rows = [
    ["name", "value"],
    ["sample-10", "10"],
    ["sample-2", "2"],
    ["control", "1"],
  ];
  const compare = (left, right) => Number(left) - Number(right);
  assert.deepEqual(
    code.filterAndSortCsvRows(rows, "sample", 1, 1, compare).map((row) => [row.index, ...row.cells]),
    [[1, "sample-2", "2"], [0, "sample-10", "10"]],
  );
});
