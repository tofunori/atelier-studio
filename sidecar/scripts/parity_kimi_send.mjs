#!/usr/bin/env node
// Parité WS Rust/Node pour Kimi avec le FAUX agent ACP (plan 046, étape 11).
//
// Boote les DEUX backends en environnement isolé (ATELIER_APP_DIR temporaire,
// ATELIER_KIMI_BIN → wrapper du fixture partagé fake_kimi_acp.mjs), déroule
// les mêmes parcours sur chacun, puis compare les séquences d'événements
// NORMALISÉES (métadonnées volatiles neutralisées) :
//   1. providerStatus (entrée kimi) et setupStatus (ligne kimi, sans auth) ;
//   2. send kimi avec [permission] → réponse optionId → done ;
//   3. send kimi [cancel] → interrupt → done ok (cancelled = succès) ;
//   4. listSessions kimi (mapping natif session/list).
//
// Usage : node scripts/parity_kimi_send.mjs [--rust-bin <path>] [--keep]
// Le binaire Rust par défaut : ../rust/target/release/atelier-studio-server
// (construire avec `cargo build --release -p atelier-studio-server`).
// Sortie : rapport JSON sur stdout, exit 0 si aucune divergence.

import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const SIDECAR = resolve(HERE, "..");
const FIXTURE = resolve(SIDECAR, "../rust/crates/atelier-providers/tests/fixtures/fake_kimi_acp.mjs");
const CLIENT_ID = "00000000-0000-4000-8000-00000000c046";

function parseArgs(argv) {
  const out = { rustBin: resolve(SIDECAR, "../rust/target/release/atelier-studio-server"), keep: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--rust-bin") out.rustBin = resolve(argv[++i]);
    else if (argv[i] === "--keep") out.keep = true;
  }
  return out;
}

// --- normalisation -----------------------------------------------------------

/** Réduit un event de tour à sa substance comparable inter-backends :
 * métadonnées volatiles (ids, ts, séquence) neutralisées, deltas fusionnés
 * en amont, seuls les kinds porteurs de contrat sont conservés. */
function normalizeTurnEvents(events) {
  const out = [];
  let delta = "";
  let thinking = "";
  // Les runs `tickN` du scénario [cancel] dépendent de la latence de
  // livraison (pompe d'events batchée côté Rust) — le CONTRAT est l'arrêt
  // du tour, pas le nombre de ticks écoulés : on les replie.
  const foldTicks = (text) => text.replace(/(?:tick\d+ ?)+/g, "tick… ").trim();
  const flushDelta = () => {
    if (thinking) {
      out.push({ kind: "thinking", text: foldTicks(thinking) });
      thinking = "";
    }
    if (delta) {
      out.push({ kind: "text", text: foldTicks(delta) });
      delta = "";
    }
  };
  for (const ev of events) {
    switch (ev.kind) {
      case "delta":
        delta += ev.text ?? "";
        break;
      case "thinking_delta":
        thinking += ev.text ?? "";
        break;
      // blocs finaux : déjà couverts par la fusion des deltas
      case "text":
      case "thinking":
        break;
      case "interaction":
        flushDelta();
        out.push({
          kind: "interaction",
          interactionType: ev.interactionType,
          state: ev.state,
          title: ev.title,
          choices: (ev.choices ?? []).map((c) => c.optionId),
          fields: (ev.fields ?? []).map((f) => ({
            id: f.id,
            options: (f.options ?? []).map((o) => o.value ?? o.label),
          })),
          answerSummary: ev.answerSummary ?? null,
        });
        break;
      case "tool_update":
        flushDelta();
        out.push({ kind: "tool_update", name: ev.name, status: ev.status, source: ev.source ?? null });
        break;
      case "todos":
        flushDelta();
        out.push({ kind: "todos", items: ev.items });
        break;
      case "done":
        flushDelta();
        out.push({ kind: "done", ok: ev.ok, hasUsage: "usage" in ev && ev.usage != null });
        break;
      case "error":
        flushDelta();
        out.push({ kind: "error", message: String(ev.message ?? "").slice(0, 120) });
        break;
      default:
        break; // started/heartbeat/user provisoire : hors contrat de parité
    }
  }
  flushDelta();
  return out;
}

function diff(a, b, path = "", out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    out.push({ path, node: a ?? null, rust: b ?? null });
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diff(a?.[k], b?.[k], path ? `${path}.${k}` : k, out);
  return out;
}

// --- pilotage d'un backend ----------------------------------------------------

/** Les deux backends impriment leur health JSON (avec port) en première
 * ligne stdout — même contrat que le shell Tauri (parse_startup). */
function portFromStdout(proc, name, timeoutMs = 20000) {
  return new Promise((resolvePort, reject) => {
    let buf = "";
    const timer = setTimeout(
      () => reject(new Error(`port ${name} absent après ${timeoutMs}ms`)),
      timeoutMs,
    );
    proc.stdout.on("data", (d) => {
      buf += String(d);
      for (const line of buf.split("\n")) {
        try {
          const h = JSON.parse(line);
          if (h?.port) {
            clearTimeout(timer);
            resolvePort(h.port);
            return;
          }
        } catch {
          /* ligne partielle/non JSON */
        }
      }
    });
  });
}

function connect(port) {
  return new Promise((resolvePromise, reject) => {
    // même endpoint que le frontend (src/lib/ws.ts) : racine, token en query
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    ws.on("open", () => resolvePromise(ws));
    ws.on("error", reject);
  });
}

async function driveBackend({ name, port, projectRoot }) {
  const ws = await connect(port);
  const inbox = [];
  const waiters = [];
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    inbox.push(msg);
    for (const w of [...waiters]) {
      if (w.match(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const send = (obj) => ws.send(JSON.stringify(obj));
  const waitFor = (match, label, timeoutMs = 20000) =>
    new Promise((resolvePromise, reject) => {
      const existing = inbox.find(match);
      if (existing) return resolvePromise(existing);
      const timer = setTimeout(() => reject(new Error(`${name}: timeout ${label}`)), timeoutMs);
      waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolvePromise(m);
        },
      });
    });
  const turnEvents = (threadId) =>
    inbox.filter((m) => m.type === "event" && m.threadId === threadId).map((m) => m.event);

  send({ type: "clientHello", clientInstanceId: CLIENT_ID });

  // 1. providerStatus / setupStatus (entrée kimi seulement)
  send({ type: "providerStatus" });
  const providers = await waitFor((m) => m.type === "providerStatus", "providerStatus");
  const kimiProvider = (providers.providers ?? []).find((p) => p.id === "kimi") ?? null;
  send({ type: "setupStatus" });
  const setup = await waitFor((m) => m.type === "setupStatus", "setupStatus");
  const kimiSetup = (setup.status?.providers ?? []).find((p) => p.id === "kimi") ?? null;

  // 2. send [permission] → réponse optionId → done
  const t1 = "parity-kimi-perm";
  send({
    type: "send",
    threadId: t1,
    projectRoot,
    provider: "kimi",
    prompt: "salut [permission]",
  });
  const pending = await waitFor(
    (m) =>
      m.type === "event" &&
      m.threadId === t1 &&
      m.event?.kind === "interaction" &&
      m.event?.state === "pending",
    "interaction pending",
  );
  send({
    type: "interactionResponse",
    threadId: t1,
    requestId: pending.event.requestId,
    clientInstanceId: CLIENT_ID,
    response: { optionId: "approve_once" },
  });
  await waitFor(
    (m) => m.type === "event" && m.threadId === t1 && m.event?.kind === "done",
    "done permission",
  );

  // 3. send [cancel] → interrupt → done (cancelled = succès)
  const t2 = "parity-kimi-cancel";
  send({ type: "send", threadId: t2, projectRoot, provider: "kimi", prompt: "[cancel]" });
  await waitFor(
    (m) => m.type === "event" && m.threadId === t2 && m.event?.kind === "delta",
    "premier delta cancel",
  );
  send({ type: "interrupt", threadId: t2 });
  await waitFor(
    (m) => m.type === "event" && m.threadId === t2 && m.event?.kind === "done",
    "done cancel",
  );

  // 4. listSessions kimi (fixture : 2 sessions, cwd distincts)
  send({ type: "listSessions", provider: "kimi", projectRoot: "" });
  const sessions = await waitFor((m) => m.type === "sessions", "sessions");

  ws.close();
  return {
    provider: kimiProvider
      ? {
          models: kimiProvider.models,
          defaultModel: kimiProvider.defaultModel,
          capabilities: kimiProvider.capabilities,
        }
      : null,
    setup: kimiSetup
      ? {
          auth: kimiSetup.auth,
          installed: kimiSetup.installed,
          models: kimiSetup.models,
          loginCommand: kimiSetup.loginCommand ?? null,
        }
      : null,
    permissionTurn: normalizeTurnEvents(turnEvents(t1)),
    cancelTurn: normalizeTurnEvents(turnEvents(t2)),
    sessions: (sessions.sessions ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      mtime: s.mtime,
      projectRoot: s.projectRoot ?? "",
    })),
  };
}

// --- main ---------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.rustBin)) {
    console.error(
      `binaire rust absent: ${args.rustBin}\n` +
        "construire avec: cargo build --release -p atelier-studio-server --manifest-path rust/Cargo.toml",
    );
    process.exit(2);
  }

  const work = mkdtempSync(join(tmpdir(), "parity-kimi-"));
  const wrapper = join(work, "kimi");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${FIXTURE}" "$@"\n`);
  chmodSync(wrapper, 0o755);
  const projectRoot = join(work, "proj");
  const dirs = { node: join(work, "app-node"), rust: join(work, "app-rust") };
  for (const d of [projectRoot, dirs.node, dirs.rust]) {
    mkdirSync(d, { recursive: true });
  }

  const env = {
    ...process.env,
    ATELIER_KIMI_BIN: wrapper,
    ATELIER_TOKEN: "",
  };
  const children = [];
  const startedAt = Date.now();
  const nodeProc = spawn(process.execPath, [join(SIDECAR, "index.mjs")], {
    env: { ...env, ATELIER_APP_DIR: dirs.node },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(nodeProc);
  const nodePort = portFromStdout(nodeProc, "node");
  const rustProc = spawn(args.rustBin, [], {
    env: { ...env, ATELIER_APP_DIR: dirs.rust, ATELIER_SKIP_SINGLE_INSTANCE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(rustProc);
  const rustPort = portFromStdout(rustProc, "rust");
  let stderrTail = { node: "", rust: "" };
  nodeProc.stderr.on("data", (d) => (stderrTail.node = (stderrTail.node + d).slice(-2000)));
  rustProc.stderr.on("data", (d) => (stderrTail.rust = (stderrTail.rust + d).slice(-2000)));

  const cleanup = () => {
    for (const c of children) {
      try {
        c.kill("SIGTERM");
      } catch {
        /* déjà mort */
      }
    }
    if (!parseArgs(process.argv).keep) {
      setTimeout(() => rmSync(work, { recursive: true, force: true }), 500);
    }
  };
  process.on("exit", cleanup);

  try {
    const [nodePortValue, rustPortValue] = await Promise.all([nodePort, rustPort]);
    const nodeResult = await driveBackend({ name: "node", port: nodePortValue, projectRoot });
    const rustResult = await driveBackend({ name: "rust", port: rustPortValue, projectRoot });
    const divergences = diff(nodeResult, rustResult);
    const report = {
      ok: divergences.length === 0,
      durationMs: Date.now() - startedAt,
      divergences,
      node: nodeResult,
      rust: rustResult,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(divergences.length === 0 ? 0 : 1);
  } catch (e) {
    console.error(String(e?.stack ?? e));
    console.error("--- stderr node ---\n" + stderrTail.node);
    console.error("--- stderr rust ---\n" + stderrTail.rust);
    process.exit(2);
  }
}

main();
