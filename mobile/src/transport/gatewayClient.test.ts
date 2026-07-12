import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchHealth,
  getHistory,
  listThreads,
  pairDevice,
  probeGateway,
} from "./gatewayClient.ts";
import type { DeviceCredentials } from "./types.ts";

const creds: DeviceCredentials = {
  deviceId: "d1",
  token: "tok",
  name: "iPhone",
  scopes: ["chat:read"],
  gatewayBaseUrl: "http://127.0.0.1:18765",
  pairedAt: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      return handler(url, init);
    }),
  );
}

describe("gatewayClient", () => {
  it("fetchHealth", async () => {
    mockFetch(() =>
      Response.json({ ok: true, protocolVersion: 1, service: "atelier-remote-gateway" }),
    );
    const h = await fetchHealth("http://127.0.0.1:18765/");
    expect(h.ok).toBe(true);
    expect(h.protocolVersion).toBe(1);
  });

  it("pairDevice envoie protocolVersion", async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.protocolVersion).toBe(1);
      expect(body.code).toBe("ABCD");
      return Response.json({
        ok: true,
        deviceId: "x",
        token: "t",
        scopes: ["chat:read"],
        name: "iPhone",
      });
    });
    const r = await pairDevice({
      baseUrl: "http://127.0.0.1:18765",
      code: "ABCD",
      deviceName: "iPhone",
    });
    expect(r.token).toBe("t");
  });

  it("listThreads et getHistory avec token device", async () => {
    mockFetch((url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-atelier-device-token")).toBe("tok");
      if (url.includes("/threads/") && url.includes("/history")) {
        return Response.json({
          threadId: "th1",
          events: Array.from({ length: 25 }, (_, i) => ({
            kind: i % 2 === 0 ? "user" : "text",
            text: `m${i}`,
            meta: { eventId: `e${i}`, sequence: i + 1 },
          })),
          fromSequence: 1,
          toSequence: 25,
          complete: true,
        });
      }
      return Response.json({
        threads: [
          {
            id: "th1",
            title: "Test",
            provider: "claude",
            status: "idle",
            updatedAt: "2026-01-01",
            projectId: null,
            lastSequence: 25,
          },
        ],
      });
    });
    const threads = await listThreads(creds);
    expect(threads).toHaveLength(1);
    const hist = await getHistory(creds, "th1");
    expect(hist.events.length).toBe(25);
  });

  it("probeGateway détecte version incompatible", async () => {
    mockFetch(() =>
      Response.json({
        ok: true,
        protocolVersion: 9,
        minProtocolVersion: 9,
        maxProtocolVersion: 9,
      }),
    );
    const r = await probeGateway("http://127.0.0.1:18765");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("version_incompatible");
  });

  it("probeGateway offline", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const r = await probeGateway("http://127.0.0.1:9");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("offline");
  });

  it("sendMessage envoie clientRequestId", async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.clientRequestId).toBe("cr1");
      expect(body.threadId).toBe("th1");
      return Response.json({ ok: true, accepted: true });
    });
    const { sendMessage } = await import("./gatewayClient.ts");
    const r = await sendMessage(creds, {
      threadId: "th1",
      prompt: "hi",
      clientRequestId: "cr1",
    });
    expect(r.accepted).toBe(true);
  });
});
