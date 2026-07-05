import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export function writeFileAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, filePath);
}

export class ThreadStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.threads = new Map();
    if (existsSync(filePath)) {
      for (const t of JSON.parse(readFileSync(filePath, "utf8"))) {
        this.threads.set(t.id, t);
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
    const t = {
      ...prev,
      ...patch,
      updatedAt: opts.preserveUpdatedAt && prev.updatedAt ? prev.updatedAt : new Date().toISOString(),
    };
    if (!t.createdAt) t.createdAt = t.updatedAt;
    this.threads.set(t.id, t);
    writeFileAtomic(this.filePath, JSON.stringify(this.list(), null, 2));
    return t;
  }
}
