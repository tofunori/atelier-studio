import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 2 * 1024 * 1024;
const ALLOWED_TEXT = [".out", ".err", ".log", ".txt", ".md", ".json", ".csv", ".tsv", ".yaml", ".yml", ".toml", ".sh", ".py", ".r", ".jl"];

export function profile(profileId = "narval") {
  if (profileId !== "narval") throw typed("invalid_profile", "profil Narval inconnu");
  const host = process.env.ATELIER_NARVAL_HOST || "narval-vpn";
  if (!/^[\w.@-]+$/.test(host)) throw typed("invalid_profile", "alias SSH Narval invalide");
  const gatewayValue = process.env.ATELIER_NARVAL_GATEWAY ?? "nas";
  const gateway = gatewayValue.trim() || null;
  if (gateway && !/^[\w.@-]+$/.test(gateway)) throw typed("invalid_profile", "passerelle SSH Narval invalide");
  const roots = (process.env.ATELIER_NARVAL_ROOTS || "/home,/project,/scratch,/lustre06,/lustre07")
    .split(",").map((root) => root.trim()).filter((root) => root.startsWith("/"));
  return { id: profileId, host, gateway, roots };
}

function typed(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function validPath(p, raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.includes("\0") || raw.split("/").includes("..")) {
    throw typed("invalid_path", "chemin distant absolu invalide");
  }
  const path = raw.replace(/\/+$/, "") || "/";
  if (!p.roots.some((root) => path === root || path.startsWith(`${root.replace(/\/+$/, "")}/`))) {
    throw typed("invalid_path", "chemin hors des racines Narval autorisées");
  }
  return path;
}

async function ssh(p, command) {
  try {
    const target = p.gateway || p.host;
    const remoteCommand = p.gateway
      ? `ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 -- ${shellQuote(p.host)} ${shellQuote(command)}`
      : command;
    const { stdout } = await execFileAsync("ssh", [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      "-o", "ServerAliveInterval=5",
      "-o", "ServerAliveCountMax=1",
      "--", target, remoteCommand,
    ], { timeout: 15_000, maxBuffer: MAX_BUFFER, encoding: "utf8" });
    return stdout;
  } catch (error) {
    const text = String(error?.stderr || error?.message || error).toLowerCase();
    if (error?.killed || error?.code === "ETIMEDOUT") throw typed("timeout", "Narval n'a pas répondu dans le délai imparti");
    if (text.includes("permission denied") || text.includes("publickey")) throw typed("auth", "authentification SSH Narval requise");
    if (text.includes("could not resolve") || text.includes("no route") || text.includes("connection refused")) {
      throw typed("unavailable", "Narval est inaccessible depuis cette machine");
    }
    throw typed("command_failed", String(error?.stderr || error?.message || error).trim());
  }
}

function normalizeState(value) {
  return String(value || "").trim().split(/[+ ]/)[0].toUpperCase();
}

function parseJob(fields, recent) {
  const id = String(fields[0] || "").trim();
  if (!/^\d+$/.test(id)) return null;
  return {
    id,
    name: String(fields[1] || "").trim(),
    state: normalizeState(fields[2]),
    elapsed: String(fields[3] || "").trim(),
    cpus: Number.parseInt(fields[4] || "0", 10) || 0,
    partition: String(fields[5] || "").trim(),
    reason: recent ? "" : String(fields[6] || "").trim(),
    workDir: String(fields[recent ? 8 : 7] || "").trim(),
    startedAt: recent ? String(fields[6] || "").trim() : "",
    endedAt: recent ? String(fields[7] || "").trim() : "",
  };
}

export function parseSnapshot(profileId, output) {
  const [activeRaw = "", recentRaw = ""] = String(output).split("__ATELIER_RECENT__\n", 2);
  const active = activeRaw.split("\n").map((line) => parseJob(line.split("|"), false)).filter(Boolean);
  const activeIds = new Set(active.map((job) => job.id));
  const seen = new Set();
  const recent = recentRaw.split("\n")
    .map((line) => parseJob(line.split("|"), true))
    .filter((job) => job && !activeIds.has(job.id) && !seen.has(job.id) && seen.add(job.id))
    .slice(0, 50);
  return { profile: profileId, active, recent, observedAtMs: Date.now() };
}

export async function status(profileId = "narval") {
  const p = profile(profileId);
  const output = await ssh(p, "printf '%s\\n' \"$HOME\"; if command -v squeue >/dev/null 2>&1; then printf 'slurm=1\\n'; else printf 'slurm=0\\n'; fi");
  const lines = output.split("\n");
  const home = lines[0]?.trim() || "";
  const roots = home.startsWith("/") && !p.roots.some((root) => home.startsWith(root)) ? [home, ...p.roots] : p.roots;
  return { profile: p.id, host: p.host, gateway: p.gateway, home, roots, connected: true, slurmAvailable: lines.includes("slurm=1"), observedAtMs: Date.now() };
}

export async function snapshot(profileId = "narval") {
  const p = profile(profileId);
  const output = await ssh(p, "squeue --noheader --me --format='%i|%j|%T|%M|%C|%P|%R|%Z'; printf '__ATELIER_RECENT__\\n'; sacct -X --allocations --starttime now-7days --user=\"$USER\" --noheader --parsable2 --format=JobIDRaw,JobName,State,Elapsed,AllocCPUS,Partition,Start,End,WorkDir 2>/dev/null || true");
  return parseSnapshot(profileId, output);
}

export function parseDirectory(path, output) {
  return String(output).split("\n").flatMap((line) => {
    const [name, rawKind, rawSize, rawModified] = line.split("\x1f");
    if (!name) return [];
    const kind = rawKind === "d" ? "directory" : rawKind === "l" ? "symlink" : "file";
    return [{ name, path: `${path.replace(/\/$/, "")}/${name}`, kind, size: Number(rawSize) || 0, modifiedAt: Number(rawModified) || 0 }];
  }).slice(0, 500).sort((a, b) => (b.kind === "directory") - (a.kind === "directory") || a.name.localeCompare(b.name));
}

export async function listDirectory(profileId, rawPath) {
  const p = profile(profileId);
  const path = validPath(p, rawPath);
  const output = await ssh(p, `find ${shellQuote(path)} -mindepth 1 -maxdepth 1 -printf '%f\\037%y\\037%s\\037%T@\\n' 2>/dev/null | head -n 500`);
  return parseDirectory(path, output);
}

export function parseJobDetail(output) {
  const fields = String(output).split("\n").find((line) => line.trim())?.split("|") || [];
  if (!/^\d+$/.test(fields[0] || "")) return null;
  const id = fields[0];
  const expandPath = (value) => String(value || "").replaceAll("%j", id).replaceAll("%A", id);
  return {
    job: {
      id: fields[0], name: fields[1] || "", state: normalizeState(fields[2]), elapsed: fields[3] || "",
      cpus: Number.parseInt(fields[4] || "0", 10) || 0, partition: fields[6] || "", reason: "",
      workDir: fields[10] || "", startedAt: fields[8] || "", endedAt: fields[9] || "",
    },
    requestedMemory: fields[5] || "", submittedAt: fields[7] || "",
    stdoutPath: expandPath(fields[11]), stderrPath: expandPath(fields[12]),
  };
}

export async function inspectJob(profileId, jobId) {
  if (!/^\d+$/.test(String(jobId))) throw typed("invalid_job", "identifiant Slurm invalide");
  const p = profile(profileId);
  const output = await ssh(p, `sacct -X -j ${jobId} --allocations --noheader --parsable2 --format=JobIDRaw,JobName,State,Elapsed,AllocCPUS,ReqMem,Partition,Submit,Start,End,WorkDir,StdOut,StdErr | head -n 1`);
  const detail = parseJobDetail(output);
  if (!detail) throw typed("not_found", "job Slurm introuvable");
  return detail;
}

export async function readText(profileId, rawPath, tailLines = 400) {
  const p = profile(profileId);
  const path = validPath(p, rawPath);
  if (!ALLOWED_TEXT.some((extension) => path.toLowerCase().endsWith(extension))) {
    throw typed("unsupported_file", "aperçu limité aux fichiers texte");
  }
  const lines = Math.max(1, Math.min(2_000, Number(tailLines) || 400));
  const content = await ssh(p, `tail -n ${lines} -- ${shellQuote(path)}`);
  return { path, content, truncated: content.length >= MAX_BUFFER, observedAtMs: Date.now() };
}

export function publicError(error) {
  return { code: String(error?.code || "internal"), message: String(error?.message || error) };
}
