// Ancrage durable des épingles de chapitre.
//
// PIÈGE (mesuré 2026-08-21, fil 449eed77) : une épingle identifiée par sa
// position dans le tableau d'événements ne survit pas au redémarrage. Le
// tableau n'est pas restauré, il est RECONSTRUIT en rejouant harness-history
// à travers le reducer — les tool_update et thinking s'y réinsèrent et tout
// glisse. Épinglé à l'index 116, le message se retrouvait à 127 ; l'index 116
// pointait alors sur un tool_update invisible et la marque disparaissait.
//
// La clé durable est `meta.eventId`, présent sur les messages du rejeu.
// L'index devient un simple cache de position, recalé par resolvePins à
// chaque changement du fil. Fonction pure, sans DOM ni React.

export type Pin = {
  index: number;
  label: string;
  anchor?: string;
  eventId?: string;
  color?: string;
  style?: string;
};

export type PinEvent = {
  kind?: string;
  text?: string;
  meta?: { eventId?: string } | Record<string, unknown>;
};

function eventIdOf(event: PinEvent | undefined): string | undefined {
  const id = (event?.meta as { eventId?: unknown } | undefined)?.eventId;
  return typeof id === "string" && id ? id : undefined;
}

/** Épingle posée sur `events[index]` : photographie son identifiant durable. */
export function createPin(events: PinEvent[], index: number, label: string): Pin {
  const eventId = eventIdOf(events[index]);
  return { index, label, anchor: label, ...(eventId ? { eventId } : {}) };
}

/** Position de l'événement portant cet identifiant, -1 si absent du fil. */
function indexOfEventId(events: PinEvent[], eventId: string): number {
  return events.findIndex((event) => eventIdOf(event) === eventId);
}

/** Position du premier événement dont le texte commence par l'ancre — repli
 * pour les épingles héritées, qui n'ont pas d'identifiant durable. */
function indexOfAnchor(events: PinEvent[], anchor: string): number {
  const needle = anchor.slice(0, 30).toLowerCase();
  if (!needle) return -1;
  return events.findIndex((event) => (event.text ?? "").toLowerCase().includes(needle));
}

/**
 * Recale les épingles sur le fil courant. Une épingle dont l'événement est
 * introuvable est rendue telle quelle (fil pas encore chargé, message effacé) :
 * on ne perd jamais une épingle faute de l'avoir retrouvée. Le tableau d'entrée
 * est rendu à l'identique quand rien ne bouge — même discipline d'identité
 * référentielle que le reste de la timeline, pour ne pas re-rendre pendant le
 * stream.
 *
 * L'ancre texte reste un repli même quand l'épingle a un eventId : les
 * historiques grok/codex/kimi rechargés depuis le transcript natif
 * (prefer_richer_dialogue côté Rust) reconstruisent les réponses assistant
 * SANS meta — l'eventId photographié en direct n'y existe plus, alors que le
 * texte, lui, est toujours là.
 */
export function resolvePins(events: PinEvent[], pins: Pin[]): Pin[] {
  if (!events.length || !pins.length) return pins;
  let changed = false;
  const next = pins.map((pin) => {
    let found = pin.eventId ? indexOfEventId(events, pin.eventId) : -1;
    if (found < 0) found = indexOfAnchor(events, pin.anchor ?? pin.label);
    if (found < 0) return pin;
    const eventId = pin.eventId ?? eventIdOf(events[found]);
    if (found === pin.index && eventId === pin.eventId) return pin;
    changed = true;
    return { ...pin, index: found, ...(eventId ? { eventId } : {}) };
  });
  return changed ? next : pins;
}
