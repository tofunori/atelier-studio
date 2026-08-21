// Dérivation pure de la liste « fichiers modifiés » d'un tour : cumul des
// +/− par fichier depuis les événements `edit`, complétée par les chemins de
// `done.filesChanged` absents des edits (add/del à 0 — fichier renommé,
// supprimé ou modifié hors des edits capturés). Tri par volume décroissant.
import type { AgentEvent } from "../../lib/ws";

export type ChangedFile = { path: string; name: string; add: number; del: number };

export function deriveChangedFiles(
  turnEvents: AgentEvent[],
  done: Extract<AgentEvent, { kind: "done" }> | null,
): ChangedFile[] {
  const byPath = new Map<string, { add: number; del: number }>();
  for (const e of turnEvents) {
    if (e.kind !== "edit") continue;
    for (const f of e.files) {
      const cur = byPath.get(f.path) ?? { add: 0, del: 0 };
      byPath.set(f.path, { add: cur.add + (f.add ?? 0), del: cur.del + (f.del ?? 0) });
    }
  }
  for (const path of done?.filesChanged ?? []) {
    if (!byPath.has(path)) byPath.set(path, { add: 0, del: 0 });
  }
  return [...byPath.entries()]
    .map(([path, c]) => ({ path, name: path.split("/").pop() || path, ...c }))
    .sort((a, b) => (b.add + b.del) - (a.add + a.del));
}
