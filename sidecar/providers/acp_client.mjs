// Client ACP processus partagé générique (plan 046, étape 9).
//
// Extraction mécanique du cycle de vie éprouvé d'opencode.mjs (plan 045) :
// spawn singleton + handshake initialize single-flight, framing NDJSON,
// pending RPC, garde anti-lignes-tardives d'un ancien process, reset à l'exit.
// Ajouts du plan 046 (parité avec rust acp_rpc.rs) :
//  - erreurs STRUCTURÉES (AcpRpcError: code/message/data/transport) ;
//  - résultat initialize mémorisé par génération ;
//  - requêtes serveur→client dispatchées vers un handler par session (ou la
//    politique par défaut du provider), sync OU async, SANS bloquer le
//    parsing du flux — une permission qui attend l'utilisateur ne bloque ni
//    les session/update ni les autres sessions ;
//  - AUCUNE auto-approbation générique : sans handler, une permission reçoit
//    {"outcome":{"outcome":"cancelled"}} et toute autre méthode -32601.

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { parseAcpLines, acpMethodNotFoundResponse } from "./acp_common.mjs";

/** Erreur ACP structurée — miroir de AcpRpcError (rust/acp_rpc.rs).
 * `transport === true` : process mort/absent/muet (spawn, EOF, timeout).
 * Sinon erreur applicative JSON-RPC : -32000 authRequired, -32602
 * invalidParams/session inconnue, -32601 méthode absente. */
export class AcpRpcError extends Error {
  constructor(message, { code = null, data = null, transport = false } = {}) {
    super(message);
    this.name = "AcpRpcError";
    this.code = code;
    this.data = data;
    this.transport = transport;
  }
  get authRequired() {
    return this.code === -32000;
  }
  get invalidParams() {
    return this.code === -32602;
  }
}

const transportError = (message) => new AcpRpcError(message, { transport: true });

/** Réponse sûre quand AUCUN handler ne prend la requête serveur→client. */
function fallbackReplyBody(method) {
  if (method === "session/request_permission") {
    return { result: { outcome: { outcome: "cancelled" } } };
  }
  const { error } = acpMethodNotFoundResponse(0, method);
  return { error };
}

/**
 * Crée un client ACP partagé pour UN provider.
 *
 * @param {object} opts
 * @param {string} opts.label                 nom court pour les messages d'erreur
 * @param {() => string} opts.binPath         binaire résolu (réévalué à chaque ensure)
 * @param {string[]} [opts.args]              arguments (défaut ["acp"])
 * @param {object} opts.initParams            params d'initialize
 * @param {(method, params) => any} [opts.onServerRequest]
 *        politique par défaut : retourne le corps `result` (objet), une
 *        promesse de corps, ou null/undefined ⇒ repli sûr (cancelled/-32601).
 * @param {number} [opts.handshakeTimeoutMs]
 */
export function makeAcpClient({
  label,
  binPath,
  args = ["acp"],
  initParams,
  onServerRequest = null,
  handshakeTimeoutMs = 10000,
}) {
  let server = null; // { proc, realBin }
  let currentProc = null; // garde anti-lignes tardives (ids JSON-RPC partagés)
  let spawnPromise = null; // single-flight
  let generation = 0;
  let initResult = null; // { generation, value }
  let nextId = 1;
  const pendingRpc = new Map(); // id -> { resolve, reject }
  const sessionHandlers = new Map(); // sessionId -> (update) => void
  const sessionServerHandlers = new Map(); // sessionId -> (method, params) => body|Promise

  function safeRealpath(p) {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  }

  function reset(err) {
    const e = err ?? transportError(`${label} acp terminé`);
    for (const { reject } of pendingRpc.values()) reject(e);
    pendingRpc.clear();
    sessionHandlers.clear();
    sessionServerHandlers.clear();
    server = null;
    // le cache initialize vit exactement aussi longtemps que son process
    initResult = null;
  }

  function handleIncoming(proc, msg) {
    // Requête serveur → client : handler par session, sinon politique du
    // provider, sinon repli sûr. Résolution potentiellement ASYNC — le
    // parsing du flux continue pendant l'attente (dispatcher non bloquant).
    if (msg.id != null && msg.method) {
      const sid = msg.params?.sessionId ?? "";
      const handler = sessionServerHandlers.get(sid) ?? onServerRequest;
      const finish = (body) => {
        const reply = body == null ? fallbackReplyBody(msg.method) : { result: body };
        // jamais écrire dans le stdin d'un REMPLAÇANT (génération)
        if (currentProc !== proc) return;
        try {
          proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...reply }) + "\n");
        } catch {
          /* process mort entre-temps : le reset a déjà drainé */
        }
      };
      if (!handler) return finish(null);
      let out;
      try {
        out = handler(msg.method, msg.params ?? {});
      } catch {
        return finish(null);
      }
      if (out && typeof out.then === "function") {
        out.then(finish, () => finish(null));
      } else {
        finish(out ?? null);
      }
      return;
    }
    // Réponse à une de nos requêtes.
    if (msg.id != null) {
      const p = pendingRpc.get(msg.id);
      if (!p) return; // réponse tardive après timeout : ignorée
      pendingRpc.delete(msg.id);
      if (msg.error) {
        p.reject(
          new AcpRpcError(msg.error.message ?? `erreur ACP ${label}`, {
            code: msg.error.code ?? null,
            data: msg.error.data ?? null,
          }),
        );
      } else {
        p.resolve(msg.result);
      }
      return;
    }
    // Notification : seul session/update est routé (par sessionId).
    if (msg.method === "session/update") {
      const sid = msg.params?.sessionId;
      const handler = sid ? sessionHandlers.get(sid) : null;
      handler?.(msg.params?.update ?? {}); // pas de handler = tour fini/replay : silence
    }
    // Autres notifications : ignorées, jamais journalisées.
  }

  function rawRequest(proc, method, params) {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      pendingRpc.set(id, { resolve, reject });
      try {
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      } catch (e) {
        pendingRpc.delete(id);
        reject(transportError(`${label}: écriture stdin: ${e?.message ?? e}`));
      }
    });
    return { id, promise };
  }

  async function spawnServer() {
    const bin = binPath();
    const proc = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
    currentProc = proc;
    generation += 1;
    const myGeneration = generation;
    // Garde par GÉNÉRATION (parité rust acp_rpc.rs) : l'exit TARDIF d'un
    // ancien process — y compris pendant le handshake de son remplaçant —
    // ne doit jamais drainer les pendings du process courant.
    proc.on("exit", () => {
      if (generation === myGeneration) reset(transportError(`${label} acp a quitté`));
    });
    proc.on("error", (e) => {
      if (generation === myGeneration) reset(transportError(`spawn ${label} acp: ${e?.message ?? e}`));
    });
    proc.stderr.on("data", () => {}); // jamais bloquer le pipe
    let carry = "";
    proc.stdout.on("data", (buf) => {
      if (currentProc !== proc) return;
      const { messages, rest } = parseAcpLines(String(buf), carry);
      carry = rest;
      for (const msg of messages) handleIncoming(proc, msg);
    });

    const earlyExit = new Promise((_, reject) => {
      proc.once("error", (e) => reject(transportError(`spawn ${label} acp: ${e?.message ?? e}`)));
      proc.once("exit", (code) =>
        reject(transportError(`${label} acp a quitté immédiatement (code ${code})`)),
      );
    });
    const timed = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(transportError(`initialize ${label}: pas de réponse sous ${handshakeTimeoutMs}ms`)),
        handshakeTimeoutMs,
      );
      rawRequest(proc, "initialize", initParams).promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
    try {
      const value = await Promise.race([timed, earlyExit]);
      initResult = { generation: myGeneration, value };
    } catch (e) {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* déjà mort */
      }
      reset(e instanceof Error ? e : transportError(String(e)));
      throw e;
    }
    server = { proc, realBin: safeRealpath(bin) };
    return server;
  }

  /** Spawn + initialize si absent/mort/binaire remplacé. Retourne le résultat
   * initialize (mémorisé par génération). Single-flight. */
  async function ensure() {
    if (server) {
      const alive = server.proc.exitCode == null && !server.proc.killed;
      if (alive && safeRealpath(binPath()) === server.realBin) {
        return initResult?.value ?? {};
      }
      try {
        server.proc.kill("SIGTERM");
      } catch {
        /* déjà mort */
      }
      reset(transportError(`${label} acp remplacé (version/process)`));
    }
    if (!spawnPromise) {
      spawnPromise = spawnServer().finally(() => {
        spawnPromise = null;
      });
    }
    await spawnPromise;
    return initResult?.value ?? {};
  }

  /** Requête JSON-RPC. `timeoutMs` optionnel : à l'échéance le pending est
   * retiré (une réponse tardive ne trouvera plus rien) et l'erreur est
   * transport. Sans timeout : attente illimitée (session/prompt). */
  function request(method, params, timeoutMs) {
    if (!server) return Promise.reject(transportError(`${label} acp absent`));
    const { id, promise } = rawRequest(server.proc, method, params);
    if (!timeoutMs) return promise;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRpc.delete(id); // la réponse tardive ne trouvera plus rien
        reject(transportError(`${method}: pas de réponse sous ${timeoutMs}ms`));
      }, timeoutMs);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  function notify(method, params) {
    if (!server) return;
    try {
      server.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    } catch {
      /* best-effort */
    }
  }

  function stop(reason = `${label} acp arrêté`) {
    if (server?.proc && !server.proc.killed) {
      try {
        server.proc.kill("SIGTERM");
      } catch {
        /* déjà mort */
      }
    }
    reset(transportError(reason));
  }

  return {
    ensure,
    request,
    notify,
    stop,
    isAlive: () => !!server && server.proc.exitCode == null && !server.proc.killed,
    generation: () => generation,
    initResult: () => (initResult?.generation === generation ? initResult.value : null),
    setSessionHandler: (sid, h) => sessionHandlers.set(sid, h),
    clearSessionHandler: (sid) => sessionHandlers.delete(sid),
    setSessionServerHandler: (sid, h) => sessionServerHandlers.set(sid, h),
    clearSessionServerHandler: (sid) => sessionServerHandlers.delete(sid),
    /** Exposé pour les tests : dispatch d'un message entrant comme s'il
     * venait du stdout du process courant. */
    _handleIncomingForTests: handleIncoming,
  };
}
