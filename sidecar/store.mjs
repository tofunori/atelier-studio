import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

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
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.list(), null, 2));
  }
  upsert(patch) {
    const prev = this.threads.get(patch.id) ?? {};
    const t = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    this.threads.set(t.id, t);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.list(), null, 2));
    return t;
  }
}
