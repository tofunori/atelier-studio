import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

// vérifié sur session SDK live 2026-07-06 : model/memory ne sont PAS interprétées par le SDK
const BUILTINS = [
  "goal", "loop", "clear", "compact", "review", "context",
  "status", "model", "permissions", "plan", "diff", "usage", "resume",
  "plugins",
];

/** Skills + slash commands visibles pour un projet (user + projet). */
export function listCommands(projectRoot) {
  const out = new Map();
  const scan = (dir, kind) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      const p = join(dir, entry);
      try {
        if (kind === "skills" && statSync(p).isDirectory()) {
          // path = SKILL.md pour les providers skillsAttach (kimi) qui
          // reçoivent le fichier en resource_link au lieu du /nom textuel.
          const skillMd = join(p, "SKILL.md");
          out.set(entry, {
            name: entry,
            source: dir.includes(homedir()) ? "user" : "project",
            ...(existsSync(skillMd) ? { path: skillMd } : {}),
          });
        } else if (kind === "commands" && entry.endsWith(".md")) {
          const name = entry.replace(/\.md$/, "");
          out.set(name, { name, source: dir.includes(homedir()) ? "user" : "project", path: p });
        }
      } catch {}
    }
  };
  scan(join(homedir(), ".claude/skills"), "skills");
  scan(join(homedir(), ".claude/commands"), "commands");
  if (projectRoot) {
    scan(join(projectRoot, ".claude/skills"), "skills");
    scan(join(projectRoot, ".claude/commands"), "commands");
  }
  for (const name of BUILTINS) {
    if (!out.has(name)) out.set(name, { name, source: "builtin" });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Fichiers du projet pour l'autocomplétion @ (git ls-files, plafonné). */
export function listFiles(projectRoot) {
  if (!projectRoot) return [];
  try {
    const raw = execSync("git ls-files --cached --others --exclude-standard", {
      cwd: projectRoot,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5000,
    }).toString();
    return raw.split("\n").filter(Boolean).slice(0, 5000);
  } catch {
    try {
      return readdirSync(projectRoot).filter((f) => !f.startsWith("."));
    } catch {
      return [];
    }
  }
}
