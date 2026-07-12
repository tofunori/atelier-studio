import type { ConnectionPhase, DeviceCredentials } from "../transport/types.ts";
import { GatewayError } from "../transport/gatewayClient.ts";

export type ConnectionBanner = {
  phase: ConnectionPhase;
  tone: "neutral" | "ok" | "warn" | "error";
  label: string;
};

export function phaseFromAuthError(err: unknown): ConnectionPhase | null {
  if (err instanceof GatewayError) {
    if (err.status === 401 || err.code === "unauthorized") return "auth_expired";
    if (err.code === "protocol_version_unsupported") return "version_incompatible";
  }
  return null;
}

export function bannerFor(
  phase: ConnectionPhase,
  opts?: { detail?: string },
): ConnectionBanner {
  switch (phase) {
    case "never_paired":
      return {
        phase,
        tone: "neutral",
        label: "Jamais appairé — saisissez le code affiché sur le Mac",
      };
    case "offline":
      return {
        phase,
        tone: "error",
        label: opts?.detail
          ? `Mac hors ligne — ${opts.detail}`
          : "Mac hors ligne — vérifiez que la gateway tourne",
      };
    case "tailscale_missing":
      return {
        phase,
        tone: "warn",
        label: "Tailscale absent ou déconnecté — reconnectez le VPN",
      };
    case "auth_expired":
      return {
        phase,
        tone: "error",
        label: "Authentification expirée ou révoquée — réappareiller",
      };
    case "version_incompatible":
      return {
        phase,
        tone: "error",
        label: opts?.detail
          ? `Version incompatible — ${opts.detail}`
          : "Version de protocole incompatible",
      };
    case "connecting":
      return {
        phase,
        tone: "neutral",
        label: opts?.detail ?? "Connexion / synchronisation…",
      };
    case "ready":
      return { phase, tone: "ok", label: opts?.detail ?? "Prêt" };
  }
}

export function redactDiagnostics(input: {
  phase: ConnectionPhase;
  gatewayBaseUrl: string;
  credentials: DeviceCredentials | null;
  lastError?: string | null;
  appVersion: string;
  protocolVersion: number;
  networkState?: string;
  badgeCount?: number;
  cacheThreads?: number;
}): string {
  // Lazy import-free scrub for lastError (inline minimal to avoid cycles in tests)
  const scrub = (s: string) =>
    s
      .replace(/(token|password|secret|authorization)\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1:[redacted]")
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
      .replace(/\b[a-f0-9]{32,}\b/gi, "[redacted-hex]");

  const err = input.lastError ? scrub(input.lastError) : "(none)";
  // Ensure credential token never appears even if mistakenly passed as error
  const token = input.credentials?.token;
  const safeErr =
    token && err.includes(token) ? err.split(token).join("[redacted]") : err;

  const lines = [
    `Atelier Companion diagnostics`,
    `appVersion: ${input.appVersion}`,
    `protocolVersion: ${input.protocolVersion}`,
    `phase: ${input.phase}`,
    `networkState: ${input.networkState ?? "(n/a)"}`,
    `gateway: ${input.gatewayBaseUrl}`,
    `deviceId: ${input.credentials?.deviceId ?? "(none)"}`,
    `deviceName: ${input.credentials?.name ?? "(none)"}`,
    `scopes: ${input.credentials?.scopes?.join(",") ?? "(none)"}`,
    `pairedAt: ${input.credentials?.pairedAt ?? "(none)"}`,
    `hasToken: ${input.credentials?.token ? "yes" : "no"}`,
    // Never dump token
    `tokenPreview: ${input.credentials?.token ? "[redacted]" : "(none)"}`,
    `badgeCount: ${input.badgeCount ?? "(n/a)"}`,
    `cacheThreads: ${input.cacheThreads ?? "(n/a)"}`,
    `lastError: ${safeErr}`,
    `userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
    `ts: ${new Date().toISOString()}`,
    `docs: docs/mobile/RUNBOOK.md`,
  ];
  return lines.join("\n");
}
