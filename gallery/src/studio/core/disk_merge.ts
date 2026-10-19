/** jsdiff (`/.fig_thumbs/diff.min.js`), chargé par les pages d'éditeur. */
export interface JsDiffLike {
  structuredPatch(oldName: string, newName: string, oldText: string, newText: string,
    oldHeader?: string, newHeader?: string, options?: {context?: number}): unknown;
  applyPatch(source: string, patch: unknown, options?: {fuzzFactor?: number}): string | false;
}

/** Fusion à trois voies d'un changement disque sur un tampon modifié :
 * rejouer le delta disque (base → remote) sur le tampon local, contexte d'une
 * ligne sans tolérance — comme transplantAcceptedInto côté diff.
 * Chevauchement ou bibliothèque absente : `null`, le tampon reste intact et
 * l'appelant signale le conflit (docs/PIEGES_CONNUS.md §2). */
export function createDiskMerge(getDiff: () => JsDiffLike | undefined, path: string | null) {
  return (base: string, local: string, remote: string): string | null => {
    if (local === remote) return remote;
    if (remote === base) return local;
    const Diff = getDiff();
    if (!Diff) return null;
    try {
      const patch = Diff.structuredPatch(path || "", path || "", base, remote, undefined, undefined, {context: 1});
      const merged = Diff.applyPatch(local, patch, {fuzzFactor: 0});
      return typeof merged === "string" ? merged : null;
    } catch {
      return null;
    }
  };
}
