import type { AgentEvent } from "./ws";

/** Remise d'un agent lié telle que l'écrivait le serveur avant le
 *  2026-11-16 (sans `peerThreadId`) : on la reconnaît à son en-tête. */
const ENTETE_REMISE = "[Message d'un agent Atelier lié]";

export type DelegateRowSpot = {
  peerId: string;
  /** Dernière rangée de ce fil délégué : elle suit son état vivant. */
  latest: boolean;
  /** Envoi de la tâche et retour du rapport (horloge du chat), si connus. */
  startedAt?: number;
  endedAt?: number;
};

/** Ce que le fil principal montre de chaque `agent_message` échangé avec un
 *  fil délégué : une rangée (`DelegateRowSpot`) ou rien (`null`). Les index
 *  absents gardent leur rendu habituel (bulle d'agent lié, pause, échec).
 *
 *  Variante B « une seule voix » (2026-11-16) : le spécialiste n'est qu'une
 *  rangée, à l'envoi comme au retour ; seul le coordinateur parle. Une
 *  rangée par fil délégué entre deux messages de l'utilisateur, posée au
 *  premier échange (l'envoi de la tâche) ; le rapport et la remise qui
 *  réveille le coordinateur s'y rattachent sans rien afficher. */
export function planDelegateRows(
  events: readonly AgentEvent[],
  delegateIds: ReadonlySet<string>,
): Map<number, DelegateRowSpot | null> {
  const plan = new Map<number, DelegateRowSpot | null>();
  if (delegateIds.size === 0) return plan;
  let shown = new Map<string, DelegateRowSpot>();
  const last = new Map<string, DelegateRowSpot>();
  events.forEach((event, index) => {
    if (event.kind === "user") {
      shown = new Map();
      return;
    }
    if (event.kind !== "agent_message") return;
    const peer = (event as { peerThreadId?: string }).peerThreadId;
    if (!peer) {
      // Ancienne remise d'un enfant au parent : son rapport, déjà rangé.
      if (event.direction === "received" && event.text?.startsWith(ENTETE_REMISE)
        && /\nRelation : enfant\n/.test(event.text)) plan.set(index, null);
      return;
    }
    if (!delegateIds.has(peer)) return;
    // Un message retenu ou en échec garde sa carte : elle porte l'action.
    if (event.status === "paused" || event.status === "failed") return;
    const ts = event.ts ?? (event as { meta?: { ts?: number } }).meta?.ts;
    const isReport = event.direction === "received";
    const spot = shown.get(peer);
    if (spot) {
      plan.set(index, null);
      if (isReport && event.messageKind === "report" && ts != null) spot.endedAt = ts;
      return;
    }
    const created: DelegateRowSpot = { peerId: peer, latest: false };
    if (isReport) created.endedAt = ts;
    else created.startedAt = ts;
    plan.set(index, created);
    shown.set(peer, created);
    last.set(peer, created);
  });
  for (const spot of last.values()) spot.latest = true;
  return plan;
}
