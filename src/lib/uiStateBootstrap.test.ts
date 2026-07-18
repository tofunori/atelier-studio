import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { hydrateUiStateBeforeRender } from "./uiStateBootstrap";

function storageWith(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("hydrateUiStateBeforeRender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("applique le snapshot disque prioritaire sans supprimer les clés locales absentes", async () => {
    const storage = storageWith({
      "atelier-studio.theme": "light",
      "atelier-studio.local-only": "preserved",
    });

    const source = await hydrateUiStateBeforeRender({
      storage,
      invokeUiState: vi.fn().mockResolvedValue({ "atelier-studio.theme": "dark" }),
    });

    expect(source).toBe("native");
    expect(storage.values.get("atelier-studio.theme")).toBe("dark");
    expect(storage.values.get("atelier-studio.local-only")).toBe("preserved");
  });

  it("conserve le stockage local si la lecture native échoue", async () => {
    const storage = storageWith({ "atelier-studio.theme": "light" });

    const source = await hydrateUiStateBeforeRender({
      storage,
      invokeUiState: vi.fn().mockRejectedValue(new Error("invalid ui.json")),
    });

    expect(source).toBe("localStorage-fallback");
    expect(storage.values.get("atelier-studio.theme")).toBe("light");
  });

  it("ignore définitivement une réponse arrivée après le timeout", async () => {
    const storage = storageWith({ "atelier-studio.theme": "light" });
    let resolveSnapshot!: (snapshot: Record<string, string>) => void;
    const pending = new Promise<Record<string, string>>((resolve) => {
      resolveSnapshot = resolve;
    });
    const hydration = hydrateUiStateBeforeRender({
      storage,
      invokeUiState: vi.fn(() => pending),
      timeoutMs: 500,
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(await hydration).toBe("localStorage-fallback");
    resolveSnapshot({ "atelier-studio.theme": "late-dark" });
    await Promise.resolve();

    expect(storage.values.get("atelier-studio.theme")).toBe("light");
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
