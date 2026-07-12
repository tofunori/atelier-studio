/**
 * Redaction helpers — never ship secrets in logs/diagnostics (plan 034 I).
 */

const SECRETISH =
  /(token|password|secret|authorization|api[_-]?key|bearer\s+[a-z0-9._-]+)/i;

/** Hex blobs that look like tokens (32+ hex). */
const HEX_TOKEN = /\b[a-f0-9]{32,}\b/gi;

export function scrubSecretString(input: string): string {
  let s = input;
  s = s.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
  s = s.replace(
    /\b(token|password|secret|api[_-]?key)\s*[:=]\s*["']?[^\s,;]+/gi,
    "$1:[redacted]",
  );
  s = s.replace(HEX_TOKEN, "[redacted-hex]");
  return s;
}

export function looksSecretish(input: string): boolean {
  if (SECRETISH.test(input)) return true;
  if (HEX_TOKEN.test(input)) return true;
  HEX_TOKEN.lastIndex = 0;
  return false;
}

export function assertNoPlainToken(value: string | null | undefined, label: string): void {
  if (!value) return;
  if (value.length >= 32 && /^[a-f0-9]+$/i.test(value)) {
    throw new Error(`refusing to log plain token field: ${label}`);
  }
}
