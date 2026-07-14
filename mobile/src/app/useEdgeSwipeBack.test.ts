import { describe, expect, it } from "vitest";
import { isEdgeSwipeBack } from "./useEdgeSwipeBack.ts";

describe("isEdgeSwipeBack", () => {
  it("accepts a deliberate swipe starting at the left edge", () => {
    expect(isEdgeSwipeBack({ x: 12, y: 240 }, { x: 110, y: 255 })).toBe(true);
  });

  it("rejects ordinary horizontal scrolling away from the edge", () => {
    expect(isEdgeSwipeBack({ x: 80, y: 240 }, { x: 190, y: 245 })).toBe(false);
  });

  it("rejects vertical scrolling and short touches", () => {
    expect(isEdgeSwipeBack({ x: 10, y: 100 }, { x: 95, y: 190 })).toBe(false);
    expect(isEdgeSwipeBack({ x: 10, y: 100 }, { x: 60, y: 105 })).toBe(false);
  });
});
