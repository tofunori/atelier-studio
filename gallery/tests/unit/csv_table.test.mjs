import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/csv_table.js", import.meta.url), "utf8");
const module = {exports: {}};
vm.runInNewContext(source, {module, exports: module.exports, globalThis: {}}, {filename: "csv_table.js"});
const csv = module.exports;

test("CSV parser preserves quoted commas, escaped quotes, and embedded newlines", () => {
  const parsed = csv.parse('name,note,value\n"Melt, annual","line 1\nline 2",3.5\n"A ""quoted"" cell",ok,4');
  assert.equal(parsed.delimiter, ",");
  assert.deepEqual(Array.from(parsed.rows[1]), ["Melt, annual", "line 1\nline 2", "3.5"]);
  assert.deepEqual(Array.from(parsed.rows[2]), ['A "quoted" cell', "ok", "4"]);
});

test("CSV parser detects semicolon and pads sparse rows", () => {
  const parsed = csv.parse("year;value;flag\n2003;1.25;TRUE\n2004;2.5");
  assert.equal(parsed.delimiter, ";");
  assert.equal(parsed.width, 3);
  assert.deepEqual(Array.from(parsed.rows[2]), ["2004", "2.5", ""]);
});

test("CSV cells expose useful scientific display kinds", () => {
  assert.equal(csv.classify("3.14e-8"), "number");
  assert.equal(csv.classify("FALSE"), "boolean");
  assert.equal(csv.classify("#D8654B"), "color");
  assert.equal(csv.classify("outputs/analysis/data.json"), "path");
  assert.equal(csv.classify("historical forcing"), "text");
  assert.equal(csv.classify(""), "empty");
});

test("CSV comparison is numeric for numbers and natural for labels", () => {
  assert.ok(csv.compare("2", "10") < 0);
  assert.ok(csv.compare("sample-2", "sample-10") < 0);
});
