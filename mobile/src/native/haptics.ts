/** Light haptic only on confirmed send/stop/interaction (plan 034). Never per token. */

export type HapticKind = "light" | "medium" | "success" | "warning";

export async function haptic(kind: HapticKind = "light"): Promise<void> {
  try {
    // Web Vibration API (Android; iOS Safari limited)
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      const pattern =
        kind === "medium" ? 20 : kind === "success" ? [10, 30, 10] : kind === "warning" ? [30, 20, 30] : 10;
      navigator.vibrate(pattern);
      return;
    }
  } catch {
    /* ignore */
  }
  // Tauri future: invoke plugin-haptics when available
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("haptic_tap", { kind }).catch(() => undefined);
    }
  } catch {
    /* optional */
  }
}
