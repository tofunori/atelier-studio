import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listCommands, listFileCatalog } from "./catalog.mjs";

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

describe("listFileCatalog — fichiers récemment modifiés", () => {
  it("classe les vrais mtimes et exclut index galerie et sous-produits", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-recents-"));
    writeFileSync(join(root, "ancien.md"), "ancien");
    writeFileSync(join(root, "frais.ts"), "frais");
    writeFileSync(join(root, "compile.log"), "bruit");
    writeFileSync(join(root, "figures_data.json"), "{}");
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist/index.html"), "généré");
    utimesSync(join(root, "ancien.md"), 10, 10);
    utimesSync(join(root, "frais.ts"), 20, 20);
    utimesSync(join(root, "compile.log"), 30, 30);
    utimesSync(join(root, "figures_data.json"), 40, 40);
    utimesSync(join(root, "dist/index.html"), 50, 50);

    const catalog = listFileCatalog(root);
    expect(catalog.recentFiles).toEqual(["frais.ts", "ancien.md"]);
    expect(catalog.files).toEqual(expect.arrayContaining(["frais.ts", "ancien.md"]));
  });
});
