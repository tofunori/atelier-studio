import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  ensureSidecarInfo,
  getSidecarInfo,
  invalidateSidecarInfo,
  refreshSidecarInfo,
  resetSidecarInfo,
  setSidecarInfo,
} from "./sidecarInfo";

const invokeMock = vi.mocked(invoke);

describe("SidecarInfo single-flight", () => {
  beforeEach(() => {
    resetSidecarInfo();
    invokeMock.mockReset();
  });

  it("partage une seule invocation entre deux consommateurs simultanés", async () => {
    let resolve!: (value: { port: number; lifecycle: "spawn" }) => void;
    invokeMock.mockImplementation(() => new Promise((done) => { resolve = done; }));

    const first = ensureSidecarInfo();
    const second = ensureSidecarInfo();
    expect(first).toBe(second);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    resolve({ port: 4242, lifecycle: "spawn" });
    await expect(first).resolves.toEqual({ port: 4242, lifecycle: "spawn" });
    await expect(second).resolves.toEqual({ port: 4242, lifecycle: "spawn" });
    expect(getSidecarInfo()?.port).toBe(4242);
  });

  it("réutilise current pour ensure mais force une invocation avec refresh", async () => {
    setSidecarInfo({ port: 1111 });
    await expect(ensureSidecarInfo()).resolves.toEqual({ port: 1111 });
    expect(invokeMock).not.toHaveBeenCalled();

    invokeMock.mockResolvedValue({ port: 2222 });
    await expect(refreshSidecarInfo()).resolves.toEqual({ port: 2222 });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("vide la promesse rejetée pour autoriser un retry", async () => {
    invokeMock
      .mockRejectedValueOnce(new Error("cold start failed"))
      .mockResolvedValueOnce({ port: 3333 });

    await expect(ensureSidecarInfo()).rejects.toThrow("cold start failed");
    await expect(ensureSidecarInfo()).resolves.toEqual({ port: 3333 });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("invalide l'adresse avant une reconnexion et rejette une réponse mal formée", async () => {
    setSidecarInfo({ port: 1111 });
    invalidateSidecarInfo();
    expect(getSidecarInfo()).toBeNull();

    invokeMock.mockResolvedValue({ port: 0 });
    await expect(ensureSidecarInfo()).rejects.toThrow("port invalide");
    expect(getSidecarInfo()).toBeNull();
  });
});
