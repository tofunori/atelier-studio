import { WebSocketServer } from "ws";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { route } from "./router.mjs";
import { ThreadStore } from "./store.mjs";
import * as catalog from "./catalog.mjs";
import * as history from "./history.mjs";
import { watchAnnotations } from "./annotations.mjs";
import * as claude from "./providers/claude.mjs";
import * as codex from "./providers/codex.mjs";

const store = new ThreadStore(
  `${homedir()}/Library/Application Support/atelier-studio/threads.json`,
);
const providers = { claude, codex };

const PASTE_DIR = `${homedir()}/Library/Application Support/atelier-studio/pasted`;
function saveImage(ext, base64) {
  mkdirSync(PASTE_DIR, { recursive: true });
  const path = `${PASTE_DIR}/coller-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
  writeFileSync(path, Buffer.from(base64, "base64"));
  return path;
}

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });

// broadcast: les events d'un run en cours atteignent tous les clients,
// y compris après un reload de la fenêtre (nouvelle connexion WS).
function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

wss.on("listening", () => {
  console.log(JSON.stringify({ port: wss.address().port }));
});

watchAnnotations(broadcast);

wss.on("connection", (ws) => {
  const ctx = {
    send: (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj)),
    broadcast,
    store,
    providers,
    catalog,
    history,
    saveImage,
  };
  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return ctx.send({ type: "error", message: "JSON invalide" });
    }
    try {
      await route(msg, ctx);
    } catch (e) {
      ctx.send({ type: "error", threadId: msg.threadId, message: String(e) });
    }
  });
});
