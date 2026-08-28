// Entrées de la marge annotée (design 2026-08-21) : une colonne à gauche du
// transcript, un signe par moment repérable du fil.
//
// Deux niveaux, un seul signe décliné :
//   - « prompt » : chaque question posée, donnée sans qu'on la demande ;
//   - « pin »    : ce qu'on a explicitement épinglé — nommé, accentué.
// Une question épinglée ne compte qu'une fois : elle monte en « pin ».
//
// Fonction pure, sans DOM ni React — la marge n'est qu'un consommateur de plus
// des événements déjà projetés, jamais une source de vérité.

export type MargeEntry = {
  index: number;
  kind: "prompt" | "pin" | "hl";
  label: string;
};

type MargeEvent = { kind?: string; text?: string; ts?: number };
type MargePin = { index: number; label: string };
type MargeMark = { text: string; kind?: string };

/** Mode d'affichage. « all » = chaque question (l'origine) ; « marks » = ne
 * garder que ce qui a été MARQUÉ — sur un fil long, la trame d'encoches ne se
 * lisait plus. Rien n'est perdu : « tout · N » rend la vue complète. */
export type MargeMode = "all" | "marks";

type MargeOptions = {
  mode?: MargeMode;
  resolveMark?: (events: MargeEvent[], passage: string) => number;
};

type MarkHit = { index: number; scannedTo: number };

/** Cache incrémental de résolution passage→index. Le fil ne fait que grandir
 * pendant un tour ; un passage déjà résolu se re-valide en un `includes` sur
 * SON événement, et un passage introuvable ne re-scanne que le texte nouveau.
 * Le dernier événement reste toujours re-scanné : c'est la bulle en cours,
 * son texte grandit. Reset au changement de fil ou au rejeu d'historique. */
export function createMarkIndexCache() {
  const hits = new Map<string, MarkHit>();
  return {
    reset() {
      hits.clear();
    },
    resolve(events: MargeEvent[], passage: string): number {
      const hit = hits.get(passage);
      if (
        hit && hit.index >= 0 && hit.index < events.length
        && (events[hit.index].text ?? "").includes(passage)
      ) return hit.index;
      const from = hit && hit.index < 0 ? Math.min(hit.scannedTo, Math.max(0, events.length - 1)) : 0;
      for (let i = from; i < events.length; i += 1) {
        if ((events[i].text ?? "").includes(passage)) {
          hits.set(passage, { index: i, scannedTo: i + 1 });
          return i;
        }
      }
      hits.set(passage, { index: -1, scannedTo: Math.max(0, events.length - 1) });
      return -1;
    },
  };
}

const LABEL_MAX = 72;
/** En dessous, la marge tient d'un œil : la plier n'apporterait rien. */
const FOLD_THRESHOLD = 25;

/** Le pli s'installe de lui-même sur un fil long ; les fils courts gardent
 * exactement le comportement d'avant (aucun réglage à gérer). */
export function margeMode(promptCount: number): MargeMode {
  return promptCount > FOLD_THRESHOLD ? "marks" : "all";
}

/** Première ligne utile, espaces compactés, tronquée — un rail se lit d'un œil. */
export function margeLabel(text: string): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

export function deriveMargeEntries(
  events: MargeEvent[],
  pins: MargePin[],
  marks: MargeMark[] = [],
  options: MargeOptions = {},
): MargeEntry[] {
  const mode = options.mode ?? "all";
  const resolveMark = options.resolveMark
    ?? ((evts: MargeEvent[], passage: string) =>
      evts.findIndex((event) => (event.text ?? "").includes(passage)));
  const pinByIndex = new Map(pins.map((pin) => [pin.index, pin]));
  // Un passage surligné se rattache au message qui le porte encore : le mark
  // ne connaît que son texte (localStorage), jamais un index.
  const marksByIndex = new Map<number, MargeMark[]>();
  for (const mark of marks) {
    const passage = (mark.text ?? "").trim();
    if (!passage) continue;
    const index = resolveMark(events, passage);
    if (index < 0) continue;
    marksByIndex.set(index, [...(marksByIndex.get(index) ?? []), mark]);
  }
  const out: MargeEntry[] = [];
  events.forEach((event, index) => {
    const pin = pinByIndex.get(index);
    if (pin) {
      out.push({ index, kind: "pin", label: margeLabel(pin.label) });
    } else if (mode === "all" && event.kind === "user" && (event.text ?? "").trim()) {
      out.push({ index, kind: "prompt", label: margeLabel(event.text ?? "") });
    }
    // l'encoche du passage vit SOUS l'épingle du message : deux granularités,
    // le message et le passage, jamais l'une à la place de l'autre
    for (const mark of marksByIndex.get(index) ?? []) {
      out.push({ index, kind: "hl", label: margeLabel(mark.text) });
    }
  });
  return out;
}

/** Deux dérivations qui décrivent la même marge : rendre l'ANCIENNE référence,
 * pour ne pas re-rendre le rail à chaque delta de stream. */
export function sameMargeEntries(a: MargeEntry[], b: MargeEntry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((entry, i) => (
    entry.index === b[i].index && entry.kind === b[i].kind && entry.label === b[i].label
  ));
}

/**
 * Entrée « où j'en suis » : la géométrie EST la vérité, aucun état à maintenir.
 * `tops` donne, pour les entrées dont la rangée est réellement rendue (le fil
 * est virtualisé — les autres n'existent pas dans le DOM), l'écart entre le
 * haut de la rangée et la LIGNE DE LECTURE (`slack` px sous le haut de la
 * fenêtre — le tiers de la fenêtre en pratique : mesuré 2026-08-23, le bord
 * haut désignait la question précédente pendant qu'on lisait la réponse
 * suivante, encore à mi-écran). L'entrée active est la dernière déjà passée
 * sous cette ligne ; si aucune ne l'a passée, la première visible. Au bas du
 * fil, c'est la dernière entrée, mesurable ou non : le lecteur est à la fin,
 * la barre aussi. Rend null quand rien n'est mesurable.
 */
export function activeMargeIndex(
  entries: MargeEntry[],
  tops: Record<number, number>,
  slack = 8,
  atBottom = false,
): number | null {
  if (atBottom && entries.length) return entries[entries.length - 1].index;
  let passed: number | null = null;
  let firstVisible: number | null = null;
  for (const entry of entries) {
    const top = tops[entry.index];
    if (top == null) continue;
    if (top <= slack) passed = entry.index;
    else if (firstVisible == null) firstVisible = entry.index;
  }
  return passed ?? firstVisible;
}
