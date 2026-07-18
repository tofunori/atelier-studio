import { Command } from "./ws";

export type CatalogSkill = { name: string; path: string };

/** `/nom` en tête de prompt → entrée du catalogue avec chemin (skills et
 * commandes, jamais les builtins). Sert aux providers `skillsAttach` (kimi)
 * où Atelier doit joindre le fichier lui-même — pour claude, le harnais CLI
 * charge les skills nativement et le `/nom` reste du texte. */
export function catalogSkillForPrompt(
  prompt: string,
  commands: Command[],
): CatalogSkill | null {
  const match = /^\/([\w:-]+)(?:\s|$)/.exec(prompt.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  const entry = commands.find(
    (command) =>
      command.source !== "builtin" && command.path && command.name.toLowerCase() === name,
  );
  return entry?.path ? { name: entry.name, path: entry.path } : null;
}

/** Consigne ajoutée au texte envoyé (jamais au prompt affiché) pour que le
 * harnais lise réellement le fichier joint en resource_link. */
export function skillAttachInstruction(skill: CatalogSkill): string {
  return `[Skill « ${skill.name} » : lis le fichier ${skill.path} et applique ses instructions à ce message.]`;
}
