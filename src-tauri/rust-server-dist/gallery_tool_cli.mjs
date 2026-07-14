import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_RELS = 100;
const MAX_REL_LENGTH = 2048;
const MODES = Object.freeze({ show: "focus", open: "viewer", compare: "selection", reset: "all" });

function canonical(path) {
  try { return realpathSync(path); } catch { return resolve(path); }
}

export function buildGalleryCommand(argv, { cwd = process.cwd(), requestId = randomUUID() } = {}) {
  const args = [...argv];
  const action = args.shift();
  if (!MODES[action]) {
    throw new Error("usage: atelier-gallery-tool <show|open|compare|reset> [--project-root PATH] -- [FILE...]");
  }
  let projectRoot = cwd;
  if (args[0] === "--project-root") {
    args.shift();
    projectRoot = args.shift() ?? "";
  }
  if (args[0] === "--") args.shift();
  if (!projectRoot || args.length > MAX_RELS) throw new Error("project-root invalide ou trop de fichiers");
  if (action === "reset" && args.length) throw new Error("reset ne prend aucun fichier");
  if (action === "show" && !args.length) throw new Error("show requiert au moins un fichier");
  if (action === "open" && args.length !== 1) throw new Error("open requiert exactement un fichier");
  if (action === "compare" && args.length < 2) throw new Error("compare requiert au moins deux fichiers");

  const root = canonical(projectRoot);
  const rels = [];
  const seen = new Set();
  for (const input of args) {
    const absolute = canonical(isAbsolute(input) ? input : resolve(root, input));
    const rel = relative(root, absolute).split(sep).join("/");
    if (!rel || rel === ".." || rel.startsWith("../") || rel.length > MAX_REL_LENGTH) {
      throw new Error(`fichier hors projet refusé: ${input}`);
    }
    if (!seen.has(rel)) { seen.add(rel); rels.push(rel); }
  }
  if (action === "compare" && rels.length < 2) throw new Error("compare requiert deux fichiers distincts");
  return { action, mode: MODES[action], projectRoot: root, requestId, rels };
}

export const buildGalleryShowCommand = buildGalleryCommand;

export async function postGalleryCommand(command, {
  lockPath = `${homedir()}/Library/Application Support/atelier-studio/sidecar.lock`,
  fetchImpl = fetch,
} = {}) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (!Number.isInteger(lock.port) || lock.port < 1 || lock.port > 65535 || typeof lock.token !== "string") {
    throw new Error("sidecar.lock invalide");
  }
  const response = await fetchImpl(`http://127.0.0.1:${lock.port}/gallery-command`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-atelier-token": lock.token },
    body: JSON.stringify(command),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body || `gallery-command HTTP ${response.status}`);
  return JSON.parse(body);
}

export const postGalleryShow = postGalleryCommand;

async function main() {
  const command = buildGalleryCommand(process.argv.slice(2));
  const result = await postGalleryCommand(command);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`atelier-gallery-tool: ${error.message}\n`);
    process.exitCode = 1;
  });
}
