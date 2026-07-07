// Résolution robuste des CLIs externes (claude, codex…) : lancé depuis le
// Finder, le sidecar hérite d'un PATH minimal — `command -v` échoue alors que
// le CLI est installé. Stratégie : PATH courant, puis emplacements standards,
// puis UNE interrogation du login shell (mise en cache).
import { execSync } from "node:child_process";
import { accessSync, constants, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";

function standardDirs() {
  const home = homedir();
  const dirs = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/Applications/cmux.app/Contents/Resources/bin",
    join(home, ".local", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".claude", "local"), // installation locale de claude code
    join(home, ".npm-global", "bin"),
  ];
  // nvm : version la plus récente installée
  try {
    const base = join(home, ".nvm", "versions", "node");
    const versions = readdirSync(base).sort();
    if (versions.length) dirs.push(join(base, versions[versions.length - 1], "bin"));
  } catch {}
  return dirs.filter((d) => existsSync(d));
}

function isExecutable(p) {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Ajoute les dossiers standards manquants au PATH du process (une fois) —
 * les spawns descendants (SDK claude, codex app-server, node-pty) en héritent. */
let enriched = false;
export function enrichPath() {
  if (enriched) return process.env.PATH;
  enriched = true;
  const current = (process.env.PATH ?? "").split(delimiter);
  const missing = standardDirs().filter((d) => !current.includes(d));
  if (missing.length) process.env.PATH = [...current, ...missing].join(delimiter);
  return process.env.PATH;
}

let loginPath = null; // cache : login shell interrogé au plus une fois
function loginShellPath() {
  if (loginPath !== null) return loginPath;
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    loginPath = execSync(`${shell} -lc 'echo -n "$PATH"'`, { encoding: "utf8", timeout: 4000 });
  } catch {
    loginPath = "";
  }
  return loginPath;
}

/** Chemin absolu du binaire, ou null s'il est introuvable partout. */
export function resolveBin(name) {
  enrichPath();
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir && isExecutable(join(dir, name))) return join(dir, name);
  }
  for (const dir of loginShellPath().split(delimiter)) {
    if (dir && isExecutable(join(dir, name))) return join(dir, name);
  }
  return null;
}
