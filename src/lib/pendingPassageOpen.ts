// Filet de rattrapage — premier clic perdu (revue finale de branche, panneau
// Preuves) : `kb-open-gbrain-passage` / `chat-open-zotero-passage` partent de
// façon SYNCHRONE (md.tsx, openGbrainPassage/openZoteroPassage), au moment
// même où App.tsx bascule la surface cible. Mais KbSurface/BiblioSurface ne
// sont montés qu'au rendu SUIVANT (changement de layout, remontage
// d'AtelierPane…) : leur listener n'existe pas encore quand l'event part, le
// premier clic est donc perdu — un second clic identique fonctionne, lui,
// puisque le listener est alors monté.
//
// Contrat : les émetteurs (md.tsx) posent une entrée ICI, AVANT de dispatcher
// l'événement. Un listener DÉJÀ monté qui traite l'événement en direct efface
// l'entrée (`clearPendingPassageOpen`) pour qu'elle ne soit pas rejouée à un
// remontage futur sans rapport. Un listener qui vient de MONTER consomme une
// entrée fraîche (`consumePendingPassageOpen`) et la traite comme s'il venait
// de recevoir l'événement lui-même.
export type PendingPassageOpen = {
  kind: "zotero" | "gbrain";
  detail: unknown;
  ts: number;
};

let pending: PendingPassageOpen | null = null;

export function setPendingPassageOpen(entry: PendingPassageOpen): void {
  pending = entry;
}

/** Efface l'entrée en attente sans la retourner — appelé par un listener déjà
 * monté qui vient de traiter l'événement en direct. */
export function clearPendingPassageOpen(): void {
  pending = null;
}

/** Consomme (efface) l'entrée en attente si elle existe et n'est pas périmée
 * (> `maxAgeMs`). `null` si absente ou périmée — une entrée périmée est elle
 * aussi effacée : elle ne doit jamais ressurgir plus tard. */
export function consumePendingPassageOpen(maxAgeMs = 5000): PendingPassageOpen | null {
  const entry = pending;
  pending = null;
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry;
}

// test seulement : remet le module à zéro entre deux cas
export function resetPendingPassageOpenForTests(): void {
  pending = null;
}
