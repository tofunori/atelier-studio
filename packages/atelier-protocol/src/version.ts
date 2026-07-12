/** Wire protocol version for Atelier remote/mobile (plan 034 jalon B).
 * Distinct from HarnessEventMeta.schemaVersion (journal event schema). */
export const PROTOCOL_VERSION = 1 as const;

/** Inclusive range this codebase understands. */
export const MIN_PROTOCOL_VERSION = 1 as const;
export const MAX_PROTOCOL_VERSION = 1 as const;

export type ProtocolVersionStatus =
  | { ok: true; negotiated: number }
  | {
      ok: false;
      code: "protocol_version_unsupported";
      clientVersion: number;
      min: number;
      max: number;
      message: string;
    };

/**
 * Negotiate protocol version. Client proposes `clientVersion`; server accepts
 * only if it falls in [min, max]. Unknown future versions are refused explicitly
 * (never silently degraded).
 */
export function negotiateProtocolVersion(
  clientVersion: number,
  min: number = MIN_PROTOCOL_VERSION,
  max: number = MAX_PROTOCOL_VERSION,
): ProtocolVersionStatus {
  if (!Number.isInteger(clientVersion) || clientVersion < 1) {
    return {
      ok: false,
      code: "protocol_version_unsupported",
      clientVersion,
      min,
      max,
      message: `protocolVersion invalide (${clientVersion}); attendu entier ≥ 1 dans [${min}, ${max}]`,
    };
  }
  if (clientVersion < min || clientVersion > max) {
    const side = clientVersion < min ? "trop ancien" : "trop récent";
    return {
      ok: false,
      code: "protocol_version_unsupported",
      clientVersion,
      min,
      max,
      message: `client ${side} (protocolVersion=${clientVersion}); serveur accepte [${min}, ${max}]`,
    };
  }
  return { ok: true, negotiated: clientVersion };
}
