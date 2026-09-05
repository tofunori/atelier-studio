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
  detailError?: string | null;
};

export function pluginCanAttach(plugin: PluginCatalogEntry): boolean {
  return plugin.enabled && !plugin.detailError && Boolean(plugin.primarySkill?.name
    && plugin.primarySkill.path && plugin.primarySkill.enabled !== false);
}

export function revalidateQueuedPluginSkills(
  skills: Pick<PluginSkill, "name" | "path">[],
  catalog: PluginCatalogEntry[] | undefined,
): Pick<PluginSkill, "name" | "path">[] {
  // Une file d'un autre projet conserve son instantané tant que son catalogue
  // n'a pas été chargé. Ne jamais la filtrer avec le catalogue du projet ouvert.
  if (!catalog) return skills;
  return skills.filter((skill) => catalog.some((plugin) => pluginCanAttach(plugin)
    && plugin.primarySkill?.name === skill.name && plugin.primarySkill.path === skill.path));
}

export function pluginSkillsForPrompt(
  prompt: string,
  plugins: PluginCatalogEntry[],
): PluginSkill[] {
  const mentioned = new Set(
    [...prompt.matchAll(/(^|\s)@([\w-]+)(?=\s|$|[.,!?;:])/g)].map((match) => match[2].toLowerCase()),
  );
  return plugins
    .filter((plugin) => pluginCanAttach(plugin) && mentioned.has(plugin.name.toLowerCase()))
    .map((plugin) => plugin.primarySkill)
    .filter((skill): skill is PluginSkill => Boolean(skill?.name && skill.path));
}
