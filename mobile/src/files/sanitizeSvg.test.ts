import { describe, expect, it } from "vitest";
import { isSvgSafeEnough, sanitizeSvg } from "./sanitizeSvg.ts";

describe("sanitizeSvg", () => {
  it("strips script and handlers", () => {
    const dirty = `<svg><script>alert(1)</script><rect onclick="x()" width="1"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toContain("script");
    expect(clean.toLowerCase()).not.toContain("onclick");
    expect(isSvgSafeEnough(clean)).toBe(true);
  });

  it("strips javascript urls", () => {
    const dirty = `<svg><a href="javascript:alert(1)">x</a></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toContain("javascript:");
  });
});
