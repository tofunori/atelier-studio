type Limit = { used_percent?: number | null; window_minutes?: number; resets_at?: number | null } | null;
type LimitsData = { primary?: Limit; secondary?: Limit };
export type ProviderUsage =
  | { kind: "limits"; ts: number; stale_s?: number; label?: string | null; data: LimitsData }
  | { kind: "tokens"; ts: number; data: { input: number; output: number; turns: number } }
  | { kind: "ledger" }
  | null;
export type Usage = {
  providers?: Record<string, ProviderUsage>;
  models: Record<string, { turns: number; output: number }>;
};

// Retain messages received before the optional usage panel is first mounted.
let latestUsage: Usage | null = null;
export const readUsageSnapshot = (): Usage | null => latestUsage;
export function writeUsageSnapshot(usage: Usage): void { latestUsage = usage; }

/** Pire pourcentage toutes limites confondues — pour le point sur l'icône. */
export function worstOf(u: Usage | null): number | null {
  if (!u) return null;
  const vals: number[] = [];
  for (const p of Object.values(u.providers ?? {})) {
    if (p?.kind !== "limits") continue;
    if (p.data?.primary?.used_percent != null) vals.push(p.data.primary.used_percent);
    if (p.data?.secondary?.used_percent != null) vals.push(p.data.secondary.used_percent);
  }
  return vals.length ? Math.max(...vals) : null;
}
