import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const BUILTINS = ["loop", "clear", "compact", "model", "memory", "review", "context"];

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
          out.set(entry, { name: entry, source: dir.includes(homedir()) ? "user" : "project" });
        } else if (kind === "commands" && entry.endsWith(".md")) {
          const name = entry.replace(/\.md$/, "");
          out.set(name, { name, source: dir.includes(homedir()) ? "user" : "project" });
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
