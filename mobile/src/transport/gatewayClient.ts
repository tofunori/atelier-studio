import { PROTOCOL_VERSION } from "./protocol.ts";
import type {
  DeviceCredentials,
  HealthResponse,
  HistoryResponse,
  PairResponse,
  ProjectSummary,
  ThreadSummary,
  WireEvent,
} from "./types.ts";

export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

async function parseError(res: Response): Promise<GatewayError> {
  let code = "http_error";
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { code?: string; error?: string; message?: string };
    code = body.code || code;
    message = body.error || body.message || message;
  } catch {
    /* ignore */
  }
  return new GatewayError(message, code, res.status);
}

export async function fetchHealth(baseUrl: string, signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${normalizeBase(baseUrl)}/remote/health`, { signal });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as HealthResponse;
}

export async function pairDevice(opts: {
  baseUrl: string;
  code: string;
  deviceName: string;
  signal?: AbortSignal;
}): Promise<PairResponse> {
  const res = await fetch(`${normalizeBase(opts.baseUrl)}/remote/v1/pair`, {
    method: "POST",
    signal: opts.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: opts.code.trim(),
      deviceName: opts.deviceName.trim() || "iPhone",
      protocolVersion: PROTOCOL_VERSION,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PairResponse;
}

function authHeaders(token: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-atelier-device-token": token,
  };
}

export async function listProjects(
  creds: DeviceCredentials,
  signal?: AbortSignal,
): Promise<ProjectSummary[]> {
  const res = await fetch(`${normalizeBase(creds.gatewayBaseUrl)}/remote/v1/projects`, {
    headers: authHeaders(creds.token),
    signal,
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { projects: ProjectSummary[] };
  return body.projects ?? [];
}

export async function listThreads(
  creds: DeviceCredentials,
  signal?: AbortSignal,
): Promise<ThreadSummary[]> {
  const res = await fetch(`${normalizeBase(creds.gatewayBaseUrl)}/remote/v1/threads`, {
    headers: authHeaders(creds.token),
    signal,
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { threads: ThreadSummary[] };
  return body.threads ?? [];
}

export async function getHistory(
  creds: DeviceCredentials,
  threadId: string,
  afterSequence = 0,
  signal?: AbortSignal,
): Promise<HistoryResponse> {
  const q = afterSequence > 0 ? `?afterSequence=${afterSequence}` : "";
  const res = await fetch(
    `${normalizeBase(creds.gatewayBaseUrl)}/remote/v1/threads/${encodeURIComponent(threadId)}/history${q}`,
    { headers: authHeaders(creds.token), signal },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as HistoryResponse;
}

/** Probe connectivity and map to high-level failure reasons. */
export async function probeGateway(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; health: HealthResponse }
  | { ok: false; reason: "offline" | "version_incompatible" | "tailscale_missing"; detail: string }
> {
  try {
    const health = await fetchHealth(baseUrl, signal);
    const serverV = health.protocolVersion ?? 1;
    const min = health.minProtocolVersion ?? serverV;
    const max = health.maxProtocolVersion ?? serverV;
    if (PROTOCOL_VERSION < min || PROTOCOL_VERSION > max) {
      return {
        ok: false,
        reason: "version_incompatible",
        detail: `client=${PROTOCOL_VERSION} serveur=[${min},${max}]`,
      };
    }
    return { ok: true, health };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Heuristic: failed fetch on a .ts.net host often means Tailscale down
    if (baseUrl.includes(".ts.net") || baseUrl.includes("tailscale")) {
      return { ok: false, reason: "tailscale_missing", detail: msg };
    }
    return { ok: false, reason: "offline", detail: msg };
  }
}

export function eventPreviewText(ev: WireEvent): string {
  if (typeof ev.text === "string" && ev.text) return ev.text;
  if (typeof ev.message === "string" && ev.message) return ev.message;
  if (typeof ev.result === "string" && ev.result) return ev.result;
  if (ev.kind === "tool_update") {
    return String((ev as { name?: string }).name ?? "outil");
  }
  if (ev.kind === "interaction") {
    return String((ev as { title?: string }).title ?? "interaction");
  }
  return ev.kind;
}

export async function sendMessage(
  creds: DeviceCredentials,
  body: {
    threadId: string;
    prompt: string;
    clientRequestId: string;
    clientMessageId?: string;
  },
  signal?: AbortSignal,
): Promise<{ ok: boolean; accepted?: boolean; replay?: boolean }> {
  const res = await fetch(`${normalizeBase(creds.gatewayBaseUrl)}/remote/v1/send`, {
    method: "POST",
    signal,
    headers: authHeaders(creds.token),
    body: JSON.stringify({
      threadId: body.threadId,
      prompt: body.prompt,
      clientRequestId: body.clientRequestId,
      clientMessageId: body.clientMessageId,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { ok: boolean; accepted?: boolean; replay?: boolean };
}

export async function interruptThread(
  creds: DeviceCredentials,
  body: { threadId: string; clientRequestId?: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${normalizeBase(creds.gatewayBaseUrl)}/remote/v1/interrupt`, {
    method: "POST",
    signal,
    headers: authHeaders(creds.token),
    body: JSON.stringify({
      threadId: body.threadId,
      clientRequestId: body.clientRequestId,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { ok: boolean };
}

export async function respondInteraction(
  creds: DeviceCredentials,
  body: {
    threadId: string;
    requestId: string;
    response: unknown;
    clientRequestId: string;
  },
  signal?: AbortSignal,
): Promise<{ ok: boolean; accepted?: boolean; replay?: boolean }> {
  const res = await fetch(`${normalizeBase(creds.gatewayBaseUrl)}/remote/v1/interaction`, {
    method: "POST",
    signal,
    headers: authHeaders(creds.token),
    body: JSON.stringify({
      threadId: body.threadId,
      requestId: body.requestId,
      response: body.response,
      clientRequestId: body.clientRequestId,
    }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { ok: boolean; accepted?: boolean; replay?: boolean };
}
