export type PluginSkill = {
  name: string;
  path: string;
  description?: string | null;
  enabled?: boolean;
};

export type PluginCatalogEntry = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version?: string | null;
  enabled: boolean;
  icon?: string | null;
  skills: PluginSkill[];
  primarySkill?: PluginSkill | null;
};

export function pluginSkillsForPrompt(
  prompt: string,
  plugins: PluginCatalogEntry[],
): PluginSkill[] {
  const mentioned = new Set(
    [...prompt.matchAll(/(^|\s)@([\w-]+)(?=\s|$|[.,!?;:])/g)].map((match) => match[2].toLowerCase()),
  );
  return plugins
    .filter((plugin) => mentioned.has(plugin.name.toLowerCase()))
    .map((plugin) => plugin.primarySkill)
    .filter((skill): skill is PluginSkill => Boolean(skill?.name && skill.path));
}
