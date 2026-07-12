import { afterEach, describe, expect, it, vi } from "vitest";
import { assertNoPathInRequest, fetchFileById, fetchGalleryIndex } from "./filesClient.ts";
import type { DeviceCredentials } from "./types.ts";

const creds: DeviceCredentials = {
  deviceId: "d",
  token: "tok",
  name: "iPhone",
  scopes: ["gallery:read", "files:read"],
  gatewayBaseUrl: "http://127.0.0.1:18765",
  pairedAt: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("filesClient", () => {
  it("gallery index uses projectId only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain("/remote/v1/gallery/p_abc");
        expect(url).not.toContain("..");
        return Response.json({
          projectId: "p_abc",
          items: [
            {
              fileId: "f_1",
              name: "plot.png",
              size: 100,
              ext: "png",
              kind: "figure",
              modifiedAt: 1,
              etag: "1-1",
            },
          ],
          count: 1,
        });
      }),
    );
    const idx = await fetchGalleryIndex(creds, "p_abc");
    expect(idx.items[0].fileId).toBe("f_1");
  });

  it("file by opaque id + range/etag headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toMatch(/\/remote\/v1\/file\/f_xyz$/);
        expect(url).not.toContain("..");
        const h = new Headers(init?.headers);
        expect(h.get("x-atelier-device-token")).toBe("tok");
        expect(h.get("Range")).toBe("bytes=0-99");
        expect(h.get("If-None-Match")).toBe('"etag1"');
        return new Response("hello", {
          status: 206,
          headers: { etag: '"etag1"', "content-type": "text/plain" },
        });
      }),
    );
    const r = await fetchFileById(creds, "f_xyz", {
      range: "bytes=0-99",
      ifNoneMatch: '"etag1"',
    });
    expect(r.status).toBe(206);
    expect(await r.blob.text()).toBe("hello");
  });

  it("assertNoPathInRequest rejects traversal", () => {
    expect(() => assertNoPathInRequest("/remote/v1/files/p/%2e%2e/etc")).toThrow();
    expect(() => assertNoPathInRequest("/remote/v1/file/f_ok")).not.toThrow();
  });
});
