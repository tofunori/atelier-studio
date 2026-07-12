/** Journal harness metadata (plan 025 schema v1) — identities shared desktop/mobile. */

export type HarnessEventOrigin = "provider" | "atelier" | "legacy-import";

export type HarnessEventMeta = {
  schemaVersion: 1;
  eventId: string;
  provider: string;
  threadId: string;
  turnId: string;
  messageId?: string;
  itemId?: string;
  nativeThreadId?: string;
  nativeTurnId?: string;
  sequence: number;
  ts: number;
  durable: boolean;
  origin: HarnessEventOrigin;
};

/** Required keys for a durable harness meta payload (wire validation). */
export const HARNESS_META_REQUIRED = [
  "schemaVersion",
  "eventId",
  "provider",
  "threadId",
  "turnId",
  "sequence",
  "ts",
  "durable",
  "origin",
] as const;

export type HarnessMetaRequiredKey = (typeof HARNESS_META_REQUIRED)[number];
