import type { FileKind, GalleryFilter, GalleryItem } from "./types.ts";

export function kindFromExt(ext: string): FileKind {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "figure";
  if (["tex", "bib", "sty", "cls"].includes(e)) return "latex";
  if (["md", "txt", "csv", "json", "yaml", "yml", "toml"].includes(e)) return "data";
  if (["rs", "py", "r", "jl", "ts", "tsx", "js", "jsx", "css", "html"].includes(e)) return "code";
  return "other";
}

export function normalizeItem(raw: Record<string, unknown>): GalleryItem {
  const ext = String(raw.ext ?? "");
  const kind = (raw.kind as FileKind) || kindFromExt(ext);
  return {
    fileId: String(raw.fileId ?? ""),
    name: String(raw.name ?? "fichier"),
    size: Number(raw.size) || 0,
    ext,
    kind,
    modifiedAt: raw.modifiedAt == null ? null : Number(raw.modifiedAt),
    etag: raw.etag != null ? String(raw.etag) : undefined,
    // strip path from client model if present — never use for requests
  };
}

export function filterItems(items: GalleryItem[], filter: GalleryFilter): GalleryItem[] {
  if (filter === "all") return items;
  return items.filter((i) => i.kind === filter);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatDate(unixSec?: number | null): string {
  if (!unixSec) return "—";
  try {
    return new Date(unixSec * 1000).toLocaleDateString("fr-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Paginate in-memory (server returns up to 200). */
export function pageItems<T>(items: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}
