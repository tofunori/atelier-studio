import test from "node:test";
import assert from "node:assert/strict";
import {inlineDeletedText} from "../../src/browser/cm6/review_inline.ts";

test("texte retiré affiché dans la ligne : retours à la ligne aplatis, espaces seuls ignorés", () => {
  assert.equal(inlineDeletedText("de façon\n  marquée"), "de façon marquée");
  assert.equal(inlineDeletedText(", car leur zone\nreste exposée.\n"), ", car leur zone reste exposée.");
  assert.equal(inlineDeletedText("\n"), "");
  assert.equal(inlineDeletedText(" \n  "), "");
});
