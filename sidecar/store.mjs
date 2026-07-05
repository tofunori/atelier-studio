import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const VALID_STATUSES = new Set(["idle", "running", "done"]);

export function writeFileAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, filePath);
}

function normalizeThread(raw) {
  if (!raw || typeof raw.id !== "string" || !raw.id) return null;
  const sessionId = typeof raw.sessionId === "string" && raw.sessionId ? raw.sessionId : null;
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : new Date().toISOString();
  return {
    ...raw,
    id: raw.id,
    projectRoot: typeof raw.projectRoot === "string" ? raw.projectRoot : "",
    provider: raw.provider === "codex" ? "codex" : "claude",
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : sessionId
          ? `Session ${sessionId.slice(0, 8)}`
          : "Sans titre",
    sessionId,
    status: VALID_STATUSES.has(raw.status) ? raw.status : "idle",
    updatedAt,
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : updatedAt,
  };
}

export class ThreadStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.threads = new Map();
    if (existsSync(filePath)) {
      for (const t of JSON.parse(readFileSync(filePath, "utf8"))) {
        const normalized = normalizeThread(t);
        if (normalized) this.threads.set(normalized.id, normalized);
      }
    }
  }
  list() {
    return [...this.threads.values()].sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  }
  get(id) {
    return this.threads.get(id);
  }
  delete(id) {
    this.threads.delete(id);
    writeFileAtomic(this.filePath, JSON.stringify(this.list(), null, 2));
  }
  upsert(patch, opts = {}) {
    const prev = this.threads.get(patch.id) ?? {};
    const merged = {
      ...prev,
      ...patch,
      updatedAt: opts.preserveUpdatedAt && prev.updatedAt ? prev.updatedAt : new Date().toISOString(),
    };
    const t = normalizeThread(merged);
    if (!t) throw new Error("thread id manquant");
    this.threads.set(t.id, t);
    writeFileAtomic(this.filePath, JSON.stringify(this.list(), null, 2));
    return t;
  }
}
