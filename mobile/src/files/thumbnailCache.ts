/** Bounded in-memory blob URL cache for gallery thumbs. */

const MAX = 40;
const map = new Map<string, { url: string; etag?: string }>();

export function thumbCacheGet(fileId: string, etag?: string): string | null {
  const hit = map.get(fileId);
  if (!hit) return null;
  if (etag && hit.etag && hit.etag !== etag) {
    URL.revokeObjectURL(hit.url);
    map.delete(fileId);
    return null;
  }
  // LRU touch
  map.delete(fileId);
  map.set(fileId, hit);
  return hit.url;
}

export function thumbCacheSet(fileId: string, blob: Blob, etag?: string): string {
  const existing = map.get(fileId);
  if (existing) URL.revokeObjectURL(existing.url);
  if (map.size >= MAX) {
    const first = map.keys().next().value;
    if (first) {
      const old = map.get(first);
      if (old) URL.revokeObjectURL(old.url);
      map.delete(first);
    }
  }
  const url = URL.createObjectURL(blob);
  map.set(fileId, { url, etag });
  return url;
}

export function thumbCacheClear(): void {
  for (const v of map.values()) URL.revokeObjectURL(v.url);
  map.clear();
}
