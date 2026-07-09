import { invoke } from "@tauri-apps/api/core";

export type SidecarInfo = { port: number; token?: string };

// Source unique du couple port/token du sidecar. Chaque connexion WS réussie
// la met à jour ; les clients HTTP (write-through ui.json) la consultent au
// moment de l'envoi — jamais de port capturé dans une closure longue durée.
let current: SidecarInfo | null = null;

export function getSidecarInfo(): SidecarInfo | null {
  return current;
}

export function setSidecarInfo(info: SidecarInfo): void {
  current = info;
}

export async function refreshSidecarInfo(): Promise<SidecarInfo> {
  const info = await invoke<SidecarInfo>("sidecar_port");
  current = info;
  return info;
}

/** Réservé aux tests : repart d'un état vierge. */
export function resetSidecarInfo(): void {
  current = null;
}

export function sidecarHeaders(info: SidecarInfo): Record<string, string> | undefined {
  return info.token ? { "x-atelier-token": info.token } : undefined;
}
