import { describe, expect, it } from "vitest";
import { looksSecretish, scrubSecretString } from "./secrets.ts";

describe("secrets scrub", () => {
  it("redacts bearer and labeled token values", () => {
    const s = scrubSecretString("Bearer abcdefghijklmnop; token=super-secret-value");
    expect(s).toContain("Bearer [redacted]");
    expect(s).toContain("token:[redacted]");
    expect(s).not.toContain("abcdefghijklmnop");
    expect(s).not.toContain("super-secret-value");
  });

  it("detects secretish", () => {
    expect(looksSecretish("my password is x")).toBe(true);
    expect(looksSecretish("hello world")).toBe(false);
  });
});
