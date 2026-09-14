import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {JSDOM} from "jsdom";

const source = await readFile(new URL("../../assets/markdown_features.bundle.js", import.meta.url), "utf8");
const context = {};
vm.runInNewContext(source, context);
const markdown = context.AtelierStudioMarkdown;

test("Markdown preview error escaping cannot inject HTML", () => {
  assert.equal(markdown.escapeHtml('<img src=x onerror="boom"> &'),
    "&lt;img src=x onerror=&quot;boom&quot;&gt; &amp;");
});

test("Markdown selection line mapping respects repeated passages", () => {
  assert.equal(markdown.markdownSelectionPage("same passage\nother\nsame passage", "same passage", 1), "L3");
});

test("Markdown WYSIWYG selection uses the shared annotation capsules", async () => {
  const dom = new JSDOM('<div class="toastui-editor-ww-container"><div class="ProseMirror">Selected passage for review</div></div>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const win = dom.window;
  const sent = [];
  win.fetch = async () => ({ok: true, json: async () => ({annots: []})});
  win.__atelierPost = (payload) => sent.push(payload);
  win.Range.prototype.getBoundingClientRect = () => ({left: 40, right: 180, top: 40, bottom: 60, width: 140, height: 20});
  vm.runInContext(source, dom.getInternalVMContext());
  win.AtelierStudioMarkdown.createMarkdownWysiwygSelection({
    path: "notes/review.md",
    getMarkdown: () => "# Review\n\nSelected passage for review",
  });
  const text = win.document.querySelector(".ProseMirror").firstChild;
  const range = win.document.createRange();
  range.selectNodeContents(text);
  const selection = win.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  win.document.dispatchEvent(new win.MouseEvent("mouseup", {bubbles: true}));
  await new Promise((resolve) => win.setTimeout(resolve, 50));
  const actions = win.document.querySelector(".markdown-selection-actions");
  assert.equal(actions.style.display, "flex");
  const labels = [...actions.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));
  assert.deepEqual(labels.slice(0, 5), [
    "Ajouter au chat", "Annoter", "Question rapide", "Surligner", "Choisir la couleur du surlignage",
  ]);
  actions.querySelector('[aria-label="Question rapide"]').click();
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{
    type: "atelier-quick-ask",
    text: "Selected passage for review",
    path: "notes/review.md",
    page: "L3",
  }]);
  dom.window.close();
});
