/**
 * Exponential backoff with full jitter and ceiling (plan 034 F).
 * delay = random(0, min(cap, base * 2^attempt))
 */

export type BackoffOptions = {
  baseMs?: number;
  capMs?: number;
  /** Inject RNG for tests (0..1). */
  random?: () => number;
};

export function nextBackoffMs(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? 1000;
  const cap = opts.capMs ?? 30_000;
  const rnd = opts.random ?? Math.random;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt));
  return Math.floor(rnd() * exp);
}

export function resetAttempt(): number {
  return 0;
}

export function bumpAttempt(attempt: number, max = 20): number {
  return Math.min(max, attempt + 1);
}
