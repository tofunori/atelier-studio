import { invoke } from "@tauri-apps/api/core";

export type UiStateSource = "native" | "localStorage-fallback";

type StorageWriter = Pick<Storage, "setItem">;
type InvokeUiState = (command: "ui_state_snapshot") => Promise<Record<string, string>>;

export async function hydrateUiStateBeforeRender(options: {
  storage?: StorageWriter;
  invokeUiState?: InvokeUiState;
  timeoutMs?: number;
} = {}): Promise<UiStateSource> {
  const storage = options.storage ?? localStorage;
  const invokeUiState = options.invokeUiState ?? ((command) => invoke<Record<string, string>>(command));
  const timeoutMs = options.timeoutMs ?? 500;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const snapshot = await Promise.race([
      invokeUiState("ui_state_snapshot"),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("ui_state_snapshot timeout")), timeoutMs);
      }),
    ]);
    for (const [key, value] of Object.entries(snapshot)) {
      if (key.startsWith("atelier-studio") && typeof value === "string") {
        storage.setItem(key, value);
      }
    }
    return "native";
  } catch (error) {
    console.warn("Atelier: hydratation native ui.json indisponible:", error);
    return "localStorage-fallback";
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
