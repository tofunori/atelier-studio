import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PROJECT,
  STUDIO,
  expandHome,
  readJsonRequest,
  sendJson,
  spawnCollect,
} from "../shared.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function claudeDir() {
  return expandHome("~/.claude");
}

function quoteFile() {
  return path.join(claudeDir(), "fig-last-quote.txt");
}

function selectionFile() {
  return path.join(claudeDir(), "fig-selection.json");
}

function pdfAnnotStore() {
  return path.join(PROJECT, ".fig_thumbs", "pdf_annots.json");
}

function oneline(msg) {
  return String(msg).split(/\r?\n/).map((p) => p.trim()).filter(Boolean).join("  \u00b7  ");
}

function cmuxEnv() {
  const env = { ...process.env };
  try {
    const pw = fs.readFileSync(expandHome("~/.config/cmux/.gallery-socket-pw"), "utf8").trim();
    if (pw) env.CMUX_SOCKET_PASSWORD = pw;
  } catch {
    // optional socket password
  }
  return env;
}

async function commandOk(cmd, args, options = {}) {
  const r = await spawnCollect(cmd, args, options);
  return r.code === 0;
}

async function sendToTarget(target, msg, direct) {
  if (STUDIO || !target || !target.id) return false;
  try {
    if (target.app === "muxy") {
      if (!await commandOk("muxy", ["send", "--pane", String(target.id), oneline(msg)], { timeoutMs: 5000 })) return false;
      if (direct) {
        await sleep(400);
        await spawnCollect("muxy", ["send-keys", "--pane", String(target.id), "Enter"], { timeoutMs: 5000 });
      }
      return true;
    }
    if (target.app === "orca") {
      const args = ["terminal", "send", "--terminal", String(target.id), "--text", msg];
      if (direct) args.push("--enter");
      return commandOk("orca", args, { timeoutMs: 8000 });
    }
    if (target.app === "cmux") {
      if (!await commandOk("cmux", ["send", "--surface", String(target.id), msg], { env: cmuxEnv(), timeoutMs: 5000 })) return false;
      if (direct) {
        await sleep(400);
        await spawnCollect("cmux", ["send-key", "--surface", String(target.id), "enter"], { env: cmuxEnv(), timeoutMs: 5000 });
      }
      return true;
    }
  } catch {
    // optional integration
  }
  return false;
}

async function cmuxAllClaudeSurfaces() {
  const r = await spawnCollect("cmux", ["tree", "--all"], { env: cmuxEnv(), timeoutMs: 5000 });
  if (r.code !== 0) return [];
  const out = [];
  let wsTitle = "";
  let wsActive = false;
  for (const line of (r.out || "").split(/\r?\n/)) {
    const wm = /workspace\s+(workspace:\d+)\s+"([^"]*)"(.*)$/.exec(line);
    if (wm) {
      wsTitle = wm[2];
      wsActive = wm[3].includes("active") || wm[3].includes("[selected]");
      continue;
    }
    const sm = /surface\s+(surface:\d+)\s+\[terminal\]\s+"([^"]*)"(.*)$/.exec(line);
    if (!sm || !/[\u2733\u2800-\u28ff]/.test(sm[2])) continue;
    out.push({
      ref: sm[1],
      title: sm[2].replace(/^[\u2733\u2800-\u28ff\s]+/, "").trim(),
      ws: wsTitle,
      selectedInWs: sm[3].includes("[selected]"),
      wsActive,
    });
  }
  return out;
}

async function findClaudeSurface() {
  if (STUDIO) return null;
  try {
    const surfaces = await cmuxAllClaudeSurfaces();
    if (surfaces.length === 1) return surfaces[0].ref;
    if (surfaces.length > 1) {
      surfaces.sort((a, b) => Number(!(a.wsActive && a.selectedInWs)) - Number(!(b.wsActive && b.selectedInWs))
        || Number(!a.selectedInWs) - Number(!b.selectedInWs)
        || Number(!a.wsActive) - Number(!b.wsActive));
      return surfaces[0].ref;
    }
  } catch {
    // fall through to registry
  }
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(path.join(claudeDir(), "cmux-sessions.json"), "utf8"));
  } catch {
    return null;
  }
  const alive = [];
  for (const e of [...entries].sort((a, b) => (b.registered_at || 0) - (a.registered_at || 0))) {
    if (!e.shell_pid || !e.surface_id) continue;
    try {
      process.kill(Number(e.shell_pid), 0);
      alive.push(String(e.surface_id).toUpperCase());
    } catch {
      // dead
    }
  }
  return alive[0] || null;
}

async function findMuxyClaudePane() {
  if (STUDIO) return null;
  try {
    const r = await spawnCollect("muxy", ["list-panes"], { timeoutMs: 5000 });
    if (r.code !== 0) return null;
    const root = fs.realpathSync(PROJECT);
    const inProject = [];
    const anywhere = [];
    for (const line of (r.out || "").split(/\r?\n/)) {
      const parts = line.split("\t");
      if (parts.length < 3 || !/[\u2733\u2802]|Claude/.test(parts[1])) continue;
      const active = parts.length > 3 && parts[3].trim() === "true";
      let cw = "";
      try {
        cw = parts[2] ? fs.realpathSync(parts[2]) : "";
      } catch {
        cw = "";
      }
      const entry = [active ? 0 : 1, parts[0]];
      (cw === root || cw.startsWith(root + path.sep) ? inProject : anywhere).push(entry);
    }
    for (const pool of [inProject, anywhere]) {
      if (pool.length) return pool.sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1])))[0][1];
    }
  } catch {
    // optional integration
  }
  return null;
}

async function findOrcaClaudeTerminal() {
  if (STUDIO) return null;
  try {
    const r = await spawnCollect("orca", ["terminal", "list", "--worktree", `path:${fs.realpathSync(PROJECT)}`, "--json"], {
      timeoutMs: 5000,
    });
    if (r.code !== 0) return null;
    const data = JSON.parse(r.out || "null");
    const terms = Array.isArray(data) ? data : data?.terminals || data?.result?.terminals || [];
    for (const t of terms || []) {
      if (JSON.stringify(t).toLowerCase().includes("claude")) return t.handle || t.id || null;
    }
  } catch {
    // optional integration
  }
  return null;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function listClaudeTargets() {
  if (STUDIO) return [];
  const targets = [];
  const root = fs.realpathSync(PROJECT);
  try {
    const r = await spawnCollect("muxy", ["list-panes"], { timeoutMs: 5000 });
    for (const line of (r.out || "").split(/\r?\n/)) {
      const parts = line.split("\t");
      if (parts.length < 3 || !/[\u2733\u2802]|Claude/.test(parts[1])) continue;
      let cw = "";
      try {
        cw = parts[2] ? fs.realpathSync(parts[2]) : "";
      } catch {
        cw = parts[2] ? path.resolve(parts[2]) : "";
      }
      targets.push({
        app: "muxy",
        id: parts[0],
        title: parts[1].replace(/^[\u2733\u2802 ]+/, "").trim().slice(0, 80),
        cwd: parts[2],
        inProject: cw === root || cw.startsWith(root + path.sep),
        active: parts.length > 3 && parts[3].trim() === "true",
      });
    }
  } catch {
    // optional integration
  }
  try {
    const r = await spawnCollect("orca", ["terminal", "list", "--json"], { timeoutMs: 5000 });
    const data = JSON.parse(r.out || "null");
    const terms = Array.isArray(data) ? data : data?.terminals || data?.result?.terminals || [];
    for (const t of terms || []) {
      if (!JSON.stringify(t).toLowerCase().includes("claude")) continue;
      const cw = String(t.worktreePath || t.cwd || t.path || "");
      let cwr = "";
      try {
        cwr = cw ? fs.realpathSync(cw) : "";
      } catch {
        cwr = "";
      }
      targets.push({
        app: "orca",
        id: t.handle || t.id,
        title: String(t.title || t.name || "Claude").replace(/^[\u2733\u2802 ]+/, "").trim().slice(0, 80),
        cwd: cw,
        inProject: Boolean(cwr) && (cwr === root || cwr.startsWith(root + path.sep)),
        active: Boolean(t.focused || t.active),
      });
    }
  } catch {
    // optional integration
  }
  try {
    for (const s of await cmuxAllClaudeSurfaces()) {
      targets.push({
        app: "cmux",
        id: s.ref,
        title: `${s.title} \u2014 ${s.ws}`.slice(0, 80),
        cwd: "",
        inProject: true,
        active: s.selectedInWs,
      });
    }
  } catch {
    // optional integration
  }
  targets.sort((a, b) => Number(!a.active) - Number(!b.active) || Number(!a.inProject) - Number(!b.inProject));
  return targets;
}

export async function handleAnnotationGet(req, res, url) {
  const pathname = url.pathname;
  if (pathname === "/claude-targets") {
    try {
      return sendJson(res, 200, { targets: await listClaudeTargets() });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/pdfannot") {
    const rel = url.searchParams.get("rel") || "";
    const store = readJson(pdfAnnotStore(), {});
    return sendJson(res, 200, { annots: store[rel] || [] });
  }
  if (pathname === "/quote") {
    try {
      const qf = quoteFile();
      const pending = fs.existsSync(qf)
        && fs.readFileSync(qf, "utf8").slice(0, 500).includes("Annotations")
        && (Date.now() / 1000 - fs.statSync(qf).mtimeMs / 1000) < 900;
      return sendJson(res, 200, { pending: Boolean(pending) });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  return false;
}

export async function handleAnnotationPost(req, res, url) {
  const pathname = url.pathname;
  if (pathname === "/pdfannot") {
    try {
      const payload = await readJsonRequest(req);
      const storePath = pdfAnnotStore();
      const store = readJson(storePath, {});
      const relKey = payload.rel || "";
      const newAnnots = payload.annots || [];
      if ((!newAnnots || (Array.isArray(newAnnots) && newAnnots.length === 0)) && store[relKey]) {
        try {
          fs.writeFileSync(`${storePath}.bak`, JSON.stringify(store));
        } catch {
          // backup is best-effort in the Python server
        }
      }
      store[relKey] = newAnnots;
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(store));
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/clear-quote") {
    try {
      fs.writeFileSync(quoteFile(), "");
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/selinfo") {
    try {
      const payload = await readJsonRequest(req);
      const p = selectionFile();
      // truthiness Python : [] est falsy — un tableau vide efface la sélection
      if (Array.isArray(payload.lines) ? payload.lines.length > 0 : payload.lines) {
        payload.ts = Date.now() / 1000;
        fs.writeFileSync(p, JSON.stringify(payload));
      } else if (fs.existsSync(p)) {
        fs.rmSync(p);
      }
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { error: String(error.message || error) });
    }
  }
  if (pathname === "/quote") {
    try {
      const payload = await readJsonRequest(req);
      const pdf = path.join(PROJECT, payload.rel);
      const page = payload.page;
      const loc = page !== undefined && page !== null && page !== "" && page !== "html" ? ` (p.${page})` : "";
      let msg = `${pdf}${loc} : \u00ab ${String(payload.text).trim()} \u00bb `;
      const comment = String(payload.comment || "").trim();
      if (comment) msg = `${msg.trimEnd()}\nCommentaire : ${comment}`;
      const direct = Boolean(payload.direct);
      const short = `\u270f\ufe0f Regarde mon annotation (${path.basename(payload.rel)}${loc}${comment ? ", avec commentaire" : ""}) et agis en cons\u00e9quence.`;
      if (!STUDIO) {
        await spawnCollect("pbcopy", [], { timeoutMs: 5000, env: process.env, input: msg });
        fs.writeFileSync(quoteFile(), msg);
      }
      if (payload.embed || STUDIO) return sendJson(res, 200, { embedded: true, message: msg });
      let sent = false;
      if (payload.target && typeof payload.target === "object") sent = await sendToTarget(payload.target, short, direct);
      const ref = sent ? null : await findClaudeSurface();
      if (ref) {
        sent = await commandOk("cmux", ["send", "--surface", ref, short], { env: cmuxEnv(), timeoutMs: 5000 });
        if (sent && direct) {
          await sleep(400);
          await spawnCollect("cmux", ["send-key", "--surface", ref, "enter"], { env: cmuxEnv(), timeoutMs: 5000 });
        }
      }
      if (!sent) {
        const pane = await findMuxyClaudePane();
        if (pane) {
          sent = await commandOk("muxy", ["send", "--pane", pane, oneline(short)], { timeoutMs: 5000 });
          if (sent && direct) {
            await sleep(400);
            await spawnCollect("muxy", ["send-keys", "--pane", pane, "Enter"], { timeoutMs: 5000 });
          }
        }
      }
      if (!sent) {
        const term = await findOrcaClaudeTerminal();
        if (term) {
          const args = ["terminal", "send", "--terminal", String(term), "--text", short];
          if (direct) args.push("--enter");
          sent = await commandOk("orca", args, { timeoutMs: 5000 });
        }
      }
      return sendJson(res, 200, { sentToClaude: sent, clipboard: true, submitted: sent && direct });
    } catch (error) {
      return sendJson(res, 400, { error: `bad request: ${String(error.message || error)}` });
    }
  }
  return false;
}
