/**
 * Anti-dérive palette — hex critiques identiques au desktop App.css.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const mobileTokens = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tokens.css"),
  "utf8",
);
const desktopCss = readFileSync(join(root, "src/App.css"), "utf8");

function extractHex(src: string, varName: string): string | null {
  const re = new RegExp(`${varName}:\\s*(#[0-9a-fA-F]{6})`);
  return re.exec(src)?.[1]?.toLowerCase() ?? null;
}

describe("tokens Precision Native anti-dérive", () => {
  const keys = ["--bg", "--fg", "--fg2", "--muted", "--accent"] as const;

  for (const key of keys) {
    it(`${key} mobile == desktop`, () => {
      const m = extractHex(mobileTokens, key);
      const d = extractHex(desktopCss, key);
      expect(m, `mobile ${key}`).toBeTruthy();
      expect(d, `desktop ${key}`).toBeTruthy();
      expect(m).toBe(d);
    });
  }

  it("rayons 6 / 10", () => {
    expect(mobileTokens).toMatch(/--radius-control:\s*6px/);
    expect(mobileTokens).toMatch(/--radius-surface:\s*10px/);
  });

  it("touch target ≥ 44", () => {
    expect(mobileTokens).toMatch(/--touch-min:\s*44px/);
  });
});
