import type { DeviceCredentials } from "../transport/types.ts";
import { secureGet, secureRemove, secureSet } from "../native/secureStorage.ts";

const KEY = "atelier.device.credentials.v1";
const URL_KEY = "atelier.gateway.url";

export async function loadCredentials(): Promise<DeviceCredentials | null> {
  const raw = await secureGet(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as DeviceCredentials;
    if (!v?.token || !v?.gatewayBaseUrl || !v?.deviceId) return null;
    return v;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: DeviceCredentials): Promise<void> {
  await secureSet(KEY, JSON.stringify(creds));
  await secureSet(URL_KEY, creds.gatewayBaseUrl);
}

export async function clearCredentials(): Promise<void> {
  await secureRemove(KEY);
}

export async function loadLastGatewayUrl(): Promise<string> {
  const stored = await secureGet(URL_KEY);
  if (stored) return stored;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return "https://macbookpro-de-thierry.tail02163.ts.net:8443";
  }
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return window.location.origin;
  }
  return "http://127.0.0.1:18765";
}

export async function saveLastGatewayUrl(url: string): Promise<void> {
  await secureSet(URL_KEY, url);
}
