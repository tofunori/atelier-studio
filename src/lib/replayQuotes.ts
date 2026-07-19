// Reconstruction des pastilles de citation au REJEU d'un historique natif.
//
// En direct, une citation envoyée depuis un viewer (« chemin (p.LX-Y) : « … » »)
// ou depuis le chat (« Citation de la conversation : > … ») vit dans le prompt
// provider, et la bulle utilisateur l'affiche en chip (pastes). Les sessions
// natives ne conservent que le prompt complet : au rejeu, la citation
// réapparaissait en texte brut collé au message. Ce module re-découpe le texte
// d'un événement user rejoué en {pastes, texte tapé} — même rendu qu'en direct.

type ReplayUserEvent = {
  kind: string;
  text?: string;
  pastes?: { name: string; text?: string; lines?: number }[];
  kb?: unknown;
  [k: string]: unknown;
};

// première ligne d'une citation viewer : <chemin> (p.LX-Y|p.N) : « …
const QUOTE_HEAD = /^(.+?)\s*\((?:p\.)?(L?[\d:.,\-–]+|html)\)\s*:\s*«/;
const CONV_HEAD = "Citation de la conversation :";

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** Découpe le texte d'un user rejoué : blocs de citation en tête → pastes. */
export function splitReplayQuotes(text: string): { pastes: { name: string; text: string }[]; text: string } | null {
  const parts = String(text ?? "").split("\n\n");
  const pastes: { name: string; text: string }[] = [];
  let i = 0;
  while (i < parts.length) {
    let seg = parts[i];
    const head = QUOTE_HEAD.exec(seg.split("\n")[0] ?? "");
    if (head) {
      // absorber les paragraphes suivants tant que la citation « … » n'est pas refermée
      while (count(seg, "«") > count(seg, "»") && i + 1 < parts.length) {
        i += 1;
        seg += "\n\n" + parts[i];
      }
      const name = head[1].split("/").pop() || head[1];
      pastes.push({ name, text: seg });
      i += 1;
      continue;
    }
    if (seg.startsWith(CONV_HEAD)) {
      while (i + 1 < parts.length && parts[i + 1].startsWith(">")) {
        i += 1;
        seg += "\n\n" + parts[i];
      }
      pastes.push({ name: "Citation de la conversation", text: seg });
      i += 1;
      continue;
    }
    break;
  }
  if (!pastes.length) return null;
  return { pastes, text: parts.slice(i).join("\n\n").trim() };
}

/** Applique la reconstruction aux événements user d'un historique rejoué —
 *  jamais sur un événement qui porte déjà des pastes (bulle vivante/archivée). */
export function rebuildReplayQuotePastes<T extends ReplayUserEvent>(events: T[]): T[] {
  let changed = false;
  const next = events.map((e) => {
    if (e.kind !== "user" || !e.text || (Array.isArray(e.pastes) && e.pastes.length)) return e;
    const split = splitReplayQuotes(e.text);
    if (!split) return e;
    changed = true;
    return { ...e, text: split.text, pastes: split.pastes };
  });
  return changed ? next : events;
}
