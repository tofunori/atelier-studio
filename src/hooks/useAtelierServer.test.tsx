import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useAtelierServer } from "./useAtelierServer";
import { flushMicrotasks } from "../test/fixtures/sidecar";

const invokeMock = vi.mocked(invoke);
const CONFIG = { galleryConfig: () => ({ galleryDir: "", galleryExts: "" }), atelierNonce: "nonce-x" };

describe("useAtelierServer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue("http://127.0.0.1:18790/");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("démarre le serveur du projet actif et expose l'URL avec nonce", async () => {
    const onReady = vi.fn();
    const { result } = renderHook(() =>
      useAtelierServer("/tmp/proj", { ...CONFIG, onReady }));
    await act(async () => { await flushMicrotasks(6); });

    expect(invokeMock).toHaveBeenCalledWith("start_atelier", expect.objectContaining({ root: "/tmp/proj" }));
    expect(result.current.atelierUrl).toContain("atelier_nonce=nonce-x");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("ne redémarre pas un projet déjà servi (montage/démontage ×2)", async () => {
    const first = renderHook(() => useAtelierServer("/tmp/proj", CONFIG));
    await act(async () => { await flushMicrotasks(6); });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    first.unmount();

    // remontage sur le même projet : un état frais relance une fois (pas de cache
    // inter-montages), mais JAMAIS deux fois dans la vie d'un même hook
    const second = renderHook(() => useAtelierServer("/tmp/proj", CONFIG));
    await act(async () => { await flushMicrotasks(6); });
    expect(invokeMock).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  it("aucun démarrage quand il n'y a pas de projet actif", async () => {
    renderHook(() => useAtelierServer(null, CONFIG));
    await act(async () => { await flushMicrotasks(6); });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("P4 diffère une galerie masquée jusqu'à wsReady puis au créneau idle", async () => {
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useAtelierServer("/tmp/proj", {
        ...CONFIG,
        galleryVisible: false,
        coreReady: ready,
      }),
      { initialProps: { ready: false } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(invokeMock).not.toHaveBeenCalled();

    rerender({ ready: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(invokeMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); await flushMicrotasks(6); });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("P4 démarre une galerie visible au frame suivant sans double invoke", async () => {
    let resolve!: (url: string) => void;
    invokeMock.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useAtelierServer("/tmp/proj", {
        ...CONFIG,
        galleryVisible: true,
        coreReady: ready,
      }),
      { initialProps: { ready: false } },
    );
    expect(invokeMock).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(16); });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    rerender({ ready: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(16); });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => { resolve("http://127.0.0.1:18790/"); await flushMicrotasks(6); });
  });

  it("mort du serveur : 2 échecs de sonde → REDÉMARRAGE réel et URL restaurée", async () => {
    const failing = vi.fn()
      .mockResolvedValueOnce({ ok: true } as Response) // tick1 OK
      .mockRejectedValueOnce(new Error("down"))        // tick2 (fails=1)
      .mockRejectedValueOnce(new Error("down"))        // tick3 (fails=2 → restart)
      .mockResolvedValue({ ok: true } as Response);    // le serveur relancé répond
    vi.stubGlobal("fetch", failing);
    const { result } = renderHook(() => useAtelierServer("/tmp/proj", CONFIG));
    await act(async () => { await flushMicrotasks(6); });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.current.atelierUrl).toContain("atelier_nonce");

    await act(async () => { await vi.advanceTimersByTimeAsync(15000); await flushMicrotasks(4); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); await flushMicrotasks(4); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); await flushMicrotasks(8); });

    expect(invokeMock).toHaveBeenCalledTimes(2); // vrai redémarrage
    expect(result.current.atelierUrl).toContain("atelier_nonce"); // URL restaurée
  });

  it("résolution A retardée après bascule vers B : ignorée (ni URL ni onReady de A dans B)", async () => {
    const resolvers: Record<string, (url: string) => void> = {};
    invokeMock.mockImplementation((_cmd, args) =>
      new Promise((res) => { resolvers[(args as { root: string }).root] = res as (url: string) => void; }));
    const onReady = vi.fn();
    const { result, rerender } = renderHook(
      ({ proj }: { proj: string }) => useAtelierServer(proj, { ...CONFIG, onReady }),
      { initialProps: { proj: "/tmp/A" } },
    );
    await act(async () => { await flushMicrotasks(4); });

    // bascule vers B AVANT que A ne résolve
    rerender({ proj: "/tmp/B" });
    await act(async () => { await flushMicrotasks(4); });

    // la résolution de A arrive en retard → doit être ignorée
    await act(async () => { resolvers["/tmp/A"]?.("http://127.0.0.1:18790/"); await flushMicrotasks(6); });
    expect(onReady).not.toHaveBeenCalled();
    expect(result.current.atelierUrl).toBeNull(); // B n'a pas encore résolu

    // B résout normalement
    await act(async () => { resolvers["/tmp/B"]?.("http://127.0.0.1:18791/"); await flushMicrotasks(6); });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith("/tmp/B", expect.stringContaining("18791"));
    expect(result.current.atelierUrl).toContain("18791");
  });

  it("démontage pendant une résolution en vol : rien n'est appliqué", async () => {
    let resolveA: ((url: string) => void) | null = null;
    invokeMock.mockImplementation(() => new Promise((res) => { resolveA = res as (url: string) => void; }));
    const onReady = vi.fn();
    const onRecovered = vi.fn();
    const { unmount } = renderHook(() =>
      useAtelierServer("/tmp/proj", { ...CONFIG, onReady, onRecovered }));
    await act(async () => { await flushMicrotasks(4); });

    unmount();
    await act(async () => { resolveA?.("http://127.0.0.1:18790/"); await flushMicrotasks(6); });

    expect(onReady).not.toHaveBeenCalled();
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it("hardReload et bumpReload incrémentent reloadKey", async () => {
    const { result } = renderHook(() => useAtelierServer("/tmp/proj", CONFIG));
    await act(async () => { await flushMicrotasks(6); });
    const k0 = result.current.reloadKey;

    await act(async () => { result.current.bumpReload(); });
    expect(result.current.reloadKey).toBe(k0 + 1);

    await act(async () => { result.current.hardReload(); await flushMicrotasks(6); });
    expect(result.current.reloadKey).toBe(k0 + 2);
  });

  it("échec start_atelier → onError, pas d'URL", async () => {
    invokeMock.mockRejectedValue(new Error("port pris"));
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAtelierServer("/tmp/proj", { ...CONFIG, onError }));
    await act(async () => { await flushMicrotasks(6); });

    expect(onError).toHaveBeenCalledWith("Error: port pris");
    expect(result.current.atelierUrl).toBeNull();
  });
});
