import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../assets/markdown_features.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const markdown = context.AtelierStudioMarkdown;

test("Markdown preview error escaping cannot inject HTML", () => {
  assert.equal(markdown.escapeHtml('<img src=x onerror="boom"> &'),
    "&lt;img src=x onerror=&quot;boom&quot;&gt; &amp;");
});
