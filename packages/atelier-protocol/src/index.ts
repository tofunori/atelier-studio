/** @atelier/protocol — shared wire contracts for desktop, mobile, fixture (plan 034 B). */

export {
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  MAX_PROTOCOL_VERSION,
  negotiateProtocolVersion,
  type ProtocolVersionStatus,
} from "./version.ts";

export {
  HARNESS_META_REQUIRED,
  type HarnessEventMeta,
  type HarnessEventOrigin,
  type HarnessMetaRequiredKey,
} from "./meta.ts";

export {
  makeServerHello,
  protocolError,
  type ClientKind,
  type ClientHelloMessage,
  type ServerHelloMessage,
  type ProtocolErrorCode,
  type ProtocolErrorMessage,
  type GetHistoryMessage,
  type HistoryMessage,
  type WireAgentEventBody,
  type WireAgentEvent,
  type EventMessage,
  type ThreadSummary,
  type ThreadsMessage,
  type ListThreadsMessage,
  type SendMessage,
  type InterruptMessage,
  type InteractionResponseMessage,
  type ClientWireMessage,
  type ServerWireMessage,
  type PingMessage,
  type PongMessage,
} from "./envelopes.ts";

export {
  parseJsonMessage,
  validateClientHello,
  validateHarnessMeta,
  validateWireAgentEvent,
  validateGetHistory,
  type ParseResult,
} from "./validate.ts";

export {
  emptyCursor,
  metaOf,
  detectSequenceGaps,
  applyEventBatch,
  sliceHistoryAfter,
  maxSequence,
  type SequenceCursor,
  type ApplyBatchResult,
} from "./sequence.ts";

export {
  FIXED_TS,
  buildTurn,
  buildTranscript,
  smallTranscript,
  mediumTranscript,
  stressTranscript,
  interactionPendingTranscript,
  errorTranscript,
  interruptTranscript,
  allNamedTranscripts,
  type TranscriptBundle,
} from "./transcripts/build.ts";

export {
  FixtureEngine,
  stressEventCount,
  transcriptLastSequence,
  type FixtureScenarioId,
  type FixtureEngineOptions,
  type FixtureSession,
} from "./fixture/engine.ts";

export { startFixtureServer, type FixtureServer } from "./fixture/server.ts";
