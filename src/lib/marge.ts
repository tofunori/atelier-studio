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
  kind: "prompt" | "pin" | "hl" | "chapter";
  label: string;
  /** chapitre seulement : nombre de questions posées dedans. */
  count?: number;
};

type MargeEvent = { kind?: string; text?: string; ts?: number };
type MargePin = { index: number; label: string };
type MargeMark = { text: string; kind?: string };

/** Mode d'affichage de la marge. « all » = tout (l'origine) ; « marks » = ne
 * garder que ce qui a été MARQUÉ, les chapitres tenant lieu de repères pour
 * les séances où rien ne l'a été. */
export type MargeMode = "all" | "marks";

type MargeOptions = { now?: number; mode?: MargeMode; gapMs?: number };

const LABEL_MAX = 72;
/** Une coupure de plus de 20 min sépare deux séances de travail (mesuré sur
 * les fils réels : les pauses réelles dépassent largement ce seuil, les
 * enchaînements d'un même raisonnement restent bien en dessous). */
const CHAPTER_GAP_MS = 20 * 60_000;
/** En dessous, la marge tient d'un œil : la plier n'apporterait rien. */
const FOLD_THRESHOLD = 25;

/** Le pli s'installe de lui-même sur un fil long ; les fils courts gardent
 * exactement le comportement d'avant (aucun réglage à gérer). */
export function margeMode(promptCount: number): MargeMode {
  return promptCount > FOLD_THRESHOLD ? "marks" : "all";
}

/** Nom d'un chapitre : le MOMENT, pas la date complète — un rail se lit d'un
 * œil, « 21 août · 16 h » suffit à situer, « 2026-08-21T16:04 » non. */
export function chapterLabel(ts: number, now: number): string {
  const date = new Date(ts);
  // « 0 h » et « 12 h » se disent minuit et midi — un rail se lit comme on parle.
  const h = date.getHours();
  const heure = h === 0 ? "minuit" : h === 12 ? "midi" : `${h} h`;
  if (now - ts < 45 * 60_000) return "Maintenant";
  const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now);
  const aujourdhui = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (jour === aujourdhui) return heure;
  if (aujourdhui - jour === 86_400_000) return `Hier · ${heure}`;
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${date.getDate()} ${MOIS[date.getMonth()]} · ${heure}`;
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
  const gapMs = options.gapMs ?? CHAPTER_GAP_MS;
  const now = options.now ?? Date.now();
  const pinByIndex = new Map(pins.map((pin) => [pin.index, pin]));
  // Un passage surligné se rattache au message qui le porte encore : le mark
  // ne connaît que son texte (localStorage), jamais un index.
  const marksByIndex = new Map<number, MargeMark[]>();
  for (const mark of marks) {
    const passage = (mark.text ?? "").trim();
    if (!passage) continue;
    const index = events.findIndex((event) => (event.text ?? "").includes(passage));
    if (index < 0) continue;
    marksByIndex.set(index, [...(marksByIndex.get(index) ?? []), mark]);
  }
  // Chapitres : une séance s'ouvre à la première question, puis à chaque
  // coupure. Sans horodatage (fil rejoué d'un vieux journal), aucun chapitre
  // n'est inventé — la marge retombe simplement sur son comportement d'avant.
  const chapterAt = new Map<number, number>();  // index d'ouverture → ts
  const chapterCount = new Map<number, number>();
  let ouverture: number | null = null;
  let precedent: number | null = null;
  events.forEach((event, index) => {
    if (event.kind !== "user" || !(event.text ?? "").trim()) return;
    const ts = typeof event.ts === "number" ? event.ts : null;
    if (ts == null) return;
    if (ouverture == null || (precedent != null && ts - precedent > gapMs)) {
      ouverture = index;
      chapterAt.set(index, ts);
      chapterCount.set(index, 0);
    }
    chapterCount.set(ouverture, (chapterCount.get(ouverture) ?? 0) + 1);
    precedent = ts;
  });

  const out: MargeEntry[] = [];
  events.forEach((event, index) => {
    const chapterTs = chapterAt.get(index);
    if (chapterTs != null) {
      out.push({
        index,
        kind: "chapter",
        label: chapterLabel(chapterTs, now),
        count: chapterCount.get(index) ?? 0,
      });
    }
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
    && entry.count === b[i].count
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
