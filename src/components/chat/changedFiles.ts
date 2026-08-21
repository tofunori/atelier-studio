// Dérivation pure de la liste « fichiers modifiés » d'un tour : cumul des
// +/− par fichier depuis les événements `edit`, complétée par les chemins de
// `done.filesChanged` absents des edits. En production les providers
// n'envoient pas toujours de compte +/− (chemins nus) : add/del restent
// `null` tant qu'aucun événement n'a porté de nombre pour ce chemin, plutôt
// que d'afficher un +0/−0 mensonger. Tri par volume décroissant, null en
// dernier.
import type { AgentEvent } from "../../lib/ws";

export type ChangedFile = { path: string; name: string; add: number | null; del: number | null };

function cumulate(cur: number | null, v: number | null | undefined): number | null {
  if (v == null) return cur;
  return (cur ?? 0) + v;
}

export function deriveChangedFiles(
  turnEvents: AgentEvent[],
  done: Extract<AgentEvent, { kind: "done" }> | null,
): ChangedFile[] {
  const byPath = new Map<string, { add: number | null; del: number | null }>();
  for (const e of turnEvents) {
    if (e.kind !== "edit") continue;
    for (const f of e.files) {
      const cur = byPath.get(f.path) ?? { add: null, del: null };
      byPath.set(f.path, { add: cumulate(cur.add, f.add), del: cumulate(cur.del, f.del) });
    }
  }
  for (const path of done?.filesChanged ?? []) {
    if (!byPath.has(path)) byPath.set(path, { add: null, del: null });
  }
  const score = (c: { add: number | null; del: number | null }) =>
    c.add == null && c.del == null ? -1 : (c.add ?? 0) + (c.del ?? 0);
  return [...byPath.entries()]
    .map(([path, c]) => ({ path, name: path.split("/").pop() || path, ...c }))
    .sort((a, b) => score(b) - score(a));
}
