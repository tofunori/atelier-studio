import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

let badgeAuthorizationRequest: Promise<void> | null = null;

async function ensureBadgeAuthorization(): Promise<void> {
  if (!navigator.platform.toLowerCase().includes("mac")) return;
  if (!badgeAuthorizationRequest) {
    badgeAuthorizationRequest = invoke("request_badge_authorization").catch((error) => {
      console.warn("dock badge authorization failed", error);
    }) as Promise<void>;
  }
  await badgeAuthorizationRequest;
}

export async function setDockBadge(count: number): Promise<void> {
  const value = Math.max(0, Math.trunc(count));
  const appWindow = getCurrentWindow();

  try {
    if (navigator.platform.toLowerCase().includes("mac")) {
      await ensureBadgeAuthorization();
      await invoke("set_badge_count", { count: value });
    } else {
      await appWindow.setBadgeCount(value > 0 ? value : undefined);
    }
  } catch (error) {
    console.warn("dock badge update failed", error);
  }
}
