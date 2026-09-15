import { describe, expect, it } from "vitest";
import { buildCollectionTree, flattenCollectionTree } from "./collections";
import type { ZoteroCollection } from "./types";

const c = (id: number | string, name: string, parent: number | string | null = null): ZoteroCollection => ({ id, name, parent });

describe("collection tree", () => {
  it("nests mixed numeric/string IDs and preserves input order", () => {
    const roots = buildCollectionTree([
      c(1, "Root"), c("2", "Child", "1"), c(3, "Other"), c(4, "Grandchild", 2),
    ]);
    expect(flattenCollectionTree(roots).map(({ id, depth }) => [id, depth])).toEqual([
      ["1", 0], ["2", 1], ["4", 2], ["3", 0],
    ]);
  });

  it("keeps an orphaned collection at the root", () => {
    const roots = buildCollectionTree([c("orphan", "Orphan", 999), c("ok", "Root")]);
    expect(roots.map((root) => root.id)).toEqual(["orphan", "ok"]);
    expect(roots[0].children).toEqual([]);
  });

  it("cuts self-references and longer cycles without recursion", () => {
    const roots = buildCollectionTree([c("a", "A", "a"), c("b", "B", "c"), c("c", "C", "b")]);
    expect(flattenCollectionTree(roots).map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(flattenCollectionTree(roots).map(({ depth }) => depth)).toEqual([0, 0, 0]);
  });

  it("deduplicates numeric/string aliases deterministically", () => {
    const roots = buildCollectionTree([c(7, "First"), c("7", "Duplicate"), c("8", "Child", 7)]);
    expect(flattenCollectionTree(roots).map(({ id, collection }) => [id, collection.name])).toEqual([["7", "First"], ["8", "Child"]]);
  });
});
