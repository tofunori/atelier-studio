import { describe, expect, it } from "vitest";
import { catalogSkillForPrompt, skillAttachInstruction } from "./skills";
import type { Command } from "./ws";

const COMMANDS: Command[] = [
  { name: "annotation", source: "user", path: "/home/u/.claude/skills/annotation/SKILL.md" },
  { name: "recherche", source: "user", path: "/home/u/.claude/skills/recherche/SKILL.md" },
  { name: "deploy", source: "project", path: "/repo/.claude/commands/deploy.md" },
  { name: "sans-fichier", source: "user" },
  { name: "plan", source: "builtin" },
];

describe("catalogSkillForPrompt", () => {
  it("matche un /nom en tête de prompt avec ou sans arguments", () => {
    expect(catalogSkillForPrompt("/annotation", COMMANDS)).toEqual({
      name: "annotation",
      path: "/home/u/.claude/skills/annotation/SKILL.md",
    });
    expect(catalogSkillForPrompt("/recherche albédo MODIS", COMMANDS)?.name).toBe("recherche");
    expect(catalogSkillForPrompt("  /deploy prod  ", COMMANDS)?.path).toBe(
      "/repo/.claude/commands/deploy.md",
    );
  });

  it("est insensible à la casse du /nom", () => {
    expect(catalogSkillForPrompt("/Annotation corrige ma figure", COMMANDS)?.name).toBe("annotation");
  });

  it("ignore les builtins, les entrées sans path et le texte ordinaire", () => {
    expect(catalogSkillForPrompt("/plan", COMMANDS)).toBeNull();
    expect(catalogSkillForPrompt("/sans-fichier", COMMANDS)).toBeNull();
    expect(catalogSkillForPrompt("/inconnu fait un truc", COMMANDS)).toBeNull();
    expect(catalogSkillForPrompt("bonjour /annotation", COMMANDS)).toBeNull();
    expect(catalogSkillForPrompt("pas de slash", COMMANDS)).toBeNull();
  });

  it("ne matche pas un préfixe partiel du nom", () => {
    expect(catalogSkillForPrompt("/anno", COMMANDS)).toBeNull();
    expect(catalogSkillForPrompt("/annotations", COMMANDS)).toBeNull();
  });
});

describe("skillAttachInstruction", () => {
  it("cite le nom et le chemin du fichier à lire", () => {
    const text = skillAttachInstruction({ name: "annotation", path: "/x/SKILL.md" });
    expect(text).toContain("annotation");
    expect(text).toContain("/x/SKILL.md");
  });
});
