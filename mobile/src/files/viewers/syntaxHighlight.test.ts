import { describe, expect, it } from "vitest";
import { languageForFile, tokenizeLine } from "./syntaxHighlight.ts";

describe("syntaxHighlight", () => {
  it("detects common scientific and web source files", () => {
    expect(languageForFile("analysis.py")).toBe("python");
    expect(languageForFile("figure.R")).toBe("python");
    expect(languageForFile("paper.tex")).toBe("latex");
    expect(languageForFile("config.json")).toBe("json");
    expect(languageForFile("notes.txt")).toBe("plain");
  });

  it("marks keywords, strings, numbers, and comments", () => {
    const tokens = tokenizeLine('const value = "albedo" + 42; // result', "javascript");
    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "keyword", text: "const" }),
      expect.objectContaining({ kind: "string", text: '"albedo"' }),
      expect.objectContaining({ kind: "number", text: "42" }),
      expect.objectContaining({ kind: "comment", text: "// result" }),
    ]));
  });

  it("does not interpret comment markers after the comment boundary", () => {
    const tokens = tokenizeLine("return value # model output", "python");
    expect(tokens.at(-1)).toEqual({ kind: "comment", text: "# model output" });
  });
});
