// Éviction mémoire des fils inactifs (perf, session ouverte plusieurs jours).
// `events` (App.tsx ~538) garde en RAM le tableau complet d'événements de
// CHAQUE fil visité, pour toujours — un fil ouvert une fois puis oublié
// n'est jamais libéré. Cette fonction PURE décide quels fils peuvent perdre
// leur tableau : App.tsx supprime alors la clé de `events`, et la prochaine
// activation du fil recharge tout par getHistory + rejeu (mergeHarnessHistory
// fusionne sans écraser du direct, cf. App.tsx:2376-2384).
export function selectEvictableThreads(input: {
  events: Record<string, unknown[]>;
  activeId: string | null;
  mru: string[];
  running: Set<string>;
  // Sous-fil de l'agent actuellement ouvert dans le panneau Atelier (App.tsx
  // `openedAgent`) : ce n'est ni activeId (c'est le fil PARENT), ni forcément
  // dans la MRU, ni "running" une fois le tour terminé — sans cette entrée
  // il était évincé au premier changement de fil actif, et aucun chemin
  // getHistory ne le rechargeait (openAgentInAtelier n'en envoie pas),
  // laissant le panneau vide en permanence (revue finale lot 2 2026-08-28).
  openedAgentThreadId?: string | null;
}): string[] {
  const { events, activeId, mru, running, openedAgentThreadId } = input;
  const keep = new Set(mru);
  if (activeId) keep.add(activeId);
  if (openedAgentThreadId) keep.add(openedAgentThreadId);
  const evictable: string[] = [];
  for (const [threadId, threadEvents] of Object.entries(events)) {
    if (!threadEvents || threadEvents.length === 0) continue;
    if (keep.has(threadId)) continue;
    if (running.has(threadId)) continue;
    evictable.push(threadId);
  }
  return evictable;
}
