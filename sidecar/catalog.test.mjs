import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listCommands } from "./catalog.mjs";

describe("listCommands — path des skills et commandes (skillsAttach)", () => {
  it("expose le SKILL.md des skills et le .md des commandes, jamais des builtins", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-catalog-"));
    const skillDir = join(root, ".claude/skills/mon-skill-test");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "instructions");
    mkdirSync(join(root, ".claude/skills/skill-vide-test"), { recursive: true });
    mkdirSync(join(root, ".claude/commands"), { recursive: true });
    writeFileSync(join(root, ".claude/commands/ma-commande-test.md"), "prompt");

    const out = listCommands(root);
    expect(out.find((c) => c.name === "mon-skill-test")?.path).toBe(join(skillDir, "SKILL.md"));
    expect(out.find((c) => c.name === "skill-vide-test")?.path).toBeUndefined();
    expect(out.find((c) => c.name === "ma-commande-test")?.path).toBe(
      join(root, ".claude/commands/ma-commande-test.md"),
    );
    expect(out.find((c) => c.source === "builtin")?.path).toBeUndefined();
  });
});
