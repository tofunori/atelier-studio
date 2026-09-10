export type PluginSkill = {
  name: string;
  path: string;
  type?: "skill" | "mention";
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
  appMention?: PluginSkill | null;
  kind?: "plugin" | "app";
  callable?: boolean;
  installUrl?: string | null;
  mcpServers?: string[];
  detailError?: string | null;
};

export function pluginTarget(plugin: PluginCatalogEntry): PluginSkill | null {
  if (!plugin.enabled || plugin.detailError) return null;
  if (plugin.appMention && plugin.callable === true) return plugin.appMention;
  const skill = plugin.primarySkill;
  return skill?.name && skill.path && skill.enabled !== false ? skill : null;
}

export function pluginCanAttach(plugin: PluginCatalogEntry): boolean {
  return pluginTarget(plugin) !== null;
}

export function revalidateQueuedPluginSkills(
  skills: Pick<PluginSkill, "name" | "path" | "type">[],
  catalog: PluginCatalogEntry[] | undefined,
): Pick<PluginSkill, "name" | "path" | "type">[] {
  // Une file d'un autre projet conserve son instantané tant que son catalogue
  // n'a pas été chargé. Ne jamais la filtrer avec le catalogue du projet ouvert.
  if (!catalog) return skills;
  return skills.filter((skill) => catalog.some((plugin) => pluginCanAttach(plugin)
    && pluginTarget(plugin)?.name === skill.name && pluginTarget(plugin)?.path === skill.path
    && (pluginTarget(plugin)?.type ?? "skill") === (skill.type ?? "skill")));
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
    .map(pluginTarget)
    .filter((skill): skill is PluginSkill => Boolean(skill?.name && skill.path));
}
