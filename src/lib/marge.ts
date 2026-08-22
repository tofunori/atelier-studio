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
  kind: "prompt" | "pin";
  label: string;
};

type MargeEvent = { kind?: string; text?: string };
type MargePin = { index: number; label: string };

const LABEL_MAX = 72;

/** Première ligne utile, espaces compactés, tronquée — un rail se lit d'un œil. */
export function margeLabel(text: string): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

export function deriveMargeEntries(events: MargeEvent[], pins: MargePin[]): MargeEntry[] {
  const pinByIndex = new Map(pins.map((pin) => [pin.index, pin]));
  const out: MargeEntry[] = [];
  events.forEach((event, index) => {
    const pin = pinByIndex.get(index);
    if (pin) {
      out.push({ index, kind: "pin", label: margeLabel(pin.label) });
      return;
    }
    if (event.kind === "user" && (event.text ?? "").trim()) {
      out.push({ index, kind: "prompt", label: margeLabel(event.text ?? "") });
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
