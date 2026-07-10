import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { writeFileAtomic } from "./store.mjs";
import { generateImage, resolveArkApiKey, resolveArkModel } from "./providers/images.mjs";
import { generateImageViaCodex } from "./providers/codex_image.mjs";
import { createHarnessThread } from "./harness_events.mjs";

// ctx: { send(obj), store, providers, broadcast(obj) }

// file d'attente par thread pour les providers SANS steering (Codex) :
// les messages envoyés pendant un run partent automatiquement au tour suivant.
const pending = new Map(); // threadId -> [{ msg, turnId }...] — turns réservés en queue
const permWaiters = new Map(); // requestId -> resolve(bool) — chemin Claude historique (mode Ask)
const interactionWaiters = new Map(); // requestId -> { threadId, answer(response), decline(state) }
const lastTurnByThread = new Map(); // threadId -> { entry, responseText, diffs }
let retitleAllRunning = false;

const DEFAULT_APP_DIR = join(homedir(), "Library", "Application Support", "atelier-studio");

function zoteroFavsPath(ctx) {
  return ctx.zoteroFavsPath ?? join(DEFAULT_APP_DIR, "zotero-favs.json");
}

function loadZoteroFavs(ctx) {
  try {
    const raw = JSON.parse(readFileSync(zoteroFavsPath(ctx), "utf8"));
    return new Set(Array.isArray(raw) ? raw.filter((key) => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

function saveZoteroFavs(ctx, favs) {
  const path = zoteroFavsPath(ctx);
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, JSON.stringify([...favs].sort(), null, 2));
}

function paperDigestPath(ctx, slug) {
  const dir = ctx.paperDigestDir ?? join(DEFAULT_APP_DIR, "paper-digests");
  return join(dir, `${slug}.md`);
}

function withZoteroMeta(ctx, items) {
  const favs = loadZoteroFavs(ctx);
  return items.map((item) => ({
    ...item,
    citeKey: ctx.zotero?.citeKey?.(item) ?? "",
    fav: favs.has(item.key),
  }));
}

function titleKey(title) {
  return String(title ?? "").trim();
}

function isPathLikeTitle(title, thread) {
  const t = titleKey(title);
  if (!t) return false;
  if (/^(\/|~\/|[A-Za-z]:[\\/])/.test(t)) return true;
  const root = titleKey(thread?.projectRoot);
  return !!root && t === root.slice(0, 40);
}

function isRawThreadTitle(thread, duplicateTitles) {
  const t = titleKey(thread?.title);
  if (!t) return false;
  return isPathLikeTitle(t, thread) || duplicateTitles.has(t);
}

async function firstUserMessageForThread(ctx, thread) {
  if (!thread?.sessionId) return "";
  let events = [];
  if (thread.provider === "claude") {
    events = await ctx.history?.claudeHistory?.(thread.sessionId, thread.projectRoot) ?? [];
  } else if (thread.provider === "codex") {
    events = await ctx.sessions?.codexHistory?.(thread.sessionId) ?? [];
  }
  return events.find((event) => event.kind === "user" && event.text?.trim())?.text?.trim() ?? "";
}

async function retitleAllThreads(ctx) {
  const emit = ctx.broadcast ?? ctx.send;
  const titleCounts = new Map();
  for (const thread of ctx.store.list()) {
    const key = titleKey(thread.title);
    if (key) titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const duplicateTitles = new Set(
    [...titleCounts.entries()].filter(([, count]) => count > 1).map(([title]) => title),
  );
  const candidates = ctx.store.list().filter((thread) => isRawThreadTitle(thread, duplicateTitles));
  let renamed = 0;
  for (const thread of candidates) {
    try {
      const firstMessage = await firstUserMessageForThread(ctx, thread);
      if (!firstMessage) continue;
      const title = await ctx.providers?.claude?.titleConversation?.(firstMessage);
      if (!title) continue;
      const fresh = ctx.store.get(thread.id);
      if (!fresh || !isRawThreadTitle(fresh, duplicateTitles)) continue;
      ctx.store.upsert({ id: thread.id, title }, { preserveUpdatedAt: true });
      renamed += 1;
      emit({ type: "threads", threads: ctx.store.list() });
    } catch (e) {
      ctx.send({ type: "error", threadId: thread.id, message: `retitrage impossible: ${String(e)}` });
    }
  }
  ctx.send({ type: "retitleAllDone", scanned: candidates.length, renamed });
}

async function maybeTitleThread(ctx, emit, threadId, firstMessage) {
  const t = ctx.store.get(threadId);
  if (!t || t.title !== String(firstMessage ?? "").slice(0, 40)) return;
  const title = await ctx.providers?.claude?.titleConversation?.(firstMessage);
  if (!title) return;
  const fresh = ctx.store.get(threadId);
  if (fresh?.title !== String(firstMessage ?? "").slice(0, 40)) return;
  ctx.store.upsert({ id: threadId, title });
  emit({ type: "threads", threads: ctx.store.list() });
}

/** Mode Ask : relaie la demande de permission au front et attend la réponse (120 s max). */
function makePermissionRelay(ctx, emit, threadId, permissionMode) {
  if (permissionMode !== "default") return undefined;
  return ({ toolName, input, signal }) => new Promise((resolve) => {
    const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => { permWaiters.delete(requestId); resolve(false); }, 120000);
    permWaiters.set(requestId, (allow) => { clearTimeout(timer); resolve(allow); });
    signal?.addEventListener?.("abort", () => {
      if (permWaiters.has(requestId)) { permWaiters.delete(requestId); clearTimeout(timer); resolve(false); }
    });
    emit({ type: "permissionRequest", threadId, requestId, toolName, input });
  });
}

/** Résumé non secret d'une réponse d'interaction (jamais de valeur secret). */
function summarizeInteractionAnswer(spec, response) {
  if (!response) return "";
  if (spec.interactionType === "approval") return response.allow ? "autorisé" : "refusé";
  if (spec.interactionType === "mcp_elicitation") {
    return response.action === "accept" ? "accepté" : "refusé";
  }
  const answers = response.answers ?? response.content ?? {};
  const parts = [];
  for (const f of spec.fields ?? []) {
    const v = answers[f.id];
    if (v == null || v === "") continue;
    parts.push(`${f.header ?? f.id}: ${f.secret ? "•••" : String(v).slice(0, 60)}`);
  }
  return parts.join(" · ").slice(0, 200);
}

const INTERACTION_TIMEOUT_MS = 120000;

/**
 * Relay d'interaction générique (plan 025 step 5) : émet un événement
 * `interaction` dans le turn actif, attend la réponse WS (interactionResponse)
 * jusqu'au timeout (autoResolutionMs borné 1 s–10 min sinon 120 s), puis émet
 * l'état final. Retourne la réponse utilisateur, ou null = refus sûr.
 * Le waiter survit à une déconnexion du client (répondable après reconnexion).
 */
function makeInteractionRelay(ctx, threadId) {
  return (spec) => new Promise((resolve) => {
    const h = harnessThreads.get(threadId);
    const run = threadRuns.get(threadId);
    if (!h || !run) {
      resolve(null); // pas de turn actif : refus sûr immédiat
      return;
    }
    const turnId = run.turnId;
    const requestId = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const publicEvent = (state, answerSummary) => ({
      kind: "interaction",
      requestId,
      interactionType: spec.interactionType,
      title: spec.title,
      ...(spec.detail ? { detail: spec.detail } : {}),
      ...(spec.urlDomain ? { urlDomain: spec.urlDomain } : {}),
      ...(spec.fields ? { fields: spec.fields } : {}),
      state,
      ...(answerSummary ? { answerSummary } : {}),
    });
    const auto = Number(spec.autoResolutionMs);
    const timeoutMs = Number.isFinite(auto) && auto > 0
      ? Math.min(Math.max(auto, 1000), 600000)
      : INTERACTION_TIMEOUT_MS;
    const finish = (state, response) => {
      if (!interactionWaiters.has(requestId)) return;
      interactionWaiters.delete(requestId);
      clearTimeout(timer);
      h.emit(turnId, publicEvent(state, summarizeInteractionAnswer(spec, response)), {
        itemId: spec.itemId ?? undefined,
      });
      resolve(response);
    };
    const timer = setTimeout(() => finish("expired", null), timeoutMs);
    interactionWaiters.set(requestId, {
      threadId,
      answer: (response) => finish("answered", response ?? null),
      decline: (state = "declined") => finish(state, null),
    });
    h.emit(turnId, publicEvent("pending"), { itemId: spec.itemId ?? undefined });
  });
}

/** Fin/interruption de turn : les interactions pendantes sont refusées sûrement. */
function declineThreadInteractions(threadId) {
  for (const w of [...interactionWaiters.values()]) {
    if (w.threadId === threadId) w.decline("declined");
  }
}

function gitRootFor(ctx, msg) {
  const thread = msg.threadId ? ctx.store?.get(msg.threadId) : null;
  const root = msg.root ?? msg.projectRoot ?? thread?.projectRoot;
  if (!root) throw new Error("projectRoot requis");
  return root;
}

function emitGitChanged(ctx, threadId, projectRoot) {
  (ctx.broadcast ?? ctx.send)({ type: "gitChanged", threadId, projectRoot });
}

async function filesChangedSinceTurn(ctx, turn) {
  if (!turn.projectRoot || !turn.snapshotSha || !ctx.gitops?.changedSince) return [];
  try {
    return await ctx.gitops.changedSince(turn.projectRoot, turn.snapshotSha);
  } catch {
    return [];
  }
}

async function enrichDoneEvent(ctx, turn, event) {
  if (event.kind === "edit") return enrichEditEvent(ctx, turn, event);
  if (event.kind !== "done") return event;
  return {
    ...event,
    projectRoot: turn.projectRoot,
    filesChanged: await filesChangedSinceTurn(ctx, turn),
  };
}

/** Événement « edit » d'un provider : ±lignes par fichier via git numstat. */
async function enrichEditEvent(ctx, turn, event) {
  const root = turn.projectRoot || null;
  const files = [];
  for (const p of (event.files ?? []).slice(0, 20)) {
    let rel = String(p ?? "");
    if (root && rel.startsWith(root.endsWith("/") ? root : root + "/")) {
      rel = rel.slice((root.endsWith("/") ? root : root + "/").length);
    }
    let add = null, del = null;
    if (root && !rel.startsWith("/") && ctx.gitops?.numstat) {
      try { ({ add, del } = await ctx.gitops.numstat(root, rel)); } catch {}
    }
    files.push({ path: rel, add, del });
  }
  return { kind: "edit", projectRoot: root, files, ts: Date.now() };
}

async function snapshotBeforeProvider(ctx, threadId) {
  const root = ctx.store.get(threadId)?.projectRoot;
  if (!root || !ctx.gitops?.isRepo || !ctx.gitops?.snapshot) return null;
  try {
    if (!(await ctx.gitops.isRepo(root))) return null;
    const lastSnapshot = await ctx.gitops.snapshot(root);
    ctx.store.upsert({ id: threadId, lastSnapshot });
    return lastSnapshot;
  } catch (e) {
    console.warn("[atelier] git snapshot impossible:", e);
    return null;
  }
}

function collectTool(tools, event) {
  if (event.kind === "tool") {
    tools.push({ name: event.name });
  }
  if (event.kind === "tool_update") {
    tools.push({
      id: event.id,
      name: event.name,
      status: event.status ?? null,
      exitCode: event.exitCode ?? null,
    });
  }
}

async function buildReviewInput(ctx, turn) {
  let filesChanged = [];
  let diffs = "";
  if (turn.projectRoot && turn.snapshotSha && ctx.gitops?.changedSince) {
    try {
      filesChanged = await filesChangedSinceTurn(ctx, turn);
      if (filesChanged.length) diffs = await ctx.gitops.diff(turn.projectRoot, null);
    } catch {}
  }
  const entry = {
    provider: turn.provider,
    model: turn.model ?? null,
    promptExcerpt: String(turn.prompt ?? "").slice(0, 500),
    tools: turn.tools,
    filesChanged,
  };
  return { entry, responseText: turn.lastText ?? "", diffs: String(diffs).slice(0, 12000) };
}

async function runReview(ctx, emit, threadId, input, cfg) {
  // détail de ce qui a été confronté au record : outils lancés + fichiers modifiés
  const checkedTools = (input.entry?.tools ?? [])
    .map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean);
  const checkedFiles = input.entry?.filesChanged ?? [];
  const checks = checkedTools.length + checkedFiles.length;
  emit({ type: "reviewResult", threadId, status: "running", model: cfg?.model ?? null });
  const verdict = await ctx.reviewer.reviewTurn({
    ...input,
    cfg,
    providers: ctx.providers,
  });
  emit({ type: "reviewResult", threadId, status: "done", model: cfg?.model ?? null,
    checks, checkedTools, checkedFiles, ...verdict });
}

function maybeAutoReview(ctx, emit, turn, cfg) {
  if (!ctx.reviewer || !cfg?.enabled) {
    // mémoriser quand même le tour pour un requestReview manuel
    buildReviewInput(ctx, turn).then((input) => lastTurnByThread.set(turn.threadId, { input }));
    return;
  }
  buildReviewInput(ctx, turn)
    .then((input) => {
      lastTurnByThread.set(turn.threadId, { input });
      const trigger = cfg.trigger ?? "files-changed";
      if (trigger === "manual") return;
      if (trigger === "files-changed" && !input.entry.filesChanged.length) return;
      return runReview(ctx, emit, turn.threadId, input, cfg);
    })
    .catch(() => {});
}

async function appendLedgerForDone(ctx, turn, event) {
  if (!ctx.ledger?.append || event.kind !== "done") return;
  const thread = ctx.store.get(turn.threadId);
  const filesChanged = await filesChangedSinceTurn(ctx, turn);
  await ctx.ledger.append(turn.projectRoot, {
    ts: new Date().toISOString(),
    threadId: turn.threadId,
    threadTitle: thread?.title ?? null,
    provider: turn.provider,
    model: turn.model ?? null,
    effort: turn.effort ?? null,
    promptExcerpt: String(turn.prompt ?? "").slice(0, 500),
    usage: event.usage ?? null,
    tools: turn.tools,
    filesChanged,
    snapshotSha: turn.snapshotSha ?? null,
  });
}

// ---------------------------------------------------------------------------
// Attribution des tours (plan 025) — le routeur est la SEULE autorité des
// turnId/messageId. Un sérialiseur harnais par thread décore chaque événement
// (eventId, sequence, turnId…) ; un dispatcher STABLE par thread route les
// événements du provider vers le turn actif (un steer ne réattribue rien).
// ---------------------------------------------------------------------------

const harnessThreads = new Map(); // threadId -> harness (créé par harness_events)
const threadRuns = new Map(); // threadId -> { turnId, turn, autoReview } du turn ACTIF
const threadDispatchers = new Map(); // threadId -> dispatcher stable
const emitBox = new Map(); // threadId -> emit courant (broadcast de la dernière connexion)

function harnessFor(threadId, provider) {
  let h = harnessThreads.get(threadId);
  if (!h) {
    h = createHarnessThread({
      threadId,
      provider,
      emit: (event) => emitBox.get(threadId)?.({ type: "event", threadId, event }),
      journal: null, // journal canonique branché en tranche C
    });
    harnessThreads.set(threadId, h);
  }
  h.setProvider(provider);
  return h;
}

/** displayEvent du frontend (texte réellement tapé, attachments structurés) —
 * repli sur le prompt brut pour les anciens clients. Jamais de data URL. */
function normalizeDisplayEvent(msg) {
  const d = msg.displayEvent;
  if (d && d.kind === "user" && typeof d.text === "string") {
    return { ...d, ts: d.ts ?? Date.now() };
  }
  return { kind: "user", text: String(msg.prompt ?? ""), ts: Date.now() };
}

function dispatcherFor(ctx, threadId) {
  let d = threadDispatchers.get(threadId);
  if (!d) {
    d = (event) => handleTurnEvent(ctx, threadId, event);
    threadDispatchers.set(threadId, d);
  }
  return d;
}

async function handleTurnEvent(ctx, threadId, event) {
  const run = threadRuns.get(threadId);
  const h = harnessThreads.get(threadId);
  const emit = emitBox.get(threadId) ?? ctx.broadcast ?? ctx.send;
  if (!run || !h || !event) return; // course à l'arrêt : événement orphelin ignoré
  const { turn, turnId } = run;
  collectTool(turn.tools, event);
  if (event.kind === "text") turn.lastText = event.text;

  if (event.kind === "edit") {
    // enrichissement async (±lignes git) sérialisé par le harnais : ne peut
    // pas être dépassé par le done qui suit
    await h.emit(turnId, enrichEditEvent(ctx, turn, event));
    return;
  }
  if (event.kind !== "done" && event.kind !== "error") {
    await h.emit(turnId, event);
    return;
  }

  // terminal — exactement un par turn (un doublon est refusé par le harnais)
  declineThreadInteractions(threadId);
  const outEvent = event.kind === "done" ? await enrichDoneEvent(ctx, turn, event) : event;
  const accepted = await h.terminal(turnId, outEvent);
  if (!accepted) return;
  threadRuns.delete(threadId);

  if (event.kind === "done") {
    emitGitChanged(ctx, threadId, turn.projectRoot);
    maybeAutoReview(ctx, emit, turn, run.autoReview);
    appendLedgerForDone(ctx, turn, outEvent).catch((e) => {
      emit({ type: "error", threadId, message: `ledger: ${String(e)}` });
    });
  }
  ctx.store.upsert({ id: threadId, status: event.kind === "done" ? "done" : "idle" });
  emit({ type: "threads", threads: ctx.store.list() });
  if (event.kind === "done" && event.ok !== false) {
    maybeTitleThread(ctx, emit, threadId, turn.prompt).catch(() => {});
  }
  drainQueue(ctx, threadId);
}

function drainQueue(ctx, threadId) {
  const q = pending.get(threadId);
  const next = q?.shift();
  if (q && q.length === 0) pending.delete(threadId);
  if (!next) return;
  const h = harnessThreads.get(threadId);
  startProviderTurn(ctx, h, next.msg, { reservedTurnId: next.turnId }).catch((e) => {
    (emitBox.get(threadId) ?? ctx.send)({
      type: "error",
      threadId,
      message: `reprise de la file: ${String(e)}`,
    });
  });
}

/** Exécute UN turn (nouveau ou réservé en queue) : snapshot, provider, statut. */
async function startProviderTurn(ctx, h, msg, { reservedTurnId = null } = {}) {
  const { threadId, projectRoot, provider, prompt, model, effort, permissionMode } = msg;
  const p = ctx.providers[provider];
  const emit = emitBox.get(threadId) ?? ctx.broadcast ?? ctx.send;
  const prev = ctx.store.get(threadId);

  ctx.store.upsert({ id: threadId, status: "running" });
  emit({ type: "threads", threads: ctx.store.list() });

  const tools = [];
  const snapshotSha = await snapshotBeforeProvider(ctx, threadId);
  const turn = { threadId, projectRoot, provider, model, effort, prompt, tools, snapshotSha, lastText: "" };

  let turnId;
  if (reservedTurnId) {
    h.activateQueued(reservedTurnId);
    turnId = reservedTurnId;
  } else {
    turnId = h.startTurn({
      messageId: msg.clientMessageId,
      userEvent: normalizeDisplayEvent(msg),
      nativeThreadId: prev?.sessionId ?? undefined,
    });
  }
  threadRuns.set(threadId, { turnId, turn, autoReview: msg.autoReview });
  const dispatcher = dispatcherFor(ctx, threadId);

  if (provider === "claude") {
    try {
      p.send({
        threadId,
        cwd: projectRoot || process.env.HOME,
        prompt,
        sessionId: prev?.sessionId ?? null,
        model,
        effort,
        permissionMode,
        onPermissionRequest: makePermissionRelay(ctx, emit, threadId, permissionMode),
        mode: msg.mode,
        resumeAt: prev?.resumeAt ?? null,
        fork: prev?.forkPending ?? false,
        onSession: (sessionId) =>
          ctx.store.upsert({ id: threadId, sessionId, resumeAt: null, forkPending: false }),
        onEvent: dispatcher,
      });
    } catch (e) {
      // p.send synchrone a levé après le passage en "running" : terminal error
      // via le harnais (statut + file gérés par handleTurnEvent)
      await handleTurnEvent(ctx, threadId, { kind: "error", message: String(e?.message ?? e) });
    }
    return;
  }

  p.run({
    threadId,
    cwd: projectRoot || process.env.HOME,
    prompt,
    inputs: msg.inputs,
    imagePath: msg.imagePath,
    attachments: msg.attachments,
    sessionId: prev?.sessionId ?? null,
    model,
    effort,
    permissionMode,
    clientMessageId: msg.clientMessageId,
    webSearch: msg.webSearch,
    additionalDirectories: msg.additionalDirectories,
    onInteraction: makeInteractionRelay(ctx, threadId),
    onEvent: dispatcher,
  })
    .then(({ sessionId }) => {
      ctx.store.upsert({ id: threadId, sessionId });
      emit({ type: "threads", threads: ctx.store.list() });
    })
    .catch((e) => dispatcher({ kind: "error", message: String(e) }));
}

export async function route(msg, ctx) {
  switch (msg.type) {
    case "interrupt": {
      const t = ctx.store.get(msg.threadId);
      const prov = t?.provider && ctx.providers[t.provider];
      if (prov?.interrupt) await prov.interrupt(msg.threadId);
      break;
    }
    case "status": {
      ctx.send({ type: "status", ...ctx.status() });
      break;
    }
    case "providerStatus": {
      ctx.send({ type: "providerStatus", providers: await ctx.providerStatus() });
      break;
    }
    case "setupStatus": {
      ctx.send({ type: "setupStatus", status: await ctx.setupStatus?.() });
      break;
    }
    case "apiProviders": {
      ctx.send({ type: "apiProviders", providers: ctx.apiProviders?.list() ?? [] });
      break;
    }
    case "saveApiProvider": {
      try {
        ctx.apiProviders?.save(msg.provider ?? {});
        ctx.send({ type: "apiProviders", providers: ctx.apiProviders?.list() ?? [] });
        ctx.send({ type: "providerStatus", providers: await ctx.providerStatus() });
      } catch (e) {
        ctx.send({ type: "error", message: `provider API: ${String(e.message ?? e)}` });
      }
      break;
    }
    case "listApiModels": {
      try {
        const models = await ctx.apiProviders.discoverModels(msg.provider ?? {});
        ctx.send({ type: "apiModels", models });
      } catch (e) {
        ctx.send({ type: "apiModels", models: null, error: String(e.message ?? e) });
      }
      break;
    }
    case "deleteApiProvider": {
      ctx.apiProviders?.remove(String(msg.id ?? ""));
      ctx.send({ type: "apiProviders", providers: ctx.apiProviders?.list() ?? [] });
      ctx.send({ type: "providerStatus", providers: await ctx.providerStatus() });
      break;
    }
    case "clearPasted": {
      ctx.send({ type: "pastedCleared", removed: ctx.clearPasted() });
      break;
    }
    case "listPasted": {
      ctx.send({ type: "pastedList", files: ctx.listPasted() });
      break;
    }
    case "getSettings": {
      ctx.send({ type: "settingsFile", settings: ctx.readSettingsFile() });
      break;
    }
    case "saveSettings": {
      ctx.send({ type: "settingsSaved", ok: ctx.writeSettingsFile(msg.settings) });
      break;
    }
    case "saveImage": {
      // image collée (⌘V) : dataURL → PNG sur disque, chemin renvoyé au client
      const m = /^data:image\/(\w+);base64,(.+)$/.exec(msg.dataURL ?? "");
      if (!m) {
        ctx.send({ type: "error", message: "dataURL d'image invalide" });
        break;
      }
      const path = ctx.saveImage(m[1], m[2]);
      ctx.send({ type: "imageSaved", path });
      break;
    }
    case "checkFrame": {
      const res = await ctx.checkFrame(msg.url);
      ctx.send({ type: "frameChecked", url: msg.url, blocked: res.blocked });
      break;
    }
    case "scanLocal": {
      ctx.send({ type: "localServers", servers: await ctx.scanLocal() });
      break;
    }
    case "termOpen": {
      ctx.terminal.open(msg, ctx.broadcast ?? ctx.send);
      break;
    }
    case "termInput": {
      ctx.terminal.input(msg.termId, msg.data);
      break;
    }
    case "termResize": {
      ctx.terminal.resize(msg.termId, msg.cols, msg.rows);
      break;
    }
    case "termClose": {
      ctx.terminal.close(msg.termId);
      break;
    }
    case "exportThread": {
      const t = ctx.store.get(msg.threadId);
      if (!t) { ctx.send({ type: "error", message: "thread introuvable" }); break; }
      let events = msg.events ?? [];
      if (t.provider === "claude" && t.sessionId) {
        try { events = await ctx.history.claudeHistory(t.sessionId, t.projectRoot); } catch {}
      }
      const md = [
        `# ${t.title ?? "conversation"}`,
        ``,
        `- Provider : ${t.provider}`,
        `- Projet : ${t.projectRoot || "(aucun)"}`,
        `- Session : ${t.sessionId ?? "-"}`,
        `- Exporté : ${new Date().toISOString()}`,
        ``,
        ...events.map((e) =>
          e.kind === "user" ? `**Utilisateur :**\n\n${e.text}\n` :
          e.kind === "text" ? `**Agent :**\n\n${e.text}\n` : ""),
      ].filter(Boolean).join("\n");
      const path = ctx.exportThread(t, events, md);
      ctx.send({ type: "exported", threadId: msg.threadId, path });
      break;
    }
    case "listSessions": {
      const sessions = await ctx.sessions.listSessions(msg.provider, msg.projectRoot);
      ctx.send({ type: "sessions", provider: msg.provider, sessions });
      break;
    }
    case "importSession": {
      ctx.store.upsert({
        id: msg.newThreadId,
        projectRoot: msg.projectRoot ?? "",
        provider: msg.provider,
        title: "⤓ " + (msg.title ?? msg.sessionId.slice(0, 8)),
        sessionId: msg.sessionId,
        status: "idle",
      });
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "forkThread": {
      // nouveau thread qui bifurque de la session d'un autre (fork au prochain send)
      const src = ctx.store.get(msg.fromThreadId);
      if (!src?.sessionId || src.provider !== "claude") {
        ctx.send({ type: "error", message: "fork indisponible pour ce chat" });
        break;
      }
      ctx.store.upsert({
        id: msg.newThreadId,
        projectRoot: src.projectRoot,
        provider: "claude",
        title: "⑂ " + (src.title ?? "fork"),
        sessionId: src.sessionId,
        forkPending: true,
        status: "idle",
      });
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "revert": {
      // rewind : ferme la session, repère le point avant le message donné ;
      // le prochain send reprendra avec resumeSessionAt (API documentée)
      const t = ctx.store.get(msg.threadId);
      if (!t || t.provider !== "claude" || !t.sessionId) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "revert indisponible" });
        break;
      }
      ctx.providers.claude.endSession(msg.threadId);
      const pt = await ctx.history.findRevertPoint(t.sessionId, t.projectRoot, msg.text);
      if (!pt.found) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "message introuvable dans la session" });
        break;
      }
      if (pt.uuid) {
        ctx.store.upsert({ id: msg.threadId, resumeAt: pt.uuid, status: "idle" });
      } else {
        // revert du tout premier message → session neuve
        ctx.store.upsert({ id: msg.threadId, sessionId: null, resumeAt: null, status: "idle" });
      }
      ctx.send({ type: "reverted", threadId: msg.threadId });
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "clientLog":
      (ctx.broadcast ?? ctx.send)({ type: "clientLog", note: String(msg.note ?? "").slice(0, 300) });
      break;
    case "permissionResponse": {
      const w = permWaiters.get(msg.requestId);
      if (w) { permWaiters.delete(msg.requestId); w(!!msg.allow); }
      break;
    }
    case "interactionResponse": {
      // réponse tardive ou double : le waiter n'existe plus → ignorée (idempotent)
      const w = interactionWaiters.get(msg.requestId);
      if (w) w.answer(msg.response ?? null);
      break;
    }
    case "ping":
      ctx.send({ type: "pong" });
      break;
    case "listCommands":
      ctx.send({ type: "commands", commands: ctx.catalog.listCommands(msg.projectRoot) });
      break;
    case "listFiles":
      ctx.send({ type: "files", projectRoot: msg.projectRoot,
        files: ctx.catalog.listFiles(msg.projectRoot) });
      break;
    case "gitStatus": {
      const root = gitRootFor(ctx, msg);
      ctx.send({ type: "gitStatus", projectRoot: root, status: await ctx.gitops.status(root) });
      break;
    }
    case "gitDiff": {
      const root = gitRootFor(ctx, msg);
      ctx.send({ type: "gitDiff", projectRoot: root, path: msg.path ?? null,
        diff: await ctx.gitops.diff(root, msg.path ?? null) });
      break;
    }
    case "generateCommitMsg": {
      const root = gitRootFor(ctx, msg);
      try {
        const st = await ctx.gitops.status(root);
        const diff = await ctx.gitops.diff(root, null);
        // git diff HEAD ignore les fichiers non suivis (??) : toujours donner
        // la liste des fichiers au modèle, le diff en complément
        const fileList = st.files.map((f) => `${f.status} ${f.path}`).join("\n");
        const payload = `Fichiers modifiés :\n${fileList}\n\n${diff}`;
        const message = st.files.length
          ? await ctx.providers?.claude?.commitMessage?.(payload)
          : "";
        ctx.send({ type: "commitMsg", projectRoot: root, message: message ?? "" });
      } catch (e) {
        ctx.send({ type: "commitMsg", projectRoot: root, message: "", error: String(e?.message ?? e) });
      }
      break;
    }
    case "generateImage": {
      const prompt = String(msg.prompt ?? "").trim();
      const size = String(msg.size ?? "2K");
      const engine = msg.engine === "codex" ? "codex" : "seedream";
      const editFrom = msg.editFrom ? String(msg.editFrom) : null;
      let root = msg.projectDir ? String(msg.projectDir) : null;
      try {
        root = root || gitRootFor(ctx, msg);
        if (!prompt) throw new Error("prompt requis");
        let result;
        if (engine === "codex") {
          // gpt-image-2 via l'abonnement ChatGPT (aucune clé, quota abonnement)
          result = await generateImageViaCodex({ prompt, size, editImagePath: editFrom });
        } else {
          const apiKey = resolveArkApiKey();
          const model = resolveArkModel();
          let editImageDataUri = null;
          if (editFrom) {
            const buf = readFileSync(editFrom);
            editImageDataUri = `data:image/png;base64,${buf.toString("base64")}`;
          }
          result = await generateImage({ prompt, size, editImageDataUri, apiKey, model });
        }
        const dir = join(root, "generated");
        mkdirSync(dir, { recursive: true });
        const ts = Date.now();
        const base = `fig_${ts}`;
        const imagePath = join(dir, `${base}.png`);
        const metaPath = join(dir, `${base}.json`);
        writeFileSync(imagePath, Buffer.from(result.b64, "base64"));
        const meta = {
          prompt,
          engine,
          model: result.model,
          size: result.size,
          editFrom,
          createdAt: new Date(ts).toISOString(),
          usage: result.usage,
        };
        writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        // broadcast (pas send) : une génération dure ~140 s et survit souvent à
        // la socket qui l'a demandée (reconnexion auto, reload de la fenêtre).
        // ctx.send est lié à cette socket et jette le message si elle est fermée
        // → le fichier serait écrit mais l'UI ne recevrait jamais la réponse.
        // Le frontend filtre par projectRoot, donc le broadcast est sûr.
        (ctx.broadcast ?? ctx.send)({ type: "imageGenerated", projectRoot: root, path: imagePath, metaPath, ...meta });
      } catch (e) {
        (ctx.broadcast ?? ctx.send)({ type: "imageGenerated", projectRoot: root, path: null, error: String(e?.message ?? e) });
      }
      break;
    }
    case "getLedger": {
      const root = gitRootFor(ctx, msg);
      const entries = await ctx.ledger.get(root, msg.limit ?? 200);
      ctx.send({ type: "ledger", projectRoot: root, entries });
      break;
    }
    case "zoteroSearch": {
      if (!ctx.zotero?.available?.()) {
        ctx.send({ type: "zoteroItems", items: [], error: "zotero-introuvable" });
        break;
      }
      const items = ctx.zotero.search({
        query: msg.query ?? "",
        tag: msg.tag ?? null,
        collectionId: msg.collectionId ?? null,
        limit: msg.limit ?? 400,
      });
      ctx.send({ type: "zoteroItems", items: withZoteroMeta(ctx, items) });
      break;
    }
    case "zoteroDigest": {
      const key = String(msg.key ?? "").trim();
      const citeKey = String(msg.citeKey ?? "").trim();
      const slug = (citeKey || key).replace(/[^A-Za-z0-9._-]/g, "");
      const path = slug ? paperDigestPath(ctx, slug) : null;
      let digest = null;
      if (path) {
        try { digest = readFileSync(path, "utf8").trim() || null; } catch { /* pas de digest en cache */ }
      }
      const pdfPath = ctx.zotero?.pdfAbsolutePath?.(msg.pdfKey, msg.pdfFile) ?? null;
      ctx.send({ type: "zoteroDigest", key, citeKey, digest, path, pdfPath });
      break;
    }
    case "zoteroAddPdf": {
      const paths = (Array.isArray(msg.paths) ? msg.paths : [])
        .filter((x) => typeof x === "string" && x.toLowerCase().endsWith(".pdf"));
      const results = await ctx.zotero.addPdfs(paths);
      ctx.send({ type: "zoteroAddResult", results });
      break;
    }
    case "zoteroCollections": {
      if (!ctx.zotero?.available?.()) {
        ctx.send({ type: "zoteroCollections", collections: [], error: "zotero-introuvable" });
        break;
      }
      ctx.send({ type: "zoteroCollections", collections: ctx.zotero.collections() });
      break;
    }
    case "zoteroFav": {
      const key = String(msg.key ?? "").trim();
      if (!key) {
        ctx.send({ type: "error", message: "clé Zotero requise" });
        break;
      }
      const favs = loadZoteroFavs(ctx);
      const on = msg.on !== false;
      if (on) favs.add(key);
      else favs.delete(key);
      saveZoteroFavs(ctx, favs);
      ctx.send({ type: "zoteroFav", key, fav: favs.has(key) });
      break;
    }
    case "gitStage": {
      const root = gitRootFor(ctx, msg);
      await ctx.gitops.stageFile(root, msg.path);
      emitGitChanged(ctx, msg.threadId, root);
      ctx.send({ type: "gitStageDone", projectRoot: root, path: msg.path });
      break;
    }
    case "gitUnstage": {
      const root = gitRootFor(ctx, msg);
      await ctx.gitops.unstageFile(root, msg.path);
      emitGitChanged(ctx, msg.threadId, root);
      ctx.send({ type: "gitUnstageDone", projectRoot: root, path: msg.path });
      break;
    }
    case "gitRevertFile": {
      const root = gitRootFor(ctx, msg);
      await ctx.gitops.revertFile(root, msg.path);
      emitGitChanged(ctx, msg.threadId, root);
      ctx.send({ type: "gitRevertFileDone", projectRoot: root, path: msg.path });
      break;
    }
    case "gitPush": {
      const root = gitRootFor(ctx, msg);
      try { const out = await ctx.gitops.push(root); ctx.send({ type: "gitSyncDone", op: "push", projectRoot: root, out }); }
      catch (e) { ctx.send({ type: "gitSyncDone", op: "push", projectRoot: root, error: String(e.message || e) }); }
      emitGitChanged(ctx, msg.threadId, root);
      break;
    }
    case "gitPull": {
      const root = gitRootFor(ctx, msg);
      try { const out = await ctx.gitops.pull(root); ctx.send({ type: "gitSyncDone", op: "pull", projectRoot: root, out }); }
      catch (e) { ctx.send({ type: "gitSyncDone", op: "pull", projectRoot: root, error: String(e.message || e) }); }
      emitGitChanged(ctx, msg.threadId, root);
      break;
    }
    case "gitIgnore": {
      const root = gitRootFor(ctx, msg);
      try { await ctx.gitops.ignorePattern(root, String(msg.pattern ?? "")); } catch (e) { ctx.send({ type: "error", message: String(e) }); }
      emitGitChanged(ctx, msg.threadId, root);
      break;
    }
    case "gitCommit": {
      const root = gitRootFor(ctx, msg);
      try {
        const hash = await ctx.gitops.commit(root, msg.message, msg.files ?? null);
        emitGitChanged(ctx, msg.threadId, root);
        ctx.send({ type: "gitCommitDone", projectRoot: root, hash });
      } catch (e) {
        ctx.send({ type: "gitCommitError", projectRoot: root, message: String(e?.message ?? e) });
      }
      break;
    }
    case "gitUndoLastTurn": {
      const t = ctx.store.get(msg.threadId);
      if (!t?.projectRoot || !t.lastSnapshot) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "snapshot introuvable" });
        break;
      }
      try {
        await ctx.gitops.restore(t.projectRoot, t.lastSnapshot);
      } catch (e) {
        // refus (nouveaux chemins) ou échec git : rien n'a été modifié — jamais Done
        ctx.send({
          type: "gitUndoLastTurnError",
          threadId: msg.threadId,
          projectRoot: t.projectRoot,
          sha: t.lastSnapshot,
          message: String(e?.message ?? e),
        });
        break;
      }
      emitGitChanged(ctx, msg.threadId, t.projectRoot);
      ctx.send({ type: "gitUndoLastTurnDone", threadId: msg.threadId, sha: t.lastSnapshot });
      break;
    }
    case "deleteThread": {
      ctx.store.delete(msg.threadId);
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "retitleAll": {
      if (retitleAllRunning) {
        ctx.send({ type: "retitleAllDone", scanned: 0, renamed: 0, running: true });
        break;
      }
      retitleAllRunning = true;
      try {
        await retitleAllThreads(ctx);
      } finally {
        retitleAllRunning = false;
      }
      break;
    }
    case "renameThread": {
      if (ctx.store.get(msg.threadId)) {
        ctx.store.upsert({ id: msg.threadId, title: msg.title });
      }
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "moveThread": {
      // déplace un thread vers un autre projet (réécrit projectRoot). L'historique
      // après redémarrage retrouve la session via le repli « recherche par id
      // partout » (claudeHistory/grokHistory) — codexHistory scanne déjà
      // ~/.codex/sessions globalement par id, rien à faire pour ce provider.
      const t = ctx.store.get(msg.threadId);
      if (!t) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "thread introuvable" });
        break;
      }
      if (t.status === "running") {
        ctx.send({ type: "error", threadId: msg.threadId,
          message: "chat en cours d'exécution — attendre la fin du tour" });
        break;
      }
      const target = msg.projectRoot;
      if (typeof target !== "string" || !target.startsWith("/")) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "projet cible invalide" });
        break;
      }
      if (target === (t.projectRoot ?? "")) break; // même projet : no-op silencieux
      ctx.store.upsert({ id: msg.threadId, projectRoot: target });
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "getHistory": {
      const t = ctx.store.get(msg.threadId);
      if (!t?.sessionId) {
        ctx.send({ type: "history", threadId: msg.threadId, events: [] });
        break;
      }
      // routage explicite par provider : chaque format a son loader — un
      // provider sans historique renvoie [], jamais le format d'un autre
      let events = [];
      try {
        if (t.provider === "claude") {
          events = await ctx.history.claudeHistory(t.sessionId, t.projectRoot);
        } else if (t.provider === "codex") {
          events = await ctx.sessions.codexHistory(t.sessionId);
        } else if (t.provider === "grok") {
          events = await ctx.sessions.grokHistory(t.sessionId, t.projectRoot);
        } else {
          const p = ctx.providers?.[t.provider];
          if (typeof p?.history === "function") {
            events = await p.history(t.sessionId, t.projectRoot);
          }
        }
      } catch (e) {
        console.warn(`[atelier] history ${t.provider} indisponible:`, String(e?.message ?? e).slice(0, 200));
        events = [];
      }
      ctx.send({ type: "history", threadId: msg.threadId, events: events ?? [] });
      break;
    }
    case "listThreads":
      ctx.send({ type: "threads", threads: ctx.store.list() });
      break;
    case "addHighlight": {
      try {
        ctx.highlights.add(msg.highlight ?? {});
        (ctx.broadcast ?? ctx.send)({ type: "highlights", highlights: ctx.highlights.list() });
      } catch (e) {
        ctx.send({ type: "error", message: `surlignage: ${String(e?.message ?? e)}` });
      }
      break;
    }
    case "removeHighlight": {
      ctx.highlights.remove(String(msg.id ?? ""));
      (ctx.broadcast ?? ctx.send)({ type: "highlights", highlights: ctx.highlights.list() });
      break;
    }
    case "listHighlights": {
      ctx.send({ type: "highlights", highlights: ctx.highlights.list() });
      break;
    }
    case "requestReview": {
      const saved = lastTurnByThread.get(msg.threadId);
      if (!saved) {
        ctx.send({ type: "reviewResult", threadId: msg.threadId, status: "done", verdict: "unavailable", issues: [] });
        break;
      }
      const cfg = msg.autoReview ?? { provider: "codex", model: "gpt-5.5", effort: "high" };
      runReview(ctx, (m) => (ctx.broadcast ?? ctx.send)(m), msg.threadId, saved.input, cfg).catch(() => {});
      break;
    }
    case "getUsage": {
      const claudeRl = (await ctx.providers?.claude?.rateLimitsAsync?.()) ?? ctx.providers?.claude?.rateLimits?.() ?? null;
      const codexRl = ctx.providers?.codex?.rateLimits?.() ?? null;
      // par-modèle aujourd'hui, tous projets confondus (ledger)
      const models = {};
      try {
        const entries = await ctx.ledger.getAll?.(500) ?? [];
        const today = new Date().toDateString();
        for (const e of entries) {
          if (new Date(e.ts).toDateString() !== today) continue;
          const k = e.model || e.provider || "?";
          models[k] ??= { turns: 0, output: 0 };
          models[k].turns += 1;
          models[k].output += e.usage?.output ?? 0;
        }
      } catch {}
      ctx.send({ type: "usage", claude: claudeRl, codex: codexRl, models });
      break;
    }
    case "quickAsk": {
      // session éphémère : hors ThreadStore, hors ledger, hors snapshot git
      const { qaId, prompt, provider = "claude", model, effort } = msg;
      const p = ctx.providers?.[provider];
      if (!p) { ctx.send({ type: "qaEvent", qaId, event: { kind: "error", message: "provider inconnu" } }); break; }
      ctx.qaSessions ??= new Map();
      const prev = ctx.qaSessions.get(qaId);
      const emitQa = (event) => ctx.send({ type: "qaEvent", qaId, event });
      p.run({
        // session isolée par qaId : sans clé propre, toutes les Quick Ask
        // partageraient la session persistante keyée `null` et se contamineraient
        threadId: `qa:${qaId}`,
        cwd: process.env.HOME,
        prompt,
        sessionId: prev?.sessionId ?? null,
        model: model || undefined,
        effort: effort || undefined,
        // bypassPermissions : en mode "default" sans relais onPermissionRequest,
        // le SDK n'installe pas canUseTool et refuse silencieusement tout outil.
        // Quick Ask tourne dans process.env.HOME comme les threads normaux, qui
        // utilisent déjà bypassPermissions par défaut.
        permissionMode: "bypassPermissions",
        onEvent: emitQa,
      })
        .then(({ sessionId }) => {
          if (sessionId) ctx.qaSessions.set(qaId, { provider, sessionId });
          // le tour est fini : fermer la session streaming pour qu'une prochaine
          // Quick Ask (même qaId ou promue) reparte d'un état propre
          ctx.providers?.claude?.endSession?.(`qa:${qaId}`);
        })
        .catch((e) => {
          emitQa({ kind: "error", message: String(e?.message ?? e) });
          ctx.providers?.claude?.endSession?.(`qa:${qaId}`);
        });
      break;
    }
    case "qaPromote": {
      const s = ctx.qaSessions?.get(msg.qaId);
      if (!s) {
        ctx.send({ type: "qaPromoteError", qaId: msg.qaId,
          message: "session éphémère expirée — pose une nouvelle question puis promeus" });
        break;
      }
      ctx.store.upsert({
        id: msg.newThreadId,
        projectRoot: msg.projectRoot ?? "",
        provider: s.provider,
        title: "Quick Ask — " + (msg.title ?? ""),
        sessionId: s.sessionId,
        status: "idle",
      });
      ctx.qaSessions.delete(msg.qaId);
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "codexCompact": {
      const t = ctx.store.get(msg.threadId);
      if (!t?.sessionId || t.provider !== "codex") {
        ctx.send({ type: "error", threadId: msg.threadId, message: "compact : session Codex absente" });
        break;
      }
      try {
        await ctx.providers.codex.compactThread({ sessionId: t.sessionId, cwd: t.projectRoot || process.env.HOME });
        (ctx.broadcast ?? ctx.send)({ type: "event", threadId: msg.threadId,
          event: { kind: "tool", name: "__compacted" } });
      } catch (e) {
        ctx.send({ type: "error", threadId: msg.threadId, message: `compact: ${String(e?.message ?? e)}` });
      }
      break;
    }
    case "codexClear": {
      // nouveau thread Codex au prochain message ; l'historique visuel reste
      if (ctx.store.get(msg.threadId)) ctx.store.upsert({ id: msg.threadId, sessionId: null });
      (ctx.broadcast ?? ctx.send)({ type: "event", threadId: msg.threadId,
        event: { kind: "tool", name: "__session-cleared" } });
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "goalSet":
    case "goalGet":
    case "goalClear": {
      // goals = app-server Codex uniquement ; le thread doit avoir une session
      const t = ctx.store.get(msg.threadId);
      const codex = ctx.providers?.codex;
      if (!t || t.provider !== "codex" || !codex?.setGoal) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "goals disponibles seulement pour un chat Codex" });
        break;
      }
      const emit = ctx.broadcast ?? ctx.send;
      try {
        const args = { sessionId: t.sessionId, cwd: t.projectRoot || process.env.HOME };
        // set/clear : la notification thread/goal/updated|cleared (relayée par
        // index.mjs) porte déjà l'événement — ne pas émettre en double ici
        if (msg.type === "goalSet") {
          await codex.setGoal({ ...args, objective: msg.objective, status: msg.status ?? null, tokenBudget: msg.tokenBudget ?? null });
        } else if (msg.type === "goalClear") {
          await codex.clearGoal(args);
        } else {
          const goal = await codex.getGoal(args);
          // statut demandé explicitement (/goal sans argument) : répondre même sans goal
          if (goal || msg.explicit) {
            emit({ type: "event", threadId: msg.threadId, event: { kind: "goal", cleared: !goal, goal } });
          }
        }
      } catch (e) {
        ctx.send({ type: "error", threadId: msg.threadId, message: `goal: ${String(e?.message ?? e)}` });
      }
      break;
    }
    case "send": {
      const { threadId, projectRoot, provider, prompt, title, permissionMode } = msg;
      const p = ctx.providers?.[provider];
      if (!p) {
        ctx.send({ type: "error", threadId, message: `provider inconnu: ${provider}` });
        break;
      }
      const emit = ctx.broadcast ?? ctx.send;
      emitBox.set(threadId, emit);
      let prev = ctx.store.get(threadId);
      // changement de provider en cours de thread : les sessions ne sont PAS
      // interchangeables (un UUID Claude n'est pas un thread Codex). On repart
      // sur une session neuve du nouveau provider, l'historique visuel reste.
      if (prev?.provider && prev.provider !== provider && prev.sessionId) {
        if (prev.provider === "claude" && ctx.providers.claude.endSession) {
          ctx.providers.claude.endSession(threadId);
        }
        ctx.store.upsert({ id: threadId, sessionId: null, resumeAt: null });
        prev = ctx.store.get(threadId);
      }
      // garde-fou : un thread Claude ne peut reprendre qu'un UUID Claude. Si le
      // sessionId stocké n'est pas un UUID (ex. id « ses_… » hérité d'un autre
      // provider comme opencode), on repart sur une session neuve au lieu de
      // planter avec « --resume <valeur> is not a UUID ».
      if (provider === "claude" && prev?.sessionId &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prev.sessionId)) {
        ctx.providers.claude.endSession?.(threadId);
        ctx.store.upsert({ id: threadId, sessionId: null, resumeAt: null });
        prev = ctx.store.get(threadId);
      }
      ctx.store.upsert({
        id: threadId,
        projectRoot,
        provider,
        title: prev?.title ?? title ?? prompt.slice(0, 40),
      });

      const h = harnessFor(threadId, provider);
      const running = threadRuns.get(threadId);

      // ---- run actif : steer (défaut) ou queue explicite ----
      if (running && msg.mode !== "queue") {
        const userEvent = normalizeDisplayEvent(msg);
        if (provider === "claude") {
          // steer natif SDK (priority "now") — le dispatcher stable du thread
          // continue d'attribuer les événements au turn actif
          h.steer({ messageId: msg.clientMessageId, userEvent });
          try {
            p.send({
              threadId,
              cwd: projectRoot || process.env.HOME,
              prompt,
              sessionId: prev?.sessionId ?? null,
              model: msg.model,
              effort: msg.effort,
              permissionMode,
              mode: "steer",
              onSession: (sessionId) =>
                ctx.store.upsert({ id: threadId, sessionId, resumeAt: null, forkPending: false }),
              onEvent: dispatcherFor(ctx, threadId),
            });
          } catch (e) {
            ctx.send({ type: "error", threadId, message: `steer: ${String(e?.message ?? e)}` });
          }
          break;
        }
        if (p.steer && await p.steer({ threadId, prompt, inputs: msg.inputs,
            imagePath: msg.imagePath, attachments: msg.attachments })) {
          h.steer({ messageId: msg.clientMessageId, userEvent });
          h.emit(h.activeTurnId(), { kind: "tool", name: "__steered" });
          break;
        }
        // steer refusé par le provider → queue avec le MÊME messageId et un
        // nouveau turnId, sans dupliquer la bulle user (elle est émise ici)
      }
      if (running) {
        const turnId = h.queue({
          messageId: msg.clientMessageId,
          userEvent: normalizeDisplayEvent(msg),
        });
        h.emit(turnId, { kind: "tool", name: "__queued" });
        const q = pending.get(threadId) ?? [];
        q.push({ msg, turnId });
        pending.set(threadId, q);
        break;
      }

      // ---- turn normal (thread au repos) ----
      await startProviderTurn(ctx, h, msg);
      break;
    }
    default:
      ctx.send({ type: "error", message: `type inconnu: ${msg.type}` });
  }
}
