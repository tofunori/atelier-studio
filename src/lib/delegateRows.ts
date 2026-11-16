import type { AgentEvent } from "./ws";

/** Remise d'un agent lié telle que l'écrivait le serveur avant le
 *  2026-11-16 (sans `peerThreadId`) : on la reconnaît à son en-tête. */
const ENTETE_REMISE = "[Message d'un agent Atelier lié]";

export type DelegateRowSpot = {
  /** Fils délégués réunis sous cette rangée (même spécialiste), du plus
   *  ancien au plus récent : le dernier s'ouvre au clic. */
  peerIds: string[];
  /** Dernière rangée de ce spécialiste : elle suit son état vivant. */
  latest: boolean;
  /** Envoi de la tâche et retour du dernier rapport (horloge du chat). */
  startedAt?: number;
  endedAt?: number;
  /** Rapports rendus dans ce segment. */
  reports: number;
  /** Une carte de calcul de ce spécialiste attend « Lancer ». */
  needsYou: boolean;
};

export type DelegatePlan = {
  /** Index d'un `agent_message` ou d'un `compute_job` : la rangée qui s'y
   *  pose, ou `null` (rattaché à une rangée, rien à montrer). Les index
   *  absents gardent leur rendu habituel. */
  rows: Map<number, DelegateRowSpot | null>;
  /** Carte de calcul d'un spécialiste → index de sa rangée : elle se place
   *  juste dessous (variante A « Signature », 2026-11-16). */
  cards: Map<number, number>;
};

/** Ce que le fil principal montre des échanges avec ses fils délégués.
 *
 *  Une seule voix (2026-11-16) : un spécialiste n'est qu'une rangée, à
 *  l'envoi comme au retour ; seul le coordinateur parle. Une rangée par
 *  spécialiste entre deux messages de l'utilisateur (`groupOf` réunit deux
 *  envois au même spécialiste), posée au premier échange ; rapports et
 *  remises s'y rattachent sans rien afficher. Une carte de calcul proposée
 *  par le spécialiste et recopiée ici vient sous sa rangée. */
export function planDelegateRows(
  events: readonly AgentEvent[],
  delegateIds: ReadonlySet<string>,
  groupOf: (peerId: string) => string = (peerId) => peerId,
): DelegatePlan {
  const rows = new Map<number, DelegateRowSpot | null>();
  const cards = new Map<number, number>();
  if (delegateIds.size === 0) return { rows, cards };
  let shown = new Map<string, { spot: DelegateRowSpot; index: number }>();
  const last = new Map<string, DelegateRowSpot>();
  const place = (index: number, peer: string) => {
    const group = groupOf(peer);
    const found = shown.get(group);
    if (found) {
      if (!found.spot.peerIds.includes(peer)) found.spot.peerIds.push(peer);
      return { ...found, created: false };
    }
    const spot: DelegateRowSpot = { peerIds: [peer], latest: false, reports: 0, needsYou: false };
    shown.set(group, { spot, index });
    last.set(group, spot);
    rows.set(index, spot);
    return { spot, index, created: true };
  };
  events.forEach((event, index) => {
    if (event.kind === "user") {
      shown = new Map();
      return;
    }
    if (event.kind === "compute_job") {
      const peer = event.forThreadId;
      if (!peer || !delegateIds.has(peer)) return;
      const { spot, index: rowIndex, created } = place(index, peer);
      if (!created) cards.set(index, rowIndex);
      if (event.status === "proposed") spot.needsYou = true;
      return;
    }
    if (event.kind !== "agent_message") return;
    const peer = (event as { peerThreadId?: string }).peerThreadId;
    if (!peer) {
      // Ancienne remise d'un enfant au parent : son rapport, déjà rangé.
      if (event.direction === "received" && event.text?.startsWith(ENTETE_REMISE)
        && /\nRelation : enfant\n/.test(event.text)) rows.set(index, null);
      return;
    }
    if (!delegateIds.has(peer)) return;
    // Un message retenu ou en échec garde sa carte : elle porte l'action.
    if (event.status === "paused" || event.status === "failed") return;
    const ts = event.ts ?? (event as { meta?: { ts?: number } }).meta?.ts;
    const received = event.direction === "received";
    const isReport = received && event.messageKind === "report";
    const { spot, created } = place(index, peer);
    if (!created) rows.set(index, null);
    if (!received && spot.startedAt == null && ts != null) spot.startedAt = ts;
    if (isReport) spot.reports += 1;
    if (received && ts != null && (isReport || spot.endedAt == null)) spot.endedAt = ts;
  });
  for (const spot of last.values()) spot.latest = true;
  return { rows, cards };
}

/** Ligne de contexte qu'un coordinateur met en tête de tâche (« Projet :
 *  /Users/… », un chemin seul) : jamais une tâche à afficher. Le serveur la
 *  saute depuis le 2026-11-16 ; les fils plus anciens la portent encore. */
export function isContextLine(text: string): boolean {
  const t = text.trim();
  return /^(projet|project|dossier|folder|r[ée]pertoire|directory|working directory|cwd|racine|root|chemin|path|fichier|file)\s*:/i.test(t)
    || t.startsWith("/") || t.startsWith("~/");
}
