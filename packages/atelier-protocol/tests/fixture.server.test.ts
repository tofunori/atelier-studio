import { afterAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startFixtureServer, type FixtureServer } from "../src/fixture/server.ts";
import { smallTranscript } from "../src/transcripts/build.ts";

function onceMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout ws message")), 3000);
    ws.once("message", (data) => {
      clearTimeout(t);
      resolve(JSON.parse(String(data)));
    });
  });
}

describe("fixture HTTP/WS server", () => {
  let server: FixtureServer;

  it("health expose protocolVersion", async () => {
    server = await startFixtureServer({ scenario: "small" });
    const res = await fetch(`${server.url}/health`);
    const body = (await res.json()) as { ok: boolean; protocolVersion: number };
    expect(body.ok).toBe(true);
    expect(body.protocolVersion).toBe(1);
  });

  it("WS hello + getHistory", async () => {
    if (!server) server = await startFixtureServer({ scenario: "small" });
    const ws = new WebSocket(server.wsUrl);
    await new Promise<void>((res, rej) => {
      ws.once("open", () => res());
      ws.once("error", rej);
    });
    ws.send(
      JSON.stringify({
        type: "clientHello",
        protocolVersion: 1,
        clientInstanceId: "ws-test",
        clientKind: "test",
      }),
    );
    const hello = (await onceMessage(ws)) as { type: string };
    expect(hello.type).toBe("serverHello");

    const t = smallTranscript();
    ws.send(JSON.stringify({ type: "getHistory", threadId: t.threadId }));
    const hist = (await onceMessage(ws)) as { type: string; events: unknown[] };
    expect(hist.type).toBe("history");
    expect(hist.events.length).toBe(t.events.length);
    ws.close();
  });

  afterAll(async () => {
    if (server) await server.close();
  });
});
