/** Chrono en secondes entières (« 44 s », « 3 min 47 s », « 1 h 5 min ») :
 * le SEUL format des durées qui défilent — tour, commande en cours, repli de
 * fin de tour. Même écriture que `fmtToolDur` au-delà de 10 s, pour que la
 * colonne de durée ne change jamais d'orthographe d'une rangée à l'autre. */
export function fmtClock(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const m = Math.floor(total / 60);
  if (m < 60) return total % 60 ? `${m} min ${total % 60} s` : `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
}
