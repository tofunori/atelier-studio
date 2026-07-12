/**
 * Minimal HTTP + WebSocket fixture server (plan 034 jalon B).
 * Loopback only. No auth token (fixture) — real gateway is jalon C.
 */
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { FixtureEngine, type FixtureEngineOptions } from "./engine.ts";
import type { ServerWireMessage } from "../envelopes.ts";

export type FixtureServer = {
  port: number;
  url: string;
  wsUrl: string;
  engine: FixtureEngine;
  close: () => Promise<void>;
};

function send(ws: WebSocket, msg: ServerWireMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export async function startFixtureServer(
  opts: FixtureEngineOptions & { port?: number; host?: string } = {},
): Promise<FixtureServer> {
  const host = opts.host ?? "127.0.0.1";
  const engine = new FixtureEngine(opts);
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/remote/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "atelier-fixture",
          protocolVersion: 1,
          minProtocolVersion: 1,
          maxProtocolVersion: 1,
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    const session = engine.newSession();
    ws.on("message", (data) => {
      const raw = String(data);
      const replies = engine.handleRaw(session, raw);
      for (const r of replies) send(ws, r);

      // After successful hello on gap/stream scenarios, do not auto-stream;
      // client must getHistory. Optional: if message is getHistory with after 0
      // and client wants live, tests drive streamEvents separately.
      try {
        const msg = JSON.parse(raw) as { type?: string; threadId?: string; stream?: boolean };
        if (msg.type === "getHistory" && msg.stream === true && msg.threadId) {
          for (const ev of engine.streamEvents(msg.threadId)) send(ws, ev);
        }
      } catch {
        /* already handled */
      }
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else reject(new Error("bind failed"));
    });
  });

  return {
    port,
    url: `http://${host}:${port}`,
    wsUrl: `ws://${host}:${port}`,
    engine,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
