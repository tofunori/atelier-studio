import { describe, expect, it } from "vitest";
import { buildCodexInput, buildThreadOptions } from "./codex.mjs";

describe("codex provider helpers", () => {
  it("conserve une entrée texte simple sans image", () => {
    expect(buildCodexInput({ prompt: "Salut" })).toBe("Salut");
  });

  it("construit une entrée structurée avec images locales", () => {
    expect(buildCodexInput({
      prompt: "Décris",
      imagePath: "/tmp/a.png",
      attachments: [{ path: "/tmp/b.jpg" }, { imagePath: "/tmp/a.png" }],
    })).toEqual([
      { type: "text", text: "Décris" },
      { type: "local_image", path: "/tmp/a.png" },
      { type: "local_image", path: "/tmp/b.jpg" },
    ]);
  });

  it("nettoie les inputs structurés fournis par le router", () => {
    expect(buildCodexInput({
      inputs: [
        { type: "text", text: "Lis" },
        { type: "local_image", path: "/tmp/ui.png" },
        { type: "local_image" },
      ],
    })).toEqual([
      { type: "text", text: "Lis" },
      { type: "local_image", path: "/tmp/ui.png" },
    ]);
  });

  it("expose les options de thread Codex optionnelles", () => {
    expect(buildThreadOptions({
      cwd: "/repo",
      model: "gpt-5.5",
      effort: "high",
      webSearch: true,
      additionalDirectories: ["/extra"],
    })).toEqual({
      workingDirectory: "/repo",
      skipGitRepoCheck: true,
      sandboxMode: "danger-full-access",
      model: "gpt-5.5",
      modelReasoningEffort: "high",
      webSearchMode: "live",
      additionalDirectories: ["/extra"],
    });
  });
});
