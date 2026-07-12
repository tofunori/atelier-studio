import { HARNESS_META_REQUIRED, type HarnessEventMeta } from "./meta.ts";
import type { ClientHelloMessage, ProtocolErrorMessage, WireAgentEvent } from "./envelopes.ts";
import { protocolError } from "./envelopes.ts";
import { negotiateProtocolVersion } from "./version.ts";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProtocolErrorMessage };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse JSON text; invalid JSON → invalid_payload. */
export function parseJsonMessage(raw: string): ParseResult<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: protocolError("invalid_payload", "JSON invalide") };
  }
  if (!isRecord(value)) {
    return { ok: false, error: protocolError("invalid_payload", "message doit être un objet") };
  }
  if (typeof value.type !== "string" || !value.type) {
    return {
      ok: false,
      error: protocolError("missing_field", "champ obligatoire absent: type", {
        // keep structured without leaking payload
      }),
    };
  }
  return { ok: true, value };
}

/**
 * Validate clientHello and negotiate protocolVersion.
 * Unknown extra fields are ignored (forward compatibility).
 */
export function validateClientHello(msg: Record<string, unknown>): ParseResult<ClientHelloMessage> {
  if (msg.type !== "clientHello") {
    return { ok: false, error: protocolError("invalid_payload", "type clientHello attendu") };
  }
  if (typeof msg.protocolVersion !== "number") {
    return {
      ok: false,
      error: protocolError("missing_field", "champ obligatoire absent: protocolVersion"),
    };
  }
  if (typeof msg.clientInstanceId !== "string" || !msg.clientInstanceId) {
    return {
      ok: false,
      error: protocolError("missing_field", "champ obligatoire absent: clientInstanceId"),
    };
  }
  const neg = negotiateProtocolVersion(msg.protocolVersion);
  if (!neg.ok) {
    return {
      ok: false,
      error: protocolError("protocol_version_unsupported", neg.message, {
        minProtocolVersion: neg.min,
        maxProtocolVersion: neg.max,
        clientVersion: neg.clientVersion,
      }),
    };
  }
  const hello: ClientHelloMessage = {
    type: "clientHello",
    protocolVersion: neg.negotiated,
    clientInstanceId: msg.clientInstanceId,
  };
  if (
    msg.clientKind === "desktop" ||
    msg.clientKind === "mobile" ||
    msg.clientKind === "fixture" ||
    msg.clientKind === "test"
  ) {
    hello.clientKind = msg.clientKind;
  }
  return { ok: true, value: hello };
}

const ORIGINS = new Set(["provider", "atelier", "legacy-import"]);

/**
 * Validate harness meta. Required fields must be present and well-typed.
 * Unknown extra fields on meta are tolerated (not stripped here).
 */
export function validateHarnessMeta(raw: unknown): ParseResult<HarnessEventMeta> {
  if (!isRecord(raw)) {
    return { ok: false, error: protocolError("missing_field", "champ obligatoire absent: meta") };
  }
  for (const key of HARNESS_META_REQUIRED) {
    if (!(key in raw) || raw[key] === undefined || raw[key] === null) {
      return {
        ok: false,
        error: protocolError("missing_field", `champ obligatoire absent: meta.${key}`),
      };
    }
  }
  if (raw.schemaVersion !== 1) {
    return {
      ok: false,
      error: protocolError(
        "invalid_payload",
        `meta.schemaVersion non supporté (${String(raw.schemaVersion)}); attendu 1`,
      ),
    };
  }
  if (typeof raw.eventId !== "string" || !raw.eventId) {
    return { ok: false, error: protocolError("invalid_payload", "meta.eventId doit être une string non vide") };
  }
  if (typeof raw.provider !== "string" || !raw.provider) {
    return { ok: false, error: protocolError("invalid_payload", "meta.provider invalide") };
  }
  if (typeof raw.threadId !== "string" || !raw.threadId) {
    return { ok: false, error: protocolError("invalid_payload", "meta.threadId invalide") };
  }
  if (typeof raw.turnId !== "string" || !raw.turnId) {
    return { ok: false, error: protocolError("invalid_payload", "meta.turnId invalide") };
  }
  if (typeof raw.sequence !== "number" || !Number.isFinite(raw.sequence) || raw.sequence < 1) {
    return {
      ok: false,
      error: protocolError("invalid_payload", "meta.sequence doit être un nombre ≥ 1"),
    };
  }
  if (typeof raw.ts !== "number" || !Number.isFinite(raw.ts)) {
    return { ok: false, error: protocolError("invalid_payload", "meta.ts doit être un nombre") };
  }
  if (typeof raw.durable !== "boolean") {
    return { ok: false, error: protocolError("invalid_payload", "meta.durable doit être un booléen") };
  }
  if (typeof raw.origin !== "string" || !ORIGINS.has(raw.origin)) {
    return {
      ok: false,
      error: protocolError("invalid_payload", "meta.origin invalide"),
    };
  }

  const meta: HarnessEventMeta = {
    schemaVersion: 1,
    eventId: raw.eventId,
    provider: raw.provider,
    threadId: raw.threadId,
    turnId: raw.turnId,
    sequence: raw.sequence,
    ts: raw.ts,
    durable: raw.durable,
    origin: raw.origin as HarnessEventMeta["origin"],
  };
  if (typeof raw.messageId === "string") meta.messageId = raw.messageId;
  if (typeof raw.itemId === "string") meta.itemId = raw.itemId;
  if (typeof raw.nativeThreadId === "string") meta.nativeThreadId = raw.nativeThreadId;
  if (typeof raw.nativeTurnId === "string") meta.nativeTurnId = raw.nativeTurnId;
  return { ok: true, value: meta };
}

/**
 * Validate a wire agent event that claims harness meta (durable journal event).
 * Events without meta are accepted as legacy (mobile may ignore or synth).
 * Unknown body fields are tolerated.
 */
export function validateWireAgentEvent(raw: unknown): ParseResult<WireAgentEvent> {
  if (!isRecord(raw)) {
    return { ok: false, error: protocolError("invalid_payload", "event doit être un objet") };
  }
  if (typeof raw.kind !== "string" || !raw.kind) {
    return { ok: false, error: protocolError("missing_field", "champ obligatoire absent: kind") };
  }
  if (raw.meta !== undefined) {
    const metaRes = validateHarnessMeta(raw.meta);
    if (!metaRes.ok) return metaRes;
    return { ok: true, value: { ...raw, kind: raw.kind, meta: metaRes.value } as WireAgentEvent };
  }
  return { ok: true, value: raw as WireAgentEvent };
}

/** getHistory: threadId required; afterSequence optional number ≥ 0. */
export function validateGetHistory(msg: Record<string, unknown>): ParseResult<{
  type: "getHistory";
  threadId: string;
  afterSequence?: number;
}> {
  if (msg.type !== "getHistory") {
    return { ok: false, error: protocolError("invalid_payload", "type getHistory attendu") };
  }
  if (typeof msg.threadId !== "string" || !msg.threadId) {
    return {
      ok: false,
      error: protocolError("missing_field", "champ obligatoire absent: threadId"),
    };
  }
  if (msg.afterSequence !== undefined) {
    if (typeof msg.afterSequence !== "number" || !Number.isFinite(msg.afterSequence) || msg.afterSequence < 0) {
      return {
        ok: false,
        error: protocolError("invalid_payload", "afterSequence doit être un nombre ≥ 0"),
      };
    }
  }
  return {
    ok: true,
    value: {
      type: "getHistory",
      threadId: msg.threadId,
      afterSequence: msg.afterSequence as number | undefined,
    },
  };
}
