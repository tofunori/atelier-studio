import {describe, expect, it} from "vitest";
import {clearDocumentHighlights, findDocumentRanges, highlightDocumentRanges} from "./documentSearch";

describe("reading passage ranges", () => {
  it("clears a highlight applied to the source pre itself", () => {
    const root = document.createElement("pre"); root.textContent = "Source passage";
    highlightDocumentRanges(root, "reader-search", findDocumentRanges(root, "passage"));
    expect(root.classList.contains("reader-search")).toBe(true);
    clearDocumentHighlights(root, "reader-search");
    expect(root.classList.contains("reader-search")).toBe(false);
    expect(root.hasAttribute("data-reader-search")).toBe(false);
  });
  it("matches through emphasis and links, preserving their DOM structure", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p>Une <strong>épaisseur</strong> de <a href="#source">500 m</a> mesurée.</p>';
    const range = findDocumentRanges(root, "epaisseur de 500 m")[0];
    expect(range.toString()).toBe("épaisseur de 500 m");
    const original = root.querySelector("p")!.firstChild;
    highlightDocumentRanges(root, "reader-quote", [range]);
    expect(root.querySelector(".reader-quote")).toBeTruthy();
    clearDocumentHighlights(root, "reader-quote");
    expect(root.querySelector("p")!.firstChild).toBe(original);
    expect(root.querySelector("strong")?.textContent).toBe("épaisseur");
    expect(root.querySelector("a")?.getAttribute("href")).toBe("#source");
  });
  it("finds separate occurrences and respects words across paragraph boundaries", () => {
    const root = document.createElement("div"); root.innerHTML = '<p>Albédo</p><p>de glace. Albédo de glace.</p>';
    expect(findDocumentRanges(root, "albedo de glace")).toHaveLength(2);
    expect(findDocumentRanges(root, "albedode")).toHaveLength(0);
  });
});
