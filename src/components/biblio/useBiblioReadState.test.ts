import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../lib/i18n";
import { useBiblioReadState } from "./useBiblioReadState";

const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

describe("manual reading status", () => {
  beforeEach(() => setLanguage("fr"));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("loads shared status after changing projects and unmarks a read item", async () => {
    const stored = new Set<string>();
    const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
      if (options?.method === "POST") {
        const { key, read } = JSON.parse(options.body as string);
        if (read) stored.add(key); else stored.delete(key);
        return response({ key, read });
      }
      return response({ readKeys: [...stored] });
    });
    vi.stubGlobal("fetch", request);
    const first = renderHook(({ url }) => useBiblioReadState(url), {
      initialProps: { url: "http://localhost:19000/#atelier_token=secret" },
    });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await act(() => first.result.current.setRead("ARTICLE1", true));
    expect(first.result.current.readKeys.has("ARTICLE1")).toBe(true);
    expect(request.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer secret" });
    first.rerender({ url: "http://localhost:19760/" });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.readKeys.has("ARTICLE1")).toBe(true);
    first.unmount();
    const reopened = renderHook(() => useBiblioReadState("http://localhost:19760/"));
    await waitFor(() => expect(reopened.result.current.ready).toBe(true));
    expect(reopened.result.current.readKeys.has("ARTICLE1")).toBe(true);
    await act(() => reopened.result.current.setRead("ARTICLE1", false));
    expect(stored.size).toBe(0);
    expect(reopened.result.current.readKeys.size).toBe(0);
  });

  it("does not display saved success on failure and permits retry", async () => {
    const request = vi.fn().mockResolvedValueOnce(response({ readKeys: [] }))
      .mockResolvedValueOnce(response({}, false)).mockResolvedValueOnce(response({ key: "ARTICLE1", read: true }));
    vi.stubGlobal("fetch", request);
    const { result } = renderHook(() => useBiblioReadState("http://localhost:19000/"));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.setRead("ARTICLE1", true));
    expect(result.current.readKeys.has("ARTICLE1")).toBe(false);
    expect(result.current.error).toContain("n’a pas pu être enregistré");
    expect(result.current.pending.size).toBe(0);
    await act(() => result.current.setRead("ARTICLE1", true));
    expect(result.current.error).toBeNull();
    expect(result.current.readKeys.has("ARTICLE1")).toBe(true);
  });

  it("ignores a stale refresh and blocks double submissions while saving", async () => {
    const oldLoad = deferred<Response>();
    const saving = deferred<Response>();
    const request = vi.fn().mockResolvedValueOnce(response({ readKeys: [] }))
      .mockReturnValueOnce(oldLoad.promise).mockReturnValueOnce(saving.promise);
    vi.stubGlobal("fetch", request);
    const { result } = renderHook(() => useBiblioReadState("http://localhost:19000/"));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => { result.current.refresh(); });
    let save!: Promise<void>;
    act(() => { save = result.current.setRead("ARTICLE1", true); });
    await act(() => result.current.setRead("ARTICLE1", true));
    expect(request).toHaveBeenCalledTimes(3);
    await act(async () => { saving.resolve(response({ key: "ARTICLE1", read: true })); await save; });
    await act(async () => { oldLoad.resolve(response({ readKeys: [] })); });
    expect(result.current.readKeys.has("ARTICLE1")).toBe(true);
  });

  it("ignores replies from the previous project", async () => {
    const oldLoad = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(oldLoad.promise)
      .mockResolvedValueOnce(response({ readKeys: ["ARTICLE2"] })));
    const { result, rerender } = renderHook(({ url }) => useBiblioReadState(url), {
      initialProps: { url: "http://localhost:19000/" },
    });
    rerender({ url: "http://localhost:19760/" });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { oldLoad.resolve(response({ readKeys: ["ARTICLE1"] })); });
    expect([...result.current.readKeys]).toEqual(["ARTICLE2"]);
  });

  it("refreshes the new project when the previous project's save finishes", async () => {
    const saving = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ readKeys: [] }))
      .mockReturnValueOnce(saving.promise).mockResolvedValueOnce(response({ readKeys: [] }))
      .mockResolvedValueOnce(response({ readKeys: ["ARTICLE1"] })));
    const { result, rerender } = renderHook(({ url }) => useBiblioReadState(url), {
      initialProps: { url: "http://localhost:19000/" },
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    let save!: Promise<void>;
    act(() => { save = result.current.setRead("ARTICLE1", true); });
    rerender({ url: "http://localhost:19760/" });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { saving.resolve(response({ key: "ARTICLE1", read: true })); await save; });
    await waitFor(() => expect(result.current.readKeys.has("ARTICLE1")).toBe(true));
  });

  it("disables writes after a load error and recovers on focus", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ readKeys: [] }));
    vi.stubGlobal("fetch", request);
    const { result } = renderHook(() => useBiblioReadState("http://localhost:19000/"));
    await waitFor(() => expect(result.current.error).toContain("indisponible"));
    await act(() => result.current.setRead("ARTICLE1", true));
    expect(request).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it("defers another project's change notification while saving", async () => {
    const saving = deferred<Response>();
    const request = vi.fn().mockResolvedValueOnce(response({ readKeys: [] }))
      .mockReturnValueOnce(saving.promise)
      .mockResolvedValueOnce(response({ readKeys: ["ARTICLE1", "ARTICLE2"] }));
    vi.stubGlobal("fetch", request);
    const { result } = renderHook(() => useBiblioReadState("http://localhost:19000/"));
    await waitFor(() => expect(result.current.ready).toBe(true));
    let save!: Promise<void>;
    act(() => { save = result.current.setRead("ARTICLE1", true); });
    act(() => { window.dispatchEvent(new Event("zotero-reading-changed")); });
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => { saving.resolve(response({ key: "ARTICLE1", read: true })); await save; });
    await waitFor(() => expect([...result.current.readKeys]).toEqual(["ARTICLE1", "ARTICLE2"]));
  });
});
