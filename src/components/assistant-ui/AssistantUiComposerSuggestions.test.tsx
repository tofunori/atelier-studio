import { describe, expect, it } from "vitest";
import {
  assistantUiComposerSuggestionKeyAction,
  buildAssistantUiComposerSuggestions,
  replaceAssistantUiComposerToken,
  type AssistantUiComposerCommand,
} from "./AssistantUiComposerSuggestions";

const commands: AssistantUiComposerCommand[] = [
  { name: "model", source: "Changer le modèle" },
  { name: "permissions", source: "Changer les permissions" },
];

describe("AssistantUiComposerSuggestions", () => {
  it("offers only callable integrations with a token the native sender recognizes", () => {
    const plugin = { id: "drive", name: "drive", displayName: "Drive", description: "", enabled: true,
      skills: [], primarySkill: { name: "drive", path: "/skills/drive/SKILL.md" } };
    const suggestions = buildAssistantUiComposerSuggestions("Voir @dri", {
      plugins: [plugin, { ...plugin, id: "disabled", name: "drive-disabled", enabled: false }],
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ kind: "plugin", insert: "Voir @drive " });
  });
  it("projects slash commands without sending the composer", () => {
    const suggestions = buildAssistantUiComposerSuggestions("Contexte /mod", { commands });
    expect(suggestions.map((item) => item.label)).toEqual(["/model"]);
    expect(replaceAssistantUiComposerToken("Contexte /mod", suggestions[0]!)).toBe("Contexte /model ");
  });

  it("keeps agents and files as native mention targets", () => {
    const suggestions = buildAssistantUiComposerSuggestions("@a", {
      agents: [{ id: "agent-1", label: "Alice" }],
      files: ["src/App.tsx", "README.md"],
      recentFiles: ["src/App.tsx"],
    });
    expect(suggestions[0]).toMatchObject({ kind: "agent", label: "@Alice" });
    expect(suggestions.some((item) => item.kind === "file" && item.path === "src/App.tsx")).toBe(true);
  });

  it("filters recent and Zotero namespaces while preserving the token prefix", () => {
    const recent = buildAssistantUiComposerSuggestions("Voir @recent:app", {
      recentFiles: ["src/App.tsx", "src/Chat.tsx"],
    });
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ kind: "recent-file", path: "src/App.tsx" });
    expect(replaceAssistantUiComposerToken("Voir @recent:app", recent[0]!)).toBe("Voir @src/App.tsx ");

    const zotero = buildAssistantUiComposerSuggestions("Lire @zotero:glacier", {
      zoteroItems: [
        { key: "A", citeKey: "glacier-2024", title: "Glacier albedo", year: "2024" },
        { key: "B", citeKey: "fire-2023", title: "Fire", year: "2023" },
      ],
    });
    expect(zotero).toHaveLength(1);
    expect(zotero[0]).toMatchObject({ kind: "zotero", zoteroKey: "A", label: "@glacier-2024" });
  });

  it("consumes navigation and submit keys while suggestions are open", () => {
    expect(assistantUiComposerSuggestionKeyAction("ArrowDown", 0, 3)).toEqual({ type: "move", index: 1 });
    expect(assistantUiComposerSuggestionKeyAction("ArrowUp", 0, 3)).toEqual({ type: "move", index: 2 });
    expect(assistantUiComposerSuggestionKeyAction("Enter", 1, 3)).toEqual({ type: "select", index: 1 });
    expect(assistantUiComposerSuggestionKeyAction("Escape", 1, 3)).toEqual({ type: "dismiss" });
    expect(assistantUiComposerSuggestionKeyAction("Enter", 0, 0)).toEqual({ type: "ignore" });
  });
});
