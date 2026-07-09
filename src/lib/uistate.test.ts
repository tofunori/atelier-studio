import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { createUiStateFlusher } from "./uistate";
import { resetSidecarInfo, setSidecarInfo } from "./sidecarInfo";

const invokeMock = vi.mocked(invoke);

describe("createUiStateFlusher", () => {
  beforeEach(() => {
    resetSidecarInfo();
    invokeMock.mockReset();
  });

  it("poste sur le port courant de SidecarInfo", async () => {
    setSidecarInfo({ port: 1111, token: "t" });
    const fetchImpl = vi.fn().mockResolvedValue({});
    const flush = createUiStateFlusher(() => ({ k: "v" }), fetchImpl as unknown as typeof fetch);

    flush(false);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:1111/uistate");
    expect(opts.headers).toEqual({ "x-atelier-token": "t" });
    expect(JSON.parse(opts.body)).toEqual({ k: "v" });
  });

  it("échec réseau : refresh l'info puis un seul retry sur le nouveau port", async () => {
    setSidecarInfo({ port: 1111 });
    invokeMock.mockResolvedValue({ port: 2222 }); // sidecar redémarré
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({});
    const flush = createUiStateFlusher(() => ({ k: "v" }), fetchImpl as unknown as typeof fetch);

    flush(false);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:1111/uistate");
    expect(fetchImpl.mock.calls[1][0]).toBe("http://127.0.0.1:2222/uistate");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("en unload (keepalive), jamais de chaîne async : ni refresh ni retry", async () => {
    setSidecarInfo({ port: 1111 });
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    const flush = createUiStateFlusher(() => ({}), fetchImpl as unknown as typeof fetch);

    flush(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].keepalive).toBe(true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sans SidecarInfo connue, ne poste rien", () => {
    const fetchImpl = vi.fn();
    const flush = createUiStateFlusher(() => ({}), fetchImpl as unknown as typeof fetch);
    flush(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
