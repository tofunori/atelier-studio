import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
const LOG = "/tmp/atelier-spy.log";
const LOCK = process.env.HOME + "/Library/Application Support/atelier-studio/sidecar.lock";
let curPort = null, ws = null;
function log(s){ appendFileSync(LOG, s + "\n"); }
function connect() {
  let info;
  try { info = JSON.parse(readFileSync(LOCK, "utf8")); } catch { return; }
  if (!info.port) return;
  if (ws && curPort === info.port && ws.readyState === 1) return;
  if (ws) { try { ws.terminate(); } catch {} }
  curPort = info.port;
  ws = new WebSocket(`ws://127.0.0.1:${info.port}/?token=${info.token}`);
  ws.on("open", () => log(new Date().toISOString().slice(11,19) + " SPY branché port " + info.port));
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === "threads") return;
    log(new Date().toISOString().slice(11,19) + " " + m.type +
      (m.note ? " NOTE: " + m.note : "") + (m.event?.kind ? " kind=" + m.event.kind : "") +
      (m.status ? " status=" + m.status : "") + (m.verdict ? " verdict=" + m.verdict : "") +
      (m.threadId ? " tid=" + String(m.threadId).slice(0,8) : ""));
  });
  ws.on("close", () => { curPort = null; });
  ws.on("error", () => { curPort = null; });
}
setInterval(connect, 1500);
connect();
