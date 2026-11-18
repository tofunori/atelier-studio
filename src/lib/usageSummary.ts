type Limit = { used_percent?: number | null; window_minutes?: number; resets_at?: number | null } | null;
type LimitsData = { primary?: Limit; secondary?: Limit };
export type ProviderUsage =
  | { kind: "limits"; ts: number; stale_s?: number; label?: string | null; data: LimitsData }
  | {
      kind: "tokens";
      ts: number;
      data: { input: number; output: number; turns: number; cost?: number | null; period?: "today" | "7d" };
    }
  | { kind: "ledger" }
  | null;
export type Usage = {
  providers?: Record<string, ProviderUsage>;
  models: Record<string, { turns: number; output: number }>;
};

const PROVIDER_NAMES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
  kimi: "Kimi",
  opencode: "OpenCode",
};

// Retain messages received before the optional usage panel is first mounted.
let latestUsage: Usage | null = null;
const usageListeners = new Set<() => void>();
export const readUsageSnapshot = (): Usage | null => latestUsage;
export function writeUsageSnapshot(usage: Usage): void {
  latestUsage = usage;
  usageListeners.forEach((listener) => listener());
}
/** Abonnement (useSyncExternalStore) : le pied de la colonne suit le quota. */
export function subscribeUsage(listener: () => void): () => void {
  usageListeners.add(listener);
  return () => { usageListeners.delete(listener); };
}

export function worstDetailOf(
  u: Usage | null,
): { provider: string; name: string; pct: number } | null {
  if (!u) return null;
  let best: { provider: string; name: string; pct: number } | null = null;
  for (const [id, p] of Object.entries(u.providers ?? {})) {
    if (p?.kind !== "limits") continue;
    const candidates = [p.data?.primary?.used_percent, p.data?.secondary?.used_percent].filter(
      (v): v is number => v != null,
    );
    if (!candidates.length) continue;
    const pct = Math.max(...candidates);
    if (!best || pct > best.pct) {
      best = { provider: id, name: PROVIDER_NAMES[id] ?? id, pct };
    }
  }
  return best;
}

export function openCodeSummaryOf(
  u: Usage | null,
): { tokens: number; turns: number; cost: number } | null {
  const oc = u?.providers?.opencode;
  if (oc?.kind !== "tokens") return null;
  const tokens = (oc.data.input ?? 0) + (oc.data.output ?? 0);
  if (tokens <= 0 && (oc.data.turns ?? 0) <= 0) return null;
  return { tokens, turns: oc.data.turns ?? 0, cost: oc.data.cost ?? 0 };
}

/** Pire pourcentage toutes limites confondues — pour le point sur l'icône. */
export function worstOf(u: Usage | null): number | null {
  return worstDetailOf(u)?.pct ?? null;
}
