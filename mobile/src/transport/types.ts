import { PROTOCOL_VERSION } from "./protocol.ts";

export type ConnectionPhase =
  | "never_paired"
  | "offline"
  | "tailscale_missing"
  | "auth_expired"
  | "version_incompatible"
  | "connecting"
  | "ready";

export type DeviceCredentials = {
  deviceId: string;
  token: string;
  name: string;
  scopes: string[];
  gatewayBaseUrl: string;
  pairedAt: number;
};

export type ProjectSummary = {
  projectId: string;
  name: string;
};

export type ThreadSummary = {
  id: string;
  title: string;
  provider: string;
  status: string;
  updatedAt: string;
  projectId: string | null;
  lastSequence: number;
  model?: string;
};

export type WireEvent = {
  kind: string;
  text?: string;
  message?: string;
  result?: string;
  meta?: {
    eventId?: string;
    sequence?: number;
    turnId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type HistoryResponse = {
  type?: string;
  threadId: string;
  events: WireEvent[];
  fromSequence: number;
  toSequence: number;
  complete: boolean;
  snapshotRequired?: boolean;
};

export type HealthResponse = {
  ok: boolean;
  protocolVersion?: number;
  minProtocolVersion?: number;
  maxProtocolVersion?: number;
  service?: string;
};

export type PairResponse = {
  ok: boolean;
  deviceId: string;
  token: string;
  scopes: string[];
  name: string;
  protocolVersion?: number;
};

export { PROTOCOL_VERSION };
