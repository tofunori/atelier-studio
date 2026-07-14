import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src");
const raw = readFileSync(join(root, "styles", "typeset.css"), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

describe("shadcn/typeset — contrat Atelier", () => {
  it("conserve les variables publiques et le preset chat", () => {
    for (const variable of [
      "--typeset-font-body",
      "--typeset-font-heading",
      "--typeset-font-mono",
      "--typeset-size",
      "--typeset-leading",
      "--typeset-flow",
    ]) {
      expect(css).toContain(variable);
    }
    expect(css).toContain(".typeset-chat");
    expect(css).toContain("--typeset-size: var(--chat-fs, var(--fs-xl))");
  });

  it("préserve la stabilité pendant le streaming", () => {
    for (const selector of [
      ":last-child",
      ":last-of-type",
      ":nth-last-child",
      ":nth-last-of-type",
      ":only-child",
      ":only-of-type",
      ":has(",
      ":empty",
    ]) {
      expect(css).not.toContain(selector);
    }
    expect(css).not.toContain("margin-bottom");
    expect(css).not.toMatch(/[^-]margin:/);
  });

  it("garde les échappatoires et interdit le scroll horizontal dans le chat", () => {
    expect(css).toContain(".not-typeset");
    expect(css).toContain("[data-not-typeset]");
    expect(css).not.toContain(".typeset-scroll");
    expect(css).toContain(".md-table");
    expect(css).toContain("table-layout: fixed");
    expect(css).not.toContain("overflow-x: auto");
  });
});
