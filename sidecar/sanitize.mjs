const SENSITIVE_KEY = /(?:^|[_-])(api[_-]?key|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|credential|cookie|session)(?:$|[_-])/i;

function stripUrlSecrets(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return raw;
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.replace(/[?#].*$/, "");
  }
}

/** Retire credentials et query/fragment des chaînes destinées à l'UI/journal. */
export function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => stripUrlSecrets(url))
    .replace(/(authorization\s*:\s*(?:bearer|basic)\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[REDACTED]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|credential)\s*[:=]\s*[^\s,;"']+/gi, "$1=[REDACTED]");
}

/** Caviardage récursif des inputs d'outils sans muter l'objet provider. */
export function sanitizeSensitiveValue(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === "string") return redactSensitiveText(value);
  if (value == null || typeof value !== "object") return value;
  if (depth >= 10) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitiveValue(item, seen, depth + 1));
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key)
      ? "[REDACTED]"
      : sanitizeSensitiveValue(item, seen, depth + 1);
  }
  return out;
}

export function jsonSafe(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function sanitizeAndBoundInput(input, maxLength) {
  if (input == null) return input;
  const originalLength = jsonSafe(input).length;
  const sanitized = sanitizeSensitiveValue(input);
  const safe = jsonSafe(sanitized);
  if (safe.length <= maxLength) return sanitized;
  return {
    truncated: true,
    preview: safe.slice(0, maxLength),
    inputLength: originalLength,
  };
}
