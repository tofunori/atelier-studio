import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { installUiStateWriteThrough, type StorageLike } from "./uiStateWriteThrough";
import { resetSidecarInfo, setSidecarInfo } from "./sidecarInfo";

// storage simple (le localStorage de jsdom est un Proxy : impossible d'y
// remplacer setItem — en prod WebKit, l'assignation shadow la méthode)
function makeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    setItem: (k, v) => { map.set(k, v); },
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

describe("installUiStateWriteThrough", () => {
  let uninstall: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    resetSidecarInfo();
    setSidecarInfo({ port: 1111, token: "t" });
  });
  afterEach(() => {
    uninstall?.();
    uninstall = null;
    vi.useRealTimers();
  });

  it("une écriture atelier-studio.* déclenche UN flush débouncé vers /uistate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({});
    const storage = makeStorage();
    uninstall = installUiStateWriteThrough(fetchImpl as unknown as typeof fetch, storage);

    storage.setItem("atelier-studio.pins", "[1]");
    storage.setItem("atelier-studio.pins", "[1,2]"); // débounce : 1 seul envoi
    expect(fetchImpl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:1111/uistate");
    expect(JSON.parse(opts.body)["atelier-studio.pins"]).toBe("[1,2]");
  });

  it("pagehide flushe en keepalive", () => {
    const fetchImpl = vi.fn().mockResolvedValue({});
    uninstall = installUiStateWriteThrough(fetchImpl as unknown as typeof fetch, makeStorage());

    window.dispatchEvent(new Event("pagehide"));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].keepalive).toBe(true);
  });

  it("le désinstallateur restaure setItem et retire les listeners (env de test propre)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({});
    const storage = makeStorage();
    const before = storage.setItem;
    uninstall = installUiStateWriteThrough(fetchImpl as unknown as typeof fetch, storage);
    expect(storage.setItem).not.toBe(before);

    uninstall();
    uninstall = null;
    expect(storage.setItem).toBe(before); // méthode d'origine restaurée

    storage.setItem("atelier-studio.pins", "[9]");
    await vi.advanceTimersByTimeAsync(1000);
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storage.getItem("atelier-studio.pins")).toBe("[9]"); // écriture intacte
  });
});
