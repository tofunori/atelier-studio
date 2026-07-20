import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

function assertSha(sha) {
  const value = String(sha ?? "");
  if (!/^[0-9a-f]{4,64}$/i.test(value)) throw new Error("sha invalide");
  return value;
}

async function resolveHead(root) {
  const { stdout } = await git(root, ["rev-parse", "HEAD"]);
  return stdout.trim();
}

async function assertExpectedHead(root, expectedHead) {
  const head = await resolveHead(root);
  if (expectedHead && head !== assertSha(expectedHead)) {
    throw new Error("opération refusée : HEAD a changé, actualise l’historique");
  }
  return head;
}

async function assertClean(root) {
  if ((await status(root)).files.length) {
    throw new Error("opération refusée : l’arbre de travail doit être propre");
  }
}

async function upstreamSha(root) {
  try { return (await git(root, ["rev-parse", "--verify", "@{upstream}"])).stdout.trim(); }
  catch { return null; }
}

async function isAncestor(root, ancestor, descendant) {
  try { await git(root, ["merge-base", "--is-ancestor", ancestor, descendant]); return true; }
  catch { return false; }
}

function parseCommitRecords(output) {
  return String(output ?? "").split("\x1e").filter(Boolean).map((record) => {
    const [sha, shortSha, parents, author, authorEmail, authoredAt, subject, decorations] = record.replace(/^\n/, "").split("\x1f");
    return {
      sha, shortSha, parents: parents ? parents.split(" ") : [], author, authorEmail, authoredAt, subject,
      decorations: decorations ? decorations.split(", ").filter(Boolean) : [],
    };
  }).filter((commit) => /^[0-9a-f]{40,64}$/i.test(commit.sha));
}

function parseStatus(output) {
  const result = { branch: null, branches: [], ahead: 0, behind: 0, files: [] };
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
  try {
    const { stdout: refs } = await git(realRoot, [
      "for-each-ref",
      "--format=%(refname:short)",
      "--sort=refname",
      "refs/heads/",
    ]);
    parsed.branches = refs.split("\n").map((branch) => branch.trim()).filter(Boolean);
  } catch {}
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

export async function log(root, { all = false, skip = 0, limit = 50, query = "" } = {}) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const pageSize = Math.max(1, Math.min(100, Number(limit) || 50));
  const offset = Math.max(0, Number(skip) || 0);
  const args = [
    "log", "--topo-order", `--max-count=${pageSize + 1}`, `--skip=${offset}`,
    "--format=%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D",
  ];
  const search = String(query ?? "").trim().slice(0, 200);
  if (search) args.push("--regexp-ignore-case", `--grep=${search}`);
  if (all) args.push("--all");
  const commits = parseCommitRecords((await git(realRoot, args)).stdout);
  return { commits: commits.slice(0, pageSize), hasMore: commits.length > pageSize, skip: offset };
}

export async function commitDetails(root, sha) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const commit = assertSha(sha);
  await git(realRoot, ["cat-file", "-e", `${commit}^{commit}`]);
  const metadata = parseCommitRecords((await git(realRoot, [
    "show", "-s", "--format=%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D", commit,
  ])).stdout)[0];
  const body = (await git(realRoot, ["show", "-s", "--format=%B", commit])).stdout.trim();
  const names = (await git(realRoot, ["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-M", commit])).stdout;
  const files = names.split(/\r?\n/).filter(Boolean).map((line) => {
    const [statusCode, ...paths] = line.split("\t");
    return { status: statusCode, path: paths.at(-1) ?? "", previousPath: paths.length > 1 ? paths[0] : undefined };
  });
  const diff = (await git(realRoot, ["show", "--no-ext-diff", "--no-color", "--format=", "--binary", commit])).stdout;
  const head = await resolveHead(realRoot);
  const upstream = await upstreamSha(realRoot);
  return {
    ...metadata, body, files, diff, head, upstream,
    isHead: head === metadata.sha,
    isPublished: upstream ? await isAncestor(realRoot, metadata.sha, upstream) : false,
  };
}

/** Exact before/after documents for one file in a historical commit. */
export async function commitFileContents(root, sha, filePath, previousPath = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const commit = assertSha(sha);
  const rel = assertRelativePath(realRoot, filePath);
  const previousRel = previousPath ? assertRelativePath(realRoot, previousPath) : rel;
  await git(realRoot, ["cat-file", "-e", `${commit}^{commit}`]);
  const parents = (await git(realRoot, ["show", "-s", "--format=%P", commit])).stdout.trim().split(/\s+/).filter(Boolean);
  const beforeBytes = parents[0] ? await gitObject(realRoot, `${parents[0]}:${previousRel}`) : Buffer.alloc(0);
  const afterBytes = await gitObject(realRoot, `${commit}:${rel}`);
  const before = decodedDiffContent(beforeBytes);
  const after = decodedDiffContent(afterBytes);
  return { before: before.text, after: after.text, binary: before.binary || after.binary };
}

export async function createBranchAt(root, branch, sha) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  await assertClean(realRoot);
  const commit = assertSha(sha);
  const name = String(branch ?? "").trim();
  await git(realRoot, ["check-ref-format", "--branch", name]);
  await git(realRoot, ["cat-file", "-e", `${commit}^{commit}`]);
  await git(realRoot, ["switch", "-c", name, commit]);
  return name;
}

export async function restoreFileFromCommit(root, sha, filePath, expectedHead = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  await assertClean(realRoot);
  await assertExpectedHead(realRoot, expectedHead);
  const commit = assertSha(sha);
  const rel = assertRelativePath(realRoot, filePath);
  await git(realRoot, ["cat-file", "-e", `${commit}^{commit}`]);
  await git(realRoot, ["restore", `--source=${commit}`, "--worktree", "--", rel]);
  return rel;
}

export async function revertCommit(root, sha, expectedHead = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  await assertClean(realRoot);
  await assertExpectedHead(realRoot, expectedHead);
  const commit = assertSha(sha);
  const parents = (await git(realRoot, ["show", "-s", "--format=%P", commit])).stdout.trim().split(/\s+/).filter(Boolean);
  if (parents.length > 1) throw new Error("revert d’un commit de fusion non pris en charge");
  try { await git(realRoot, ["revert", "--no-edit", commit]); }
  catch (error) { try { await git(realRoot, ["revert", "--abort"]); } catch {} throw error; }
  return resolveHead(realRoot);
}

export async function undoLastCommit(root, expectedHead = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  await assertClean(realRoot);
  const head = await assertExpectedHead(realRoot, expectedHead);
  const upstream = await upstreamSha(realRoot);
  if (upstream && await isAncestor(realRoot, head, upstream)) {
    throw new Error("annulation refusée : ce commit est déjà publié, utilise Revert");
  }
  await git(realRoot, ["rev-parse", "--verify", "HEAD^"]);
  await git(realRoot, ["reset", "--mixed", "HEAD^"]);
  return resolveHead(realRoot);
}

export async function resetToCommit(root, sha, mode = "mixed", expectedHead = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  await assertClean(realRoot);
  const head = await assertExpectedHead(realRoot, expectedHead);
  const commit = assertSha(sha);
  const resetMode = ["soft", "mixed", "hard"].includes(mode) ? mode : null;
  if (!resetMode) throw new Error("mode reset invalide");
  await git(realRoot, ["cat-file", "-e", `${commit}^{commit}`]);
  const upstream = await upstreamSha(realRoot);
  if (upstream && !(await isAncestor(realRoot, upstream, commit))) {
    throw new Error("reset refusé avant le dernier commit publié, utilise Revert");
  }
  const safetyRef = `refs/atelier/safety/reset-${Date.now()}`;
  await git(realRoot, ["update-ref", safetyRef, head]);
  await git(realRoot, ["reset", `--${resetMode}`, commit]);
  return { head: await resolveHead(realRoot), safetyRef };
}

export async function fetchAll(root) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const { stdout, stderr } = await git(realRoot, ["fetch", "--all", "--prune"]);
  return (stdout + stderr).trim();
}

export async function switchBranch(root, branch) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  if (!branch || typeof branch !== "string" || branch.includes("\0")) {
    throw new Error("branche requise");
  }
  const current = await status(realRoot);
  if (current.files.length > 0) {
    throw new Error("changement de branche refusé : l’arbre de travail doit être propre");
  }
  await git(realRoot, ["check-ref-format", "--branch", branch]);
  try {
    await git(realRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  } catch {
    throw new Error(`branche locale introuvable : ${branch}`);
  }
  if (current.branch === branch) return branch;
  await git(realRoot, ["switch", "--", branch]);
  return branch;
}

export async function createBranch(root, branch) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  if (!branch || typeof branch !== "string" || branch.includes("\0")) {
    throw new Error("branche requise");
  }
  await git(realRoot, ["check-ref-format", "--branch", branch]);
  try {
    await git(realRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    throw new Error(`branche locale déjà existante : ${branch}`);
  } catch (error) {
    if (String(error?.message ?? error).includes("déjà existante")) throw error;
  }
  await git(realRoot, ["switch", "-c", branch]);
  return branch;
}

export async function deleteBranch(root, branch) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  if (!branch || typeof branch !== "string" || branch.includes("\0")) {
    throw new Error("branche requise");
  }
  const current = await status(realRoot);
  await git(realRoot, ["check-ref-format", "--branch", branch]);
  if (current.branch === branch) {
    throw new Error("suppression de la branche active refusée");
  }
  try {
    await git(realRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  } catch {
    throw new Error(`branche locale introuvable : ${branch}`);
  }
  await git(realRoot, ["branch", "-d", "--", branch]);
  return branch;
}

export async function mergeBranch(root, branch) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  if (!branch || typeof branch !== "string" || branch.includes("\0")) {
    throw new Error("branche requise");
  }
  const current = await status(realRoot);
  if (current.files.length > 0) {
    throw new Error("fusion refusée : l’arbre de travail doit être propre");
  }
  await git(realRoot, ["check-ref-format", "--branch", branch]);
  if (current.branch === branch) {
    throw new Error("fusion de la branche active avec elle-même refusée");
  }
  try {
    await git(realRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  } catch {
    throw new Error(`branche locale introuvable : ${branch}`);
  }
  try {
    await git(realRoot, ["merge", "--no-edit", branch]);
  } catch (error) {
    const detail = [error?.stderr, error?.stdout]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n");
    throw new Error(detail || String(error?.message ?? error));
  }
  return branch;
}

/** ±lignes d'un seul fichier vs HEAD ; fichier non suivi = tout en ajouts. */
export async function numstat(root, filePath) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const rel = assertRelativePath(realRoot, filePath);
  const parse = (out) => {
    const line = String(out ?? "").split("\n").find(Boolean);
    if (!line) return null;
    const [a, d] = line.split("\t");
    return { add: Number(a) || 0, del: Number(d) || 0 };
  };
  if (await hasHead(realRoot)) {
    try {
      const { stdout } = await git(realRoot, ["diff", "--numstat", "HEAD", "--", rel]);
      const r = parse(stdout);
      if (r) return r;
      // fichier suivi mais sans modification → 0/0 (ne pas retomber sur no-index)
      await git(realRoot, ["ls-files", "--error-unmatch", "--", rel]);
      return { add: 0, del: 0 };
    } catch {}
  }
  try {
    // --no-index sort avec code 1 quand les fichiers diffèrent
    const { stdout } = await git(realRoot, ["diff", "--numstat", "--no-index", "--", "/dev/null", rel]);
    return parse(stdout) ?? { add: 0, del: 0 };
  } catch (e) {
    return parse(e.stdout) ?? { add: 0, del: 0 };
  }
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

export async function diffStaged(root, filePath = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const relPath = filePath == null ? null : assertRelativePath(realRoot, filePath);
  const args = ["diff", "--cached", "--no-ext-diff", "--no-color", "--binary", "--"];
  if (relPath) args.push(relPath);
  const { stdout } = await git(realRoot, args);
  return stdout;
}

function decodedDiffContent(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? "");
  if (bytes.includes(0)) return { text: "", binary: true };
  return { text: bytes.toString("utf8"), binary: false };
}

async function gitObject(root, spec) {
  try {
    const { stdout } = await git(root, ["show", spec], { encoding: "buffer" });
    return stdout;
  } catch {
    return Buffer.alloc(0);
  }
}

/** Exact documents consumed by CodeMirror's merge view for one file. */
export async function diffContents(root, filePath, { scope = "changes", base = null } = {}) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const rel = assertRelativePath(realRoot, filePath);
  if (base != null && !/^[0-9a-f]{4,64}$/i.test(String(base))) throw new Error("sha invalide");
  if (base) await git(realRoot, ["cat-file", "-e", `${base}^{commit}`]);

  const beforeBytes = base
    ? await gitObject(realRoot, `${base}:${rel}`)
    : await hasHead(realRoot) ? await gitObject(realRoot, `HEAD:${rel}`) : Buffer.alloc(0);
  let afterBytes;
  if (scope === "staged") afterBytes = await gitObject(realRoot, `:${rel}`);
  else {
    try { afterBytes = await readFile(resolve(realRoot, rel)); }
    catch { afterBytes = Buffer.alloc(0); }
  }
  const before = decodedDiffContent(beforeBytes);
  const after = decodedDiffContent(afterBytes);
  return { before: before.text, after: after.text, binary: before.binary || after.binary };
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
  return stageFiles(root, [filePath]);
}

export async function stageFiles(root, filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const relPaths = filePaths.map((filePath) => assertRelativePath(realRoot, filePath));
  await git(realRoot, ["add", "--", ...relPaths]);
}

export async function unstageFile(root, filePath) {
  return unstageFiles(root, [filePath]);
}

export async function unstageFiles(root, filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  const relPaths = filePaths.map((filePath) => assertRelativePath(realRoot, filePath));
  if (await hasHead(realRoot)) {
    await git(realRoot, ["restore", "--staged", "--", ...relPaths]);
  } else {
    await git(realRoot, ["rm", "--cached", "--ignore-unmatch", "--", ...relPaths]);
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
  if (!Array.isArray(files)) {
    throw new Error("sélection explicite requise : indexe les fichiers à committer");
  }
  // [] signifie explicitement « commiter l'index actuel sans toucher au worktree ».
  if (files.length) {
    const rels = files.map((f) => assertRelativePath(realRoot, f));
    await git(realRoot, ["add", "--", ...rels]);
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
    const sha = stdout.trim();
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error(`sha de snapshot invalide: ${sha}`);
    // ref durable : sans elle le commit est orphelin et git gc --prune le détruit
    await git(realRoot, ["update-ref", `refs/atelier/snapshots/${sha}`, sha], { env });
    return sha;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function restore(root, sha, paths = null) {
  const realRoot = confinedRoot(root);
  await ensureRepo(realRoot);
  if (!/^[0-9a-fA-F]{4,64}$/.test(String(sha ?? ""))) throw new Error("sha invalide");
  const scoped = Array.isArray(paths) && paths.length > 0;
  const dir = await mkdtemp(join(tmpdir(), "atelier-git-index-"));
  const indexFile = join(dir, "index");
  const env = tempGitEnv(indexFile);
  try {
    await git(realRoot, ["cat-file", "-e", `${sha}^{commit}`], { env });
    const { stdout: snapOut } = await git(realRoot, ["ls-tree", "-r", "--name-only", "-z", `${sha}^{tree}`], { env });
    const snapPaths = new Set(snapOut.split("\0").filter(Boolean));
    if (scoped) {
      // Restauration CIBLÉE (annulation d'un tour : fichiers du checkpoint) —
      // les créations d'autres sessions ailleurs dans le dépôt ne bloquent
      // plus l'annulation. Fichiers créés PAR le tour (absents du snapshot) :
      // laissés en place, jamais supprimés (même politique que le mode complet).
      for (const p of paths) assertRelativePath(realRoot, p);
      const targets = [...new Set(paths)].filter((p) => snapPaths.has(p));
      await git(realRoot, ["read-tree", `${sha}^{tree}`], { env });
      for (let i = 0; i < targets.length; i += 50)
        await git(realRoot, ["checkout-index", "-f", "--", ...targets.slice(i, i + 50)], { env });
      return;
    }
    // Mode complet (aucun périmètre connu) : chemins présents maintenant mais
    // absents du snapshot → les écraser ou les orpheliner serait destructif →
    // refus atomique AVANT toute écriture. (suivis/stagés via l'index réel +
    // untracked non ignorés, dédupliqués)
    const { stdout: nowOut } = await git(realRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    const nowPaths = [...new Set(nowOut.split("\0").filter(Boolean))];
    for (const p of nowPaths) assertRelativePath(realRoot, p);
    const newPaths = nowPaths.filter((p) => !snapPaths.has(p));
    if (newPaths.length) {
      const shown = newPaths.slice(0, 10).join(", ");
      throw new Error(
        `restauration refusée : ${newPaths.length} chemin(s) créé(s) après le snapshot ` +
        `(${shown}${newPaths.length > 10 ? ", …" : ""}). Rien n'a été modifié.`,
      );
    }
    await git(realRoot, ["read-tree", `${sha}^{tree}`], { env });
    // checkout-index restaure les fichiers connus du snapshot ; JAMAIS de clean —
    // aucun fichier créé après le snapshot n'est supprimé par l'annulation
    await git(realRoot, ["checkout-index", "-a", "-f"], { env });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
