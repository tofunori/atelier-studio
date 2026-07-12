import { describe, expect, it } from "vitest";
import {
  filterItems,
  formatBytes,
  kindFromExt,
  normalizeItem,
  pageItems,
} from "./classify.ts";

describe("classify", () => {
  it("kindFromExt", () => {
    expect(kindFromExt("pdf")).toBe("pdf");
    expect(kindFromExt("PNG")).toBe("figure");
    expect(kindFromExt("tex")).toBe("latex");
    expect(kindFromExt("csv")).toBe("data");
    expect(kindFromExt("py")).toBe("code");
  });

  it("normalizeItem strips path usage — only fileId", () => {
    const it = normalizeItem({
      fileId: "f_abc",
      name: "fig.png",
      size: 12,
      ext: "png",
      kind: "figure",
      relativePath: "../secret",
    });
    expect(it.fileId).toBe("f_abc");
    expect((it as { relativePath?: string }).relativePath).toBeUndefined();
  });

  it("filters and pages", () => {
    const items = [
      normalizeItem({ fileId: "1", name: "a.pdf", size: 1, ext: "pdf", kind: "pdf" }),
      normalizeItem({ fileId: "2", name: "b.png", size: 1, ext: "png", kind: "figure" }),
    ];
    expect(filterItems(items, "pdf")).toHaveLength(1);
    expect(pageItems(items, 0, 1)).toHaveLength(1);
    expect(pageItems(items, 1, 1)).toHaveLength(1);
  });

  it("formatBytes", () => {
    expect(formatBytes(500)).toMatch(/o/);
    expect(formatBytes(2048)).toMatch(/Ko/);
  });
});
