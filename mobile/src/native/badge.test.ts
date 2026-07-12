import { beforeEach, describe, expect, it } from "vitest";
import { clearBadge, getBadgeCount, incrementBadge, setBadgeCount } from "./badge.ts";

beforeEach(() => {
  clearBadge();
});

describe("badge", () => {
  it("increment and clear", () => {
    expect(getBadgeCount()).toBe(0);
    incrementBadge();
    incrementBadge(2);
    expect(getBadgeCount()).toBe(3);
    clearBadge();
    expect(getBadgeCount()).toBe(0);
  });

  it("set clamps", () => {
    setBadgeCount(-5);
    expect(getBadgeCount()).toBe(0);
  });
});
