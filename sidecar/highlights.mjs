import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import { writeFileAtomic } from "./store.mjs";

// Store durable des fiches « Surlignés » (lot 2) : chaque fiche est une
// photographie autonome prise à la création (passage + contexte + métadonnées
// du thread au moment du clic) — elle survit à la suppression du chat qui l'a
// vue naître. Le sidecar est seul responsable de l'id et de createdAt.

const VALID_KINDS = new Set(["hl", "ul"]);

function str(v) {
  return typeof v === "string" ? v : "";
}

function normalizeHighlight(raw) {
  if (!raw || typeof raw.id !== "string" || !raw.id) return null;
  const text = str(raw.text).trim();
  if (!text) return null;
  return {
    id: raw.id,
    text,
    context: str(raw.context),
    kind: VALID_KINDS.has(raw.kind) ? raw.kind : "hl",
    projectRoot: str(raw.projectRoot),
    projectName: str(raw.projectName),
    threadId: str(raw.threadId),
    threadTitle: str(raw.threadTitle),
    provider: str(raw.provider),
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

export class HighlightStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.items = new Map();
    if (existsSync(filePath)) {
      try {
        for (const h of JSON.parse(readFileSync(filePath, "utf8"))) {
          const normalized = normalizeHighlight(h);
          if (normalized) this.items.set(normalized.id, normalized);
        }
      } catch {}
    }
  }
  list() {
    return [...this.items.values()].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }
  add(entry) {
    const h = normalizeHighlight({ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    if (!h) throw new Error("surlignage invalide (texte requis)");
    this.items.set(h.id, h);
    writeFileAtomic(this.filePath, JSON.stringify(this.list(), null, 2));
    return h;
  }
  remove(id) {
    const existed = this.items.delete(id);
    if (existed) writeFileAtomic(this.filePath, JSON.stringify(this.list(), null, 2));
    return existed;
  }
}
