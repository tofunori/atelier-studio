// Dérivation pure de la liste « fichiers modifiés » d'un tour : les ± par
// fichier viennent d'abord de `done.fileStats` (numstat Rust contre le
// snapshot du tour — la source qui fait AUTORITÉ, calculée au done pour tous
// les providers), complétés par les événements `edit` pour les chemins que le
// done ne couvre pas. add/del restent `null` quand personne n'a compté (ou
// pour un binaire), plutôt que d'afficher un +0/−0 mensonger. Tri par volume
// décroissant, null en dernier.
import type { AgentEvent } from "../../lib/ws";

export type ChangedFile = { path: string; name: string; add: number | null; del: number | null };

/** Les +/− d'un événement `edit` sont un numstat CONTRE HEAD, donc déjà le
 * total du fichier pour ce tour — pas le delta de cette édition. Additionner
 * trois éditions successives du même fichier triplerait le compte ; on garde
 * donc la dernière valeur connue (audit 2026-08-21). */
function latest(cur: number | null, v: number | null | undefined): number | null {
  return v == null ? cur : v;
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
      byPath.set(f.path, { add: latest(cur.add, f.add), del: latest(cur.del, f.del) });
    }
  }
  // Le numstat du done ÉCRASE les valeurs venues des edits : il est contre le
  // snapshot du tour, donc plus juste que tout ce qu'un provider a pu envoyer.
  for (const stat of done?.fileStats ?? []) {
    byPath.set(stat.path, { add: stat.add, del: stat.del });
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
