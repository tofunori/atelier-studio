import { describe, expect, it } from "vitest";
import { interfaceGeometry, interfaceTypography } from "./interfaceTheme";

describe("interface scale", () => {
  it("increases every text role with larger UI settings without setting chat or editor sizes", () => {
    const normal = interfaceTypography(15);
    const large = interfaceTypography(18);
    for (const name of Object.keys(normal)) expect(parseFloat(large[name])).toBeGreaterThan(parseFloat(normal[name]));
    expect(large).not.toHaveProperty("--chat-fs");
    expect(large).not.toHaveProperty("--code-font-size");
  });

  it("keeps small labels readable and contains malformed persisted settings", () => {
    const small = interfaceTypography(12);
    expect(parseFloat(small["--fs-label"])).toBeGreaterThanOrEqual(11);
    expect(parseFloat(small["--fs-body"])).toBeGreaterThanOrEqual(12);
    expect(interfaceTypography(NaN)).toEqual(interfaceTypography(15));
    expect(interfaceTypography(999)).toEqual(interfaceTypography(18));
  });

  it("passes the effective reduced-motion and geometry values without replacing them", () => {
    const values: Record<string, string> = { "--motion-standard": " 0ms ", "--radius-control": " 6px " };
    const result = interfaceGeometry({ getPropertyValue: (key) => values[key] || "" });
    expect(result).toEqual({ "--motion-standard": "0ms", "--radius-control": "6px" });
  });
});
