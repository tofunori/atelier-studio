import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AppSnapPermission = "granted" | "denied" | "unknown";

export type AppSnapState = {
  platform: string;
  supported: boolean;
  enabled: boolean;
  status: "disabled" | "starting" | "ready" | "permission-required" | "error" | "unsupported";
  shortcut: "both-option-keys" | null;
  inputMonitoringPermission: AppSnapPermission;
  screenRecordingPermission: AppSnapPermission;
  accessibilityPermission: AppSnapPermission;
  message: string | null;
};

export type AppSnapCapture = {
  id: string;
  path: string;
  name: string;
  capturedAt: string;
  sourceAppName: string | null;
  sourceBundleIdentifier: string | null;
  sourceAppIconDataUrl: string | null;
  sourceWindowTitle: string | null;
  accessibilitySnapshot: string | null;
  accessibilityElementCount: number | null;
  accessibilitySnapshotTruncated: boolean | null;
};

export type AppSnapError = {
  code: string;
  message: string;
  capturedAt: string | null;
};

const WEB_STATE: AppSnapState = {
  platform: "web",
  supported: false,
  enabled: false,
  status: "unsupported",
  shortcut: null,
  inputMonitoringPermission: "unknown",
  screenRecordingPermission: "unknown",
  accessibilityPermission: "unknown",
  message: "AppSnap is available in the Atelier macOS app.",
};

export function appSnapContextText(
  capture: AppSnapCapture,
  appName: string,
  windowTitle: string,
): string {
  const snapshot = capture.accessibilitySnapshot?.trim();
  const context = [
    `AppSnap captured from ${appName}.`,
    `Window: ${windowTitle}`,
    `Local image file: ${capture.path}`,
    "Inspect the attached image when answering the user's message.",
  ];
  if (snapshot) {
    context.push(
      "Accessibility snapshot of the visible interface (text representation; it may be incomplete):",
      snapshot,
    );
  }
  return context.join("\n");
}

export async function getAppSnapState(): Promise<AppSnapState> {
  if (!isTauri()) return WEB_STATE;
  return invoke<AppSnapState>("appsnap_get_state");
}

export async function requestAppSnapPermissions(): Promise<AppSnapState> {
  if (!isTauri()) return WEB_STATE;
  return invoke<AppSnapState>("appsnap_request_permissions");
}

export async function setAppSnapEnabled(enabled: boolean): Promise<AppSnapState> {
  if (!isTauri()) return WEB_STATE;
  return invoke<AppSnapState>("appsnap_set_enabled", { enabled });
}

async function listenIfDesktop<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<T>(event, ({ payload }) => handler(payload));
}

export const onAppSnapCaptured = (handler: (capture: AppSnapCapture) => void) =>
  listenIfDesktop<AppSnapCapture>("appsnap:captured", handler);

export const onAppSnapError = (handler: (error: AppSnapError) => void) =>
  listenIfDesktop<AppSnapError>("appsnap:error", handler);

export const onAppSnapState = (handler: (state: AppSnapState) => void) =>
  listenIfDesktop<AppSnapState>("appsnap:state", handler);

export async function appSnapPreviewUrl(path: string): Promise<string> {
  if (!isTauri()) return path;
  const bytes = await invoke<ArrayBuffer>("appsnap_read_capture", { path });
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}
