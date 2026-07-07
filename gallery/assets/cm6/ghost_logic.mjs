// Pure helpers for the CM6 ghost-suggestion UX. Deliberately free of
// CodeMirror imports so the logic is unit-testable with plain `node --test`
// (the CM6 bundle build copies this file next to latex_cm6_src.js).

/**
 * The user typed `inserted` exactly at the ghost anchor. If it matches the
 * start of the ghost text, return what remains of the ghost ("" when fully
 * consumed). Return null when it does not match (ghost must be recomputed).
 */
export function advanceGhost(ghostText, inserted) {
  if (!ghostText || !inserted) return null;
  if (!ghostText.startsWith(inserted)) return null;
  return ghostText.slice(inserted.length);
}

/** Tiny least-recently-used cache for context -> suggestion strings. */
export class LruCache {
  constructor(cap = 50) {
    this.cap = cap;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value); // Map iteration order = insertion order -> refresh
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.cap) this.map.delete(this.map.keys().next().value);
  }
}
