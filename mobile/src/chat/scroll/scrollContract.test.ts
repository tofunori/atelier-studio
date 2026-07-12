import { describe, expect, it } from "vitest";
import {
  distanceFromBottom,
  maybeCatchUp,
  modeFromScroll,
  shouldFollowStream,
  scrollTopToPin,
} from "./scrollContract.ts";

describe("scroll contract", () => {
  it("pinned near bottom", () => {
    const m = { scrollTop: 900, scrollHeight: 1000, clientHeight: 100 };
    expect(distanceFromBottom(m)).toBe(0);
    expect(modeFromScroll(m, "reading")).toBe("pinned");
    expect(shouldFollowStream("pinned")).toBe(true);
  });

  it("reading when scrolled up", () => {
    const m = { scrollTop: 0, scrollHeight: 1000, clientHeight: 100 };
    expect(distanceFromBottom(m)).toBe(900);
    expect(modeFromScroll(m, "pinned")).toBe("reading");
    expect(shouldFollowStream("reading")).toBe(false);
  });

  it("catch-up when new items while reading", () => {
    expect(maybeCatchUp("reading", 3)).toBe("catch-up");
    expect(maybeCatchUp("catch-up", 0)).toBe("reading");
    expect(maybeCatchUp("pinned", 5)).toBe("pinned");
  });

  it("scrollTopToPin", () => {
    expect(scrollTopToPin({ scrollHeight: 500, clientHeight: 200 })).toBe(300);
  });
});
