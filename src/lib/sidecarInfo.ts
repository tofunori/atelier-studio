import { invoke } from "@tauri-apps/api/core";
import { markBootMetric, setBootMetricFlags } from "./bootMetrics";

export type SidecarInfo = {
  port: number;
  token?: string;
  backend?: "rust" | "node";
  lifecycle?: "in-process" | "lock-reuse" | "spawn";
  gatewayDeferred?: boolean;
};

// Source unique du couple port/token du sidecar. Chaque connexion WS réussie
// la met à jour ; les clients HTTP (write-through ui.json) la consultent au
// moment de l'envoi — jamais de port capturé dans une closure longue durée.
let current: SidecarInfo | null = null;
let inFlight: Promise<SidecarInfo> | null = null;
let epoch = 0;

function validateSidecarInfo(value: SidecarInfo): SidecarInfo {
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) {
    throw new Error("sidecar_port a renvoyé un port invalide");
  }
  if (value.token != null && typeof value.token !== "string") {
    throw new Error("sidecar_port a renvoyé un token invalide");
  }
  return value;
}

function requestSidecarInfo(): Promise<SidecarInfo> {
  if (inFlight) return inFlight;
  const requestEpoch = epoch;
  const request = invoke<SidecarInfo>("sidecar_port")
    .then(validateSidecarInfo)
    .then((info) => {
      if (requestEpoch === epoch) current = info;
      markBootMetric("sidecarReady");
      setBootMetricFlags({
        sidecarPath: info.lifecycle ?? "unknown",
        gatewayDeferred: info.gatewayDeferred ?? false,
      });
      return info;
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}

export function getSidecarInfo(): SidecarInfo | null {
  return current;
}

export function setSidecarInfo(info: SidecarInfo): void {
  current = validateSidecarInfo(info);
}

export function ensureSidecarInfo(): Promise<SidecarInfo> {
  return current ? Promise.resolve(current) : requestSidecarInfo();
}

export function refreshSidecarInfo(): Promise<SidecarInfo> {
  return requestSidecarInfo();
}

export function invalidateSidecarInfo(): void {
  current = null;
}

/** Réservé aux tests : repart d'un état vierge. */
export function resetSidecarInfo(): void {
  epoch += 1;
  current = null;
  inFlight = null;
}

export function sidecarHeaders(info: SidecarInfo): Record<string, string> | undefined {
  return info.token ? { "x-atelier-token": info.token } : undefined;
}
