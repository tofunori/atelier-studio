// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { passageFromRange, rangeFromOffsets, relocate } from "./notebookAnnotations";

describe("annotations du cahier", () => {
  it("retrouve un passage déplacé par son texte, au plus près", () => {
    expect(relocate("x = 1\ny = 2\nx = 1", "x = 1", 12)).toBe(12);
    expect(relocate("z = 0\nx = 1", "x = 1", 0)).toBe(6);
    expect(relocate("y = 2", "x = 1", 0)).toBe(-1);
  });

  it("décalages ↔ plage à travers les jetons colorés", () => {
    const pre = document.createElement("pre");
    pre.innerHTML = '<code><span class="k">for</span> i <span class="k">in</span> r:\n    f(i)</code>';
    document.body.append(pre);
    const range = rangeFromOffsets(pre, 4, 10)!;
    expect(range.toString()).toBe("i in r");
    const cell = document.createElement("article");
    cell.className = "nb-cell";
    cell.dataset.cellId = "c1";
    cell.dataset.cellIndex = "3";
    pre.dataset.part = "code";
    cell.append(pre);
    document.body.append(cell);
    const wide = rangeFromOffsets(pre, 3, 11)!; // « ␠i in r:␠ » rogné
    const p = passageFromRange(cell, pre, wide, [1, 1])!;
    expect(p).toMatchObject({ cellId: "c1", cellIndex: 3, part: "code", partIndex: 0, from: 4, to: 11, text: "i in r:" });
  });
});
