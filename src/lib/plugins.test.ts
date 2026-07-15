import { describe, expect, it } from "vitest";
import { pluginSkillsForPrompt, type PluginCatalogEntry } from "./plugins";

const plugins: PluginCatalogEntry[] = [{
  id: "visualize@openai-bundled",
  name: "visualize",
  displayName: "Visualize",
  description: "Interactive visuals",
  enabled: true,
  skills: [{ name: "visualize:visualize", path: "/plugins/visualize/SKILL.md" }],
  primarySkill: { name: "visualize:visualize", path: "/plugins/visualize/SKILL.md" },
}];

describe("pluginSkillsForPrompt", () => {
  it("resolves a visible plugin mention to its structured skill", () => {
    expect(pluginSkillsForPrompt("@visualize montre ce graphe", plugins)).toEqual([
      { name: "visualize:visualize", path: "/plugins/visualize/SKILL.md" },
    ]);
  });

  it("does not trigger on an email-like token or a partial name", () => {
    expect(pluginSkillsForPrompt("foo@visualize et @visual", plugins)).toEqual([]);
  });
});
