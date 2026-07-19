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

const RECENT_JUNK = /\.(aux|log|synctex(\.gz)?|fls|fdb_latexmk|out|toc|bbl|blg|bak)$/i;
const RECENT_HIDDEN = new Set(["figures_index.html", "figures_data.json"]);
const RECENT_GENERATED_PREFIXES = [
  "dist/", "mobile/dist/", "src-tauri/mobile-dist/", "src-tauri/rust-server-dist/",
  "src-tauri/sidecar-dist/", "src-tauri/appsnap-dist/", "src-tauri/gallery-dist/",
  "gallery/assets/shadcn-ui/",
];

function isGeneratedRecent(rel) {
  return RECENT_GENERATED_PREFIXES.some((prefix) => rel.startsWith(prefix))
    || (rel.startsWith("gallery/assets/cm6/") && rel.endsWith(".bundle.js"));
}

function recentProjectFiles(projectRoot, files, limit = 12) {
  return files
    .filter((rel) => rel && !RECENT_HIDDEN.has(rel) && !RECENT_JUNK.test(rel)
      && !/(^|\/)\./.test(rel) && !/(^|\/)target\//.test(rel)
      && !isGeneratedRecent(rel))
    .map((rel) => {
      try {
        const stat = statSync(join(projectRoot, rel));
        return stat.isFile() ? { rel, mtime: stat.mtimeMs } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime || a.rel.localeCompare(b.rel))
    .slice(0, limit)
    .map((entry) => entry.rel);
}

/** Catalogue projet + vrais fichiers récemment modifiés (git-tracked ou
 * non ignorés). Le classement mtime reste côté backend, où le disque est
 * accessible, et ne dépend ni de la galerie ni du localStorage du WebView. */
export function listFileCatalog(projectRoot) {
  if (!projectRoot) return { files: [], recentFiles: [] };
  try {
    const raw = execSync("git ls-files --cached --others --exclude-standard", {
      cwd: projectRoot,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5000,
    }).toString();
    const all = raw.split("\n").filter(Boolean);
    return {
      files: all.slice(0, 5000),
      recentFiles: recentProjectFiles(projectRoot, all),
    };
  } catch {
    try {
      const all = readdirSync(projectRoot).filter((f) => !f.startsWith("."));
      return {
        files: all,
        recentFiles: recentProjectFiles(projectRoot, all),
      };
    } catch {
      return { files: [], recentFiles: [] };
    }
  }
}

/** Fichiers du projet pour l'autocomplétion @ (git ls-files, plafonné). */
export function listFiles(projectRoot) {
  return listFileCatalog(projectRoot).files;
}
