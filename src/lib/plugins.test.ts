import { describe, expect, it } from "vitest";
import { pluginSkillsForPrompt, revalidateQueuedPluginSkills, type PluginCatalogEntry } from "./plugins";

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
  it("revalidates queued skills against their own project catalog", () => {
    const queued = [{ name: plugins[0].primarySkill!.name, path: plugins[0].primarySkill!.path }];
    expect(revalidateQueuedPluginSkills(queued, plugins)).toEqual(queued);
    expect(revalidateQueuedPluginSkills(queued, [{ ...plugins[0], enabled: false }])).toEqual([]);
    expect(revalidateQueuedPluginSkills(queued, [])).toEqual([]);
    expect(revalidateQueuedPluginSkills(queued, undefined)).toEqual(queued);
  });
  it("does not attach disabled plugins, disabled skills or unreadable details", () => {
    const plugin = plugins[0];
    for (const patch of [{ enabled: false }, { detailError: "unavailable" },
      { primarySkill: { ...plugin.primarySkill!, enabled: false } }, { primarySkill: null }]) {
      expect(pluginSkillsForPrompt("@visualize draw", [{ ...plugin, ...patch }])).toEqual([]);
    }
  });
  it("resolves a visible plugin mention to its structured skill", () => {
    expect(pluginSkillsForPrompt("@visualize montre ce graphe", plugins)).toEqual([
      { name: "visualize:visualize", path: "/plugins/visualize/SKILL.md" },
    ]);
  });

  it("does not trigger on an email-like token or a partial name", () => {
    expect(pluginSkillsForPrompt("foo@visualize et @visual", plugins)).toEqual([]);
  });
});

it("attaches only callable apps as native mentions and preserves their queued type", () => {
  const app: PluginCatalogEntry = { id: "connector:x", name: "app-drive", displayName: "Drive", description: "",
    enabled: true, callable: true, kind: "app", skills: [],
    appMention: { type: "mention", name: "Drive", path: "app://connector_x" } };
  const inputs = pluginSkillsForPrompt("@app-drive trouve le document", [app]);
  expect(inputs).toEqual([app.appMention]);
  expect(revalidateQueuedPluginSkills(inputs, [app])).toEqual(inputs);
  expect(revalidateQueuedPluginSkills(inputs, [{ ...app, callable: false }])).toEqual([]);
  expect(pluginSkillsForPrompt("@app-drive", [{ ...app, enabled: false }])).toEqual([]);
  expect(revalidateQueuedPluginSkills([{ name: "Drive", path: "app://connector_x" }], [app])).toEqual([]);
});
