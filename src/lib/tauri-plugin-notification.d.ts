declare module "@tauri-apps/plugin-notification" {
  export type NotificationPermissionState =
    | "granted"
    | "denied"
    | "default"
    | "prompt"
    | "prompt-with-rationale";

  export interface NotificationOptions {
    id?: number;
    title: string;
    body?: string;
    extra?: Record<string, unknown>;
    autoCancel?: boolean;
  }

  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<NotificationPermissionState>;
  export function sendNotification(options: NotificationOptions | string): void;
}
