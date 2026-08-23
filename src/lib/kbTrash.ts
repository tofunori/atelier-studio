// Suppression annulable de la base (redesign 2026-08-22).
//
// Supprimer une source doit être immédiat À L'ÉCRAN et réversible pendant
// quelques secondes — une modale de confirmation coûte plus cher qu'elle ne
// protège pour un geste qu'on répare en deux clics. Plutôt que d'inventer une
// corbeille côté backend, on RETARDE l'envoi : les ids partent dans ce store,
// la liste les masque aussitôt, et le `kbRemove` réel n'est émis qu'à
// l'expiration du délai (ou plus tôt si un autre lot arrive / la fenêtre se
// ferme). Annuler = ne jamais envoyer.
//
// Conséquence assumée : si l'app est tuée brutalement pendant la fenêtre, la
// suppression n'a pas lieu. C'est le sens sûr de l'erreur.

export const KB_TRASH_DELAY_MS = 8000;

export type KbTrashBatch = { ids: string[]; titles: string[] };

let pending: string[] = [];
let batch: KbTrashBatch | null = null;
let commit: ((ids: string[]) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

export function subscribeKbTrash(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ids masqués de la liste tant que la fenêtre d'annulation court. */
export function kbTrashSnapshot(): string[] {
  return pending;
}

/** Lot en attente (pour le bandeau « Annuler »), ou null. */
export function kbTrashBatchSnapshot(): KbTrashBatch | null {
  return batch;
}

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Envoie tout de suite le lot en attente — fin de la fenêtre d'annulation. */
export function flushKbRemove(): void {
  clearTimer();
  const ids = pending;
  const send = commit;
  pending = [];
  batch = null;
  commit = null;
  if (ids.length && send) send(ids);
  emit();
}

/** Annule le lot en attente : rien n'est jamais parti au backend. */
export function undoKbRemove(): void {
  clearTimer();
  pending = [];
  batch = null;
  commit = null;
  emit();
}

/**
 * Masque `ids` et programme leur suppression réelle. Un lot déjà en attente
 * est validé d'abord : deux fenêtres d'annulation simultanées donneraient un
 * bandeau qui ment sur ce qu'il annule.
 */
export function scheduleKbRemove(
  ids: string[],
  send: (ids: string[]) => void,
  opts: { titles?: string[]; delayMs?: number } = {},
): void {
  const clean = [...new Set(ids.filter(Boolean))];
  if (!clean.length) return;
  if (pending.length) flushKbRemove();
  pending = clean;
  batch = { ids: clean, titles: opts.titles ?? [] };
  commit = send;
  const delay = opts.delayMs ?? KB_TRASH_DELAY_MS;
  timer = setTimeout(flushKbRemove, delay);
  emit();
}

// test seulement : oublie le lot sans l'envoyer ni prévenir
export function resetKbTrashForTests(): void {
  clearTimer();
  pending = [];
  batch = null;
  commit = null;
}

if (typeof window !== "undefined") {
  // Fermeture/recharge de la fenêtre : le geste demandé était « supprimer ».
  // On l'honore au lieu de le perdre silencieusement.
  window.addEventListener("beforeunload", () => {
    if (pending.length) flushKbRemove();
  });
}
