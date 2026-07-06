import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, realpathSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function git(root, args, opts = {}) {
  return execFileAsync("git", args, {
    cwd: root,
    encoding: opts.encoding ?? "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
}

function confinedRoot(root) {
  if (!root || typeof root !== "string") throw new Error("root requis");
  if (!existsSync(root)) throw new Error(`repo absent: ${root}`);
  return realpathSync(root);
}

function assertRelativePath(root, filePath) {
  if (!filePath || typeof filePath !== "string") throw new Error("path relatif requis");
  if (filePath.includes("\0")) throw new Error("path invalide");
  if (isAbsolute(filePath)) throw new Error("path relatif requis");
  const absolute = resolve(root, filePath);
  const rel = relative(root, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || rel.split(sep).includes("..")) {
    throw new Error("path hors repo");
  }
  return rel;
}

async function hasHead(root, env) {
  try {
    await git(root, ["rev-parse", "--verify", "HEAD"], { env });
    return true;
  } catch {
    return false;
  }
}

function tempGitEnv(indexFile) {
  return {
    GIT_INDEX_FILE: indexFile,
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "Atelier",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "atelier@example.invalid",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "Atelier",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "atelier@example.invalid",
  };
}

function parseStatus(output) {
  const result = { branch: null, ahead: 0, behind: 0, files: [] };
  const records = output.split("\0").filter(Boolean);
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.startsWith("# branch.head ")) {
      result.branch = record.slice("# branch.head ".length);
      continue;
    }
    if (record.startsWith("# branch.ab ")) {
      const m = /# branch\.ab \+(\d+) -(\d+)/.exec(record);
      if (m) {
        result.ahead = Number(m[1]);
        result.behind = Number(m[2]);
      }
      continue;
    }
    if (record.startsWith("? ") || record.startsWith("! ")) {
      result.files.push({ path: record.slice(2), status: record[0] });
      continue;
    }
    if (record.startsWith("1 ")) {
      const parts = record.split(" ");
      result.files.push({ path: parts.slice(8).join(" "), status: parts[1] });
      continue;
    }
    if (record.startsWith("u ")) {
      const parts = record.split(" ");
      result.files.push({ path: parts.slice(10).join(" "), status: parts[1] });
      continue;
    }
    if (record.startsWith("2 ")) {
      const parts = record.split(" ");
      const path = parts.slice(9).join(" ");
      const originalPath = records[++i] ?? "";
      result.files.push({ path, originalPath, status: parts[1] });
    }
  }
  return result;
}

async function ensureRepo(root) {
  if (!(await isRepo(root))) throw new Error(`repo git introuvable: ${root}`);
}

async function untrackedPaths(root, relPath = null) {
  const current = await status(root);
  return current.files
    .filter((file) => file.status === "?")
    .map((file) => file.path)
    .filter((file) => !relPath || file === relPath || file.startsWith(`${relPath}/`));
}

async function diffUntracked(root, filePath) {
  const absolute = resolve(root, filePath);
  try {
    const { stdout } = await git(root, [
      "diff",
      "--no-index",
      "--no-color",
      "--binary",
      "--",
      "/dev/null",
      absolute,
    ]);
    return stdout;
  } catch (e) {
    return e.stdout ?? "";
  }
}

export async function isRepo(root) {
  try {
    const realRoot = confinedRoot(root);
    const { stdout } = await git(realRoot, ["rev-parse", "--show-toplevel"]);
    return realpathSync(stdout.trim()) === realRoot;
  } catch {
    return false;
  }
}

export async function status(root) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const { stdout } = await git(realRoot, ["status", "--porcelain=v2", "--branch", "-z"]);
  const parsed = parseStatus(stdout);
  // ±lignes par fichier (les non suivis n'ont pas de numstat HEAD)
  if (await hasHead(realRoot)) {
    try {
      const { stdout: ns } = await git(realRoot, ["diff", "--numstat", "HEAD", "--"]);
      const stats = {};
      for (const line of ns.split("\n")) {
        const [a, d, ...p] = line.split("\t");
        if (p.length) stats[p.join("\t")] = { add: Number(a) || 0, del: Number(d) || 0 };
      }
      for (const f of parsed.files) {
        if (stats[f.path]) { f.add = stats[f.path].add; f.del = stats[f.path].del; }
      }
    } catch {}
  }
  return parsed;
}

export async function diff(root, filePath = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const relPath = filePath == null ? null : assertRelativePath(realRoot, filePath);
  const args = ["diff", "--no-ext-diff", "--no-color", "--binary"];
  if (await hasHead(realRoot)) args.push("HEAD");
  args.push("--");
  if (relPath) args.push(relPath);
  let text = "";
  try {
    const { stdout } = await git(realRoot, args);
    text += stdout;
  } catch (e) {
    text += e.stdout ?? "";
  }
  for (const file of await untrackedPaths(realRoot, relPath)) {
    if (text && !text.endsWith("\n")) text += "\n";
    text += await diffUntracked(realRoot, file);
  }
  return text;
}

export async function changedSince(root, sha) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  if (!/^[0-9a-fA-F]{4,64}$/.test(String(sha ?? ""))) throw new Error("sha invalide");
  await git(realRoot, ["cat-file", "-e", `${sha}^{commit}`]);
  const { stdout } = await git(realRoot, ["diff", "--name-only", sha, "--"]);
  const changed = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const file of (await status(realRoot)).files) {
    if (file.status === "?") changed.push(file.path);
  }
  return [...new Set(changed)];
}

export async function stageFile(root, filePath) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const relPath = assertRelativePath(realRoot, filePath);
  await git(realRoot, ["add", "--", relPath]);
}

export async function unstageFile(root, filePath) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const relPath = assertRelativePath(realRoot, filePath);
  if (await hasHead(realRoot)) {
    await git(realRoot, ["restore", "--staged", "--", relPath]);
  } else {
    await git(realRoot, ["rm", "--cached", "--ignore-unmatch", "--", relPath]);
  }
}

export async function revertFile(root, filePath) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const relPath = assertRelativePath(realRoot, filePath);
  if (await hasHead(realRoot)) {
    try {
      await git(realRoot, ["restore", "--source=HEAD", "--staged", "--worktree", "--", relPath]);
      return;
    } catch {}
  } else {
    try {
      await git(realRoot, ["rm", "--cached", "--ignore-unmatch", "--", relPath]);
    } catch {}
  }
  const absolute = resolve(realRoot, relPath);
  if (existsSync(absolute)) rmSync(absolute, { recursive: true, force: true });
}

export async function commit(root, message, files = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const msg = String(message ?? "").trim();
  if (!msg) throw new Error("message de commit vide");
  if (Array.isArray(files) && files.length) {
    // modèle cases à cocher : stager exactement les fichiers choisis
    const rels = files.map((f) => assertRelativePath(realRoot, f));
    await git(realRoot, ["add", "--", ...rels]);
  } else {
    // aucun choix explicite : comportement par défaut = commiter TOUTES les
    // modifications visibles (l'UI cases à cocher affinera ensuite)
    const st = await status(realRoot);
    if (!st.files.length) throw new Error("rien à commiter");
    await git(realRoot, ["add", "-A"]);
  }
  await git(realRoot, ["commit", "-m", msg]);
  const { stdout } = await git(realRoot, ["rev-parse", "HEAD"]);
  return stdout.trim();
}

export async function push(root) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const { stdout, stderr } = await git(realRoot, ["push"], { timeoutMs: 60000 });
  return (stdout + stderr).trim();
}

export async function pull(root) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  // ff-only : jamais de merge surprise déclenché depuis l'UI
  const { stdout, stderr } = await git(realRoot, ["pull", "--ff-only"], { timeoutMs: 60000 });
  return (stdout + stderr).trim();
}

export async function ignorePattern(root, pattern) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const p = `${realRoot}/.gitignore`;
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const cur = existsSync(p) ? readFileSync(p, "utf8") : "";
  if (cur.split("\n").includes(pattern)) return "déjà présent";
  writeFileSync(p, cur + (cur.endsWith("\n") || !cur ? "" : "\n") + pattern + "\n");
  return "ajouté";
}

export async function snapshot(root) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const dir = await mkdtemp(join(tmpdir(), "atelier-git-index-"));
  const indexFile = join(dir, "index");
  const env = tempGitEnv(indexFile);
  try {
    const headExists = await hasHead(realRoot, env);
    if (headExists) await git(realRoot, ["read-tree", "HEAD"], { env });
    await git(realRoot, ["add", "-A"], { env });
    const { stdout: treeOut } = await git(realRoot, ["write-tree"], { env });
    const args = ["commit-tree", treeOut.trim()];
    if (headExists) {
      const { stdout: headOut } = await git(realRoot, ["rev-parse", "HEAD"], { env });
      args.push("-p", headOut.trim());
    }
    args.push("-m", "atelier snapshot");
    const { stdout } = await git(realRoot, args, { env });
    return stdout.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function restore(root, sha) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  if (!/^[0-9a-fA-F]{4,64}$/.test(String(sha ?? ""))) throw new Error("sha invalide");
  const dir = await mkdtemp(join(tmpdir(), "atelier-git-index-"));
  const indexFile = join(dir, "index");
  const env = tempGitEnv(indexFile);
  try {
    await git(realRoot, ["cat-file", "-e", `${sha}^{commit}`], { env });
    await git(realRoot, ["read-tree", `${sha}^{tree}`], { env });
    // checkout AVANT clean : si l'agent a supprimé .gitignore, un clean précoce
    // détruirait les artefacts ignorés (node_modules, data/…) devenus "untracked"
    await git(realRoot, ["checkout-index", "-a", "-f"], { env });
    await git(realRoot, ["clean", "-fd"], { env });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
