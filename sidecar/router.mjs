import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./store.mjs";
import { generateImage, resolveArkApiKey, resolveArkModel } from "./providers/images.mjs";
import { generateImageViaCodex } from "./providers/codex_image.mjs";
import { createHarnessThread } from "./harness_events.mjs";
import { HANDOFF_END } from "./handoff.mjs";
import { stripGalleryToolInstruction, withGalleryToolInstruction } from "./gallery_tool_prompt.mjs";
import { stripZoteroPassageInstruction, withZoteroPassageInstruction } from "./zotero_passage_prompt.mjs";
import { KnowledgeStore, defaultKnowledgeDir, kbBlockEntries, promotePage, promoteToGbrain } from "./knowledge.mjs";
import { runKbCommand } from "./kb_cli.mjs";
import { withKbBlock } from "./kb_prompt.mjs";
import * as narval from "./narval.mjs";

// ctx: { send(obj), store, providers, broadcast(obj) }

// file d'attente par thread pour les providers SANS steering (Codex) :
// les messages envoyés pendant un run partent automatiquement au tour suivant.
const pending = new Map(); // threadId -> [{ msg, turnId }...] — turns réservés en queue
const permWaiters = new Map(); // requestId -> resolve(bool) — chemin Claude historique (mode Ask)
const interactionWaiters = new Map(); // requestId -> { threadId, answer(response), decline(state) }
const approvalSessions = new Set(); // threadId autorisés jusqu'au redémarrage du sidecar
const lastTurnByThread = new Map(); // threadId -> { entry, responseText, diffs }
let retitleAllRunning = false;

const DEFAULT_APP_DIR = join(homedir(), "Library", "Application Support", "atelier-studio");

function commitGenerationContext(status, stagedOnly) {
  const files = (status?.files ?? []).filter((file) =>
    file.status !== "!" && (!stagedOnly || (file.status !== "?" && file.status?.[0] !== ".")),
  );
  if (!files.length) return "";
  const untracked = files.filter((file) => file.status === "?").length;
  const deleted = files.filter((file) => String(file.status).includes("D")).length;
  const modified = Math.max(0, files.length - untracked - deleted);
  const shown = files.slice(0, 120);
  const lines = [
    `Git change summary for branch ${status?.branch ?? "unknown"}: ${files.length} files (${modified} modified, ${deleted} deleted, ${untracked} untracked).`,
    `Changed files (${shown.length} shown):`,
    ...shown.map((file) => {
      const stats = Number.isFinite(file.add) && Number.isFinite(file.del)
        ? ` (+${file.add} -${file.del})`
        : "";
      return `${file.status} ${file.path}${stats}`;
    }),
  ];
  if (shown.length < files.length) lines.push(`… and ${files.length - shown.length} more files`);
  return lines.join("\n");
}

function buildForkContext(events, provider) {
  const lines = (Array.isArray(events) ? events : []).flatMap((event) => {
    const text = typeof event?.text === "string" ? event.text.trim() : "";
    if (!text) return [];
    if (event.kind === "user") return [`Utilisateur : ${text}`];
    if (event.kind === "text") return [`Agent (${provider}) : ${text}`];
    return [];
  });
  let transcript = lines.join("\n\n");
  if (!transcript) return null;
  const MAX = 400_000;
  if (transcript.length > MAX) transcript = `[…début tronqué…]\n${transcript.slice(-MAX)}`;
  return "Tu reprends une conversation commencée avec un autre agent. " +
    "Voici le fil jusqu'ici — prends-le comme contexte acquis, ne le résume pas, ne le répète pas :\n\n" +
    `---\n${transcript}${HANDOFF_END}`;
}

async function prepareProviderHandoff(ctx, msg) {
  const sourceId = typeof msg.handoffFromThreadId === "string" ? msg.handoffFromThreadId : "";
  if (!sourceId) return null;
  if (sourceId === msg.threadId) throw new Error("handoff: le fil source et la destination doivent être différents");
  if (ctx.store.get(msg.threadId)) throw new Error("handoff: la destination existe déjà");
  const source = ctx.store.get(sourceId);
  if (!source) throw new Error("handoff: fil source introuvable");
  if (source.status === "running" || threadRuns.has(sourceId)) {
    throw new Error("handoff: arrêter le tour source avant de changer de provider");
  }
  if (source.provider === msg.provider) {
    throw new Error("handoff: le provider cible doit être différent du provider source");
  }

  const events = ctx.harnessJournal?.hasJournal(sourceId)
    ? await ctx.harnessJournal.materialize(sourceId)
    : [];
  if (ctx.harnessJournal?.hasJournal(sourceId)) {
    const copied = await ctx.harnessJournal.copyThread(sourceId, msg.threadId);
    if (!copied) throw new Error("handoff: copie atomique du journal impossible");
  }
  ctx.store.upsert({
    id: msg.threadId,
    projectRoot: source.projectRoot ?? msg.projectRoot ?? "",
    provider: msg.provider,
    title: `↪ ${source.title ?? "handoff"}`,
    sessionId: null,
    status: "idle",
    forkContext: buildForkContext(events, source.provider),
    handoff: {
      sourceThreadId: sourceId,
      sourceProvider: source.provider,
      targetProvider: msg.provider,
    },
  });
  return source;
}

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

/** Mode Ask Claude : la demande de permission passe désormais par le HARNAIS
 * (événement `interaction` approval, meta + journal, attribué au turn actif) au
 * lieu d'un message top-level `permissionRequest` hors harnais. Plan 025 :
 * permissions Claude dans le harnais. Répondable via `interactionResponse`. */
function makePermissionRelay(ctx, _emit, threadId, permissionMode) {
  if (permissionMode !== "default") return undefined;
  const relay = makeInteractionRelay(ctx, threadId);
  return async ({ toolName, input }) => {
    const detail = typeof input?.command === "string" ? input.command
      : input?.file_path ? String(input.file_path)
      : input?.url ? String(input.url) : "";
    const response = await relay({
      interactionType: "approval",
      title: `Autoriser ${toolName} ?`,
      ...(detail ? { detail } : {}),
    });
    // timeout / interruption / refus → null → refus sûr
    return response?.allow === true;
  };
}

/** Résumé non secret d'une réponse d'interaction (jamais de valeur secret). */
function summarizeInteractionAnswer(spec, response) {
  if (!response) return "";
  if (spec.interactionType === "approval") {
    // Choix dynamique (Kimi) : afficher le LABEL du choix, jamais l'id wire.
    if (typeof response.optionId === "string") {
      const choice = (spec.choices ?? []).find((c) => c?.optionId === response.optionId);
      const label = String(choice?.label ?? response.optionId).slice(0, 80);
      return response.cancelTurn ? `${label} · tour annulé` : label;
    }
    if (response.cancelTurn) return "tour annulé";
    if (response.allow && response.scope === "session") return "toujours autorisé pour cette session";
    return response.allow ? "autorisé une fois" : "refusé";
  }
  if (spec.interactionType === "mcp_elicitation") {
    return response.action === "accept" ? "accepté" : "refusé";
  }
  const answers = response.answers ?? response.content ?? {};
  const parts = [];
  for (const f of spec.fields ?? []) {
    const v = answers[f.id];
    if (v == null || v === "") continue;
    // Option à valeur opaque (Kimi) : afficher le label, pas l'id wire.
    const label = (f.options ?? []).find((o) => o?.value === v)?.label;
    parts.push(`${f.header ?? f.id}: ${f.secret ? "•••" : String(label ?? v).slice(0, 60)}`);
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
  return (spec) => {
    // Le cache « toujours autoriser » ne répond JAMAIS à la place d'une
    // permission à choix dynamiques (Kimi, plan 046) : seul le choix
    // `approve_always` transmis au harnais installe la règle de session.
    if (spec.interactionType === "approval" && !spec.choices && approvalSessions.has(threadId)) {
      return Promise.resolve({ allow: true, scope: "session" });
    }
    return new Promise((resolve) => {
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
      ...(spec.choices ? { choices: spec.choices } : {}),
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
      clientInstanceId: ctx.clientInstanceId ?? null,
      answer: (response) => finish("answered", response ?? null),
      decline: (state = "declined") => finish(state, null),
    });
    h.emit(turnId, publicEvent("pending"), { itemId: spec.itemId ?? undefined });
    });
  };
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

async function validatedCheckpoint(ctx, threadId, msg) {
  const sha = String(msg.snapshotSha ?? "");
  if (!sha || !ctx.harnessJournal?.hasJournal(threadId)) return null;
  const { events } = await ctx.harnessJournal.load(threadId);
  const done = events.find((event) =>
    event.kind === "done" && event.checkpoint?.snapshotSha === sha &&
    (!msg.turnId || event.meta?.turnId === msg.turnId));
  return done ? { sha, event: done } : null;
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
  const filesChanged = await filesChangedSinceTurn(ctx, turn);
  return {
    ...event,
    projectRoot: turn.projectRoot,
    filesChanged,
    ...(turn.snapshotSha ? {
      checkpoint: { snapshotSha: turn.snapshotSha, filesChanged },
    } : {}),
  };
}

/** Événement « edit » d'un provider : ±lignes par fichier via git numstat. */
export { enrichEditEvent as __enrichEditEventForTest };
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
    // avant/après fournis par le provider (diff immédiat sans git) — clé =
    // chemin ORIGINAL de event.files, portés sur l'entrée fichier normalisée
    const sn = event.snippets && typeof event.snippets === "object" ? event.snippets[p] : null;
    files.push({
      path: rel, add, del,
      ...(sn && typeof sn.newText === "string" ? {
        newText: sn.newText,
        ...(typeof sn.oldText === "string" ? { oldText: sn.oldText } : {}),
      } : {}),
    });
  }
  return {
    kind: "edit",
    projectRoot: root,
    baseSha: turn.snapshotSha || null,
    files,
    ts: Date.now(),
  };
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
const sendChains = new Map(); // threadId -> chaîne de sérialisation des sends (anti-course)

/** Réinitialise l'état harnais par-thread (tests uniquement) : en production un
 * threadId = un thread pour la vie du process, mais les tests réutilisent les
 * mêmes ids et ne doivent pas hériter d'un harnais/journal d'un test précédent. */
export function __resetHarnessStateForTest() {
  harnessThreads.clear();
  threadRuns.clear();
  threadDispatchers.clear();
  emitBox.clear();
  sendChains.clear();
  journalReady.clear();
  harnessJournalUsed.clear();
  pending.clear();
  interactionWaiters.clear();
  approvalSessions.clear();
  permWaiters.clear();
}

/** Sérialise le traitement des `send` d'un MÊME thread : deux frames WS
 * rapprochées ne doivent pas franchir ensemble le check « running » (les deux
 * awaits internes — seed legacy, snapshot — laissent sinon démarrer deux runs
 * concurrents qui écrasent le dispatcher). Plan 025 : course entre deux sends. */
function withThreadSendLock(threadId, work) {
  const prev = sendChains.get(threadId) ?? Promise.resolve();
  const next = prev.then(work, work);
  sendChains.set(threadId, next.then(() => {}, () => {}));
  return next;
}

/** Événement durable HORS-TURN émis par un provider (goal thread-level de Codex
 * via thread/goal/updated) : passe par le harnais du thread pour porter meta +
 * sequence et atteindre le journal. Sans harnais actif (thread au repos), repli
 * broadcast direct — le goal sera re-fetché en live au besoin. Plan 025. */
export async function emitProviderGlobal(threadId, event, ctx = {}) {
  if (!threadId) return false;
  const emit = ctx.broadcast ?? ctx.send;
  if (emit) emitBox.set(threadId, emit);
  const provider = ctx.store?.get(threadId)?.provider ?? event?.meta?.provider ?? "codex";
  await ensureLegacySeed(ctx, threadId, provider);
  const h = await harnessFor(ctx, threadId, provider);
  await h.emitGlobal(event, { origin: "provider" });
  return true;
}

// Threads dont le journal peut recevoir des événements : seedés, OU sans
// historique antérieur à migrer. Un thread dont le seed legacy a ÉCHOUÉ n'y
// figure pas → son harnais n'écrit rien tant que le seed n'a pas réussi, pour
// que la migration reste retentable (plan 025).
const journalReady = new Set();
const harnessJournalUsed = new Map(); // threadId -> bool (le harnais cache a-t-il été créé AVEC journal ?)

function dialogueScore(events) {
  let texts = 0;
  let users = 0;
  for (const event of events ?? []) {
    if (event?.kind === "text") texts += 1;
    else if (event?.kind === "user") users += 1;
  }
  return [texts, users];
}

function preferRicherDialogue(journalEvents, nativeEvents) {
  const [journalTexts, journalUsers] = dialogueScore(journalEvents);
  const [nativeTexts, nativeUsers] = dialogueScore(nativeEvents);
  const nativeIsRicher = nativeTexts > journalTexts ||
    (nativeTexts === journalTexts && nativeUsers > journalUsers);
  if (!nativeIsRicher) return journalEvents;

  // Le transcript Grok contient les réponses les plus complètes, mais ses
  // messages user sont les prompts provider enrichis. Apparier les vrais
  // textes Atelier dans l'ordre permet aussi de respecter les rewinds : un
  // tour encore présent chez Grok mais tombstoné dans le journal est omis avec
  // sa réponse, tandis que les attachments des tours conservés restent des
  // labels structurés.
  if (journalUsers > 0) {
    const displayUsers = journalEvents.filter((event) => event?.kind === "user");
    const merged = [];
    let displayIndex = 0;
    let keepTurn = false;
    for (const event of nativeEvents) {
      if (event?.kind === "user") {
        const display = displayUsers[displayIndex];
        const nativeText = stripZoteroPassageInstruction(stripGalleryToolInstruction(event.text)).trim();
        const displayText = String(display?.text ?? "").trim();
        keepTurn = !!displayText &&
          (nativeText === displayText || nativeText.endsWith(`\n\n${displayText}`));
        if (keepTurn) {
          merged.push(display);
          displayIndex += 1;
        }
      } else if (keepTurn) {
        merged.push(event);
      }
    }
    if (displayIndex === displayUsers.length) return merged;
  }
  return nativeEvents;
}

async function harnessFor(ctx, threadId, provider) {
  const journal = (ctx.harnessJournal && journalReady.has(threadId)) ? ctx.harnessJournal : null;
  const wantJournal = !!journal;
  let h = harnessThreads.get(threadId);
  // recréer le harnais si l'état de journalisation a changé (seed devenu prêt)
  if (h && harnessJournalUsed.get(threadId) !== wantJournal && !threadRuns.get(threadId)) {
    h = null;
  }
  if (!h) {
    // reprise d'un thread journalisé : la sequence reste monotone entre process
    const initialSequence = journal ? await journal.lastSequence(threadId).catch(() => 0) : 0;
    h = createHarnessThread({
      threadId,
      provider,
      emit: (event) => emitBox.get(threadId)?.({ type: "event", threadId, event }),
      journal,
      initialSequence,
    });
    harnessThreads.set(threadId, h);
    harnessJournalUsed.set(threadId, wantJournal);
  }
  h.setProvider(provider);
  return h;
}

/** Migration (plan 025 step 7) : au premier send d'un thread existant sans
 * journal, son historique provider est seedé UNE fois en legacy-import — le
 * premier message post-upgrade ne masque pas l'historique ancien. Un échec de
 * seed n'empêche pas le run : avertissement, parité historique non garantie. */
async function ensureLegacySeed(ctx, threadId, provider) {
  const j = ctx.harnessJournal;
  if (!j) { journalReady.add(threadId); return; }
  if (journalReady.has(threadId)) return;
  // Un journal existant n'est « prêt » que s'il porte le marqueur legacySeed.
  // Un header seul provient possiblement d'un seed interrompu : il doit être retenté.
  if (j.hasJournal(threadId)) {
    const current = await j.load(threadId);
    if (current.header?.legacySeeded || current.events.length > 0) {
      journalReady.add(threadId);
      return;
    }
  }
  const t = ctx.store.get(threadId);
  if (!t?.sessionId) { journalReady.add(threadId); return; } // thread neuf : rien à migrer
  // RETENTABLE (plan 025) : charge l'historique AVANT de créer le journal.
  // Un échec (NAS injoignable) ne crée AUCUN fichier ET ne marque pas le thread
  // « prêt » → son tour ne journalise pas, et le seed est réessayé au prochain
  // send. Une fois seedé, le harnais est recréé AVEC journal (harnessFor).
  try {
    let events = [];
    if (t.provider === "claude") events = (await ctx.history?.claudeHistory?.(t.sessionId, t.projectRoot)) ?? [];
    else if (t.provider === "codex") events = (await ctx.sessions?.codexHistory?.(t.sessionId)) ?? [];
    else if (t.provider === "grok") events = (await ctx.sessions?.grokHistory?.(t.sessionId, t.projectRoot)) ?? [];
    else {
      const p = ctx.providers?.[t.provider];
      if (typeof p?.history === "function") events = (await p.history(t.sessionId, t.projectRoot)) ?? [];
    }
    const seeded = await j.seedLegacy(threadId, t.provider ?? provider, events);
    if (!seeded) {
      const check = await j.load(threadId);
      if (!check.header?.legacySeeded) throw new Error("écriture du seed legacy refusée");
    }
    journalReady.add(threadId);
  } catch (e) {
    (emitBox.get(threadId) ?? ctx.send)({
      type: "error",
      threadId,
      message: `journal: seed de l'historique impossible (${String(e?.message ?? e)}) — sera réessayé (ce tour non journalisé)`,
    });
  }
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
  const { __ephemeral = false, ...rawPublicEvent } = event;
  const publicEvent = rawPublicEvent.kind === "text" && turn.permissionMode === "plan"
    ? {
        kind: "proposed_plan",
        planId: turn.planId ??= `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        markdown: String(rawPublicEvent.text ?? ""),
        provider: turn.provider,
        source: "plan-mode",
        ts: rawPublicEvent.ts ?? Date.now(),
      }
    : rawPublicEvent;
  collectTool(turn.tools, publicEvent);
  if (publicEvent.kind === "text") turn.lastText = publicEvent.text;
  if (publicEvent.kind === "proposed_plan") turn.lastText = publicEvent.markdown;

  // le provider annonce son turn natif (Codex turn/started) → l'attacher au turn
  // universel pour que meta.nativeTurnId apparaisse sur tous les événements suivants
  if (publicEvent.nativeTurnId) h.setNativeTurnId(turnId, publicEvent.nativeTurnId);

  if (publicEvent.kind === "edit") {
    // enrichissement async (±lignes git) sérialisé par le harnais : ne peut
    // pas être dépassé par le done qui suit
    await h.emit(turnId, enrichEditEvent(ctx, turn, publicEvent));
    return;
  }
  if (publicEvent.kind !== "done" && publicEvent.kind !== "error") {
    await h.emit(turnId, publicEvent, { durable: !__ephemeral });
    return;
  }

  // terminal — exactement un par turn (un doublon est refusé par le harnais)
  declineThreadInteractions(threadId);
  const outEvent = publicEvent.kind === "done" ? await enrichDoneEvent(ctx, turn, publicEvent) : publicEvent;
  const accepted = await h.terminal(turnId, outEvent);
  if (!accepted) return;
  ctx.automations?.recordEvent(threadId, publicEvent, ctx.broadcast ?? ctx.send);
  threadRuns.delete(threadId);

  if (publicEvent.kind === "done") {
    emitGitChanged(ctx, threadId, turn.projectRoot);
    maybeAutoReview(ctx, emit, turn, run.autoReview);
    appendLedgerForDone(ctx, turn, outEvent).catch((e) => {
      emit({ type: "error", threadId, message: `ledger: ${String(e)}` });
    });
  }
  ctx.store.upsert({ id: threadId, status: publicEvent.kind === "done" ? "done" : "idle" });
  emit({ type: "threads", threads: ctx.store.list() });
  if (publicEvent.kind === "done" && publicEvent.ok !== false) {
    maybeTitleThread(ctx, emit, threadId, turn.titlePrompt).catch(() => {});
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
  const { threadId, projectRoot, provider, prompt } = msg;
  const p = ctx.providers[provider];
  const emit = emitBox.get(threadId) ?? ctx.broadcast ?? ctx.send;
  const prev = ctx.store.get(threadId);
  if (prev?.provider && prev.provider !== provider) {
    throw new Error(`provider immuable pour ce fil (${prev.provider}); handoff requis vers ${provider}`);
  }

  // Sélection effective du tour. Les envois « nus » du frontend (renvoi après
  // rewind, tour de correction auto-review) ne portent pas la sélection du
  // composer : réutiliser la dernière sélection connue du thread — sans quoi
  // le repli sûr des providers (mode inconnu → read-only, plan 025)
  // rétrograderait le thread Codex en lecture seule pour tout le reste de la
  // session alors que le composer affiche Full access. model/effort ne sont
  // repris que sous le MÊME provider (les ids de modèles ne se transfèrent
  // pas d'un provider à l'autre lors d'un handoff).
  const last = prev?.lastTurn ?? {};
  const sameProvider = last.provider === provider;
  const model = msg.model ?? (sameProvider ? last.model : null) ?? null;
  const effort = msg.effort ?? (sameProvider ? last.effort : null) ?? null;
  const permissionMode = msg.permissionMode ?? last.permissionMode ?? null;
  const baseProviderPrompt = typeof prev?.forkContext === "string" && prev.forkContext
    ? prev.forkContext + prompt
    : prompt;
  // Cadence d'injection (2026-07-19) : ces blocs étaient REcollés à chaque
  // message alors que l'historique natif du provider les conserve tous — une
  // conversation Kimi à 7 sources a dépassé les 2 Mo de la limite API. Les
  // instructions statiques (galerie, zotero) ne partent qu'au PREMIER tour de
  // la session provider ; le bloc KB repart seulement si son hash change
  // (sélection/contenu). blocksSeededFor suit la session réellement utilisée :
  // une session neuve (repli provider) re-sème tout au tour suivant.
  const seeded = !!prev?.sessionId && prev?.blocksSeededFor === prev.sessionId;
  const galleryPrompt = seeded ? baseProviderPrompt : withGalleryToolInstruction(baseProviderPrompt, {
    projectRoot,
    toolPath: join(dirname(fileURLToPath(import.meta.url)), "atelier-gallery-tool"),
  });
  const zoteroPrompt = seeded ? galleryPrompt : withZoteroPassageInstruction(galleryPrompt, {
    toolPath: join(dirname(fileURLToPath(import.meta.url)), "atelier-zotero-passages"),
  });
  // Bloc base de connaissances (plan 049 T4) : sources attachées au thread.
  // La KB ne bloque JAMAIS un envoi — toute erreur dégrade en prompt inchangé.
  let providerPrompt = zoteroPrompt;
  let turnKbHash = null;
  try {
    const kbIds = Array.isArray(prev?.kbSourceIds) ? prev.kbSourceIds : [];
    if (kbIds.length) {
      const kbStore = new KnowledgeStore(defaultKnowledgeDir());
      const withBlock = withKbBlock(zoteroPrompt, {
        toolPath: join(dirname(fileURLToPath(import.meta.url)), "atelier-kb"),
        entries: kbBlockEntries(kbStore, kbIds, prev?.kbFullContent),
        gbrain: kbIds.includes("gbrain"),
      });
      if (withBlock !== zoteroPrompt) {
        turnKbHash = createHash("md5").update(withBlock.slice(zoteroPrompt.length)).digest("hex");
        if (!seeded || turnKbHash !== (prev?.kbBlockHash ?? null)) providerPrompt = withBlock;
      }
    }
  } catch {}

  ctx.store.upsert({
    id: threadId,
    status: "running",
    // mémoriser la sélection quand le message la porte (le composer envoie
    // toujours permissionMode ; son absence signe un renvoi programmatique,
    // qu'on ne mémorise pas pour ne pas écraser le vrai choix utilisateur)
    ...(msg.permissionMode
      ? { lastTurn: { provider, model: msg.model ?? null, effort: msg.effort ?? null, permissionMode: msg.permissionMode } }
      : {}),
  });
  emit({ type: "threads", threads: ctx.store.list() });

  const tools = [];
  const snapshotSha = await snapshotBeforeProvider(ctx, threadId);
  const displayEvent = normalizeDisplayEvent(msg);
  const titlePrompt = String(displayEvent?.text ?? "").trim() || prompt;
  const turn = { threadId, projectRoot, provider, model, effort, permissionMode, prompt, titlePrompt, tools, snapshotSha, lastText: "" };

  let turnId;
  if (reservedTurnId) {
    h.activateQueued(reservedTurnId);
    turnId = reservedTurnId;
  } else {
    turnId = h.startTurn({
      messageId: msg.clientMessageId,
      userEvent: displayEvent,
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
        prompt: providerPrompt,
        sessionId: prev?.sessionId ?? null,
        model,
        effort,
        permissionMode,
        onPermissionRequest: makePermissionRelay(ctx, emit, threadId, permissionMode),
        mode: msg.mode,
        resumeAt: prev?.resumeAt ?? null,
        fork: prev?.forkPending ?? false,
        onSession: (sessionId) =>
          ctx.store.upsert({ id: threadId, sessionId, resumeAt: null, forkPending: false,
            blocksSeededFor: sessionId, kbBlockHash: turnKbHash }),
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
    prompt: providerPrompt,
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
      ctx.store.upsert({ id: threadId, sessionId, forkContext: null, forkPending: false,
        blocksSeededFor: sessionId, kbBlockHash: turnKbHash });
      emit({ type: "threads", threads: ctx.store.list() });
    })
    .catch((e) => dispatcher({ kind: "error", message: String(e) }));
}

export async function route(msg, ctx) {
  switch (msg.type) {
    case "listAutomations": {
      ctx.send({ type: "automations", automations: ctx.automations?.list() ?? [] });
      break;
    }
    case "createAutomation": {
      ctx.automations?.create(msg.automation ?? msg);
      ctx.send({ type: "automations", automations: ctx.automations?.list() ?? [] });
      break;
    }
    case "updateAutomation": {
      ctx.automations?.update(msg.automation ?? msg);
      ctx.send({ type: "automations", automations: ctx.automations?.list() ?? [] });
      break;
    }
    case "deleteAutomation": {
      ctx.automations?.delete(String(msg.id ?? ""));
      ctx.send({ type: "automations", automations: ctx.automations?.list() ?? [] });
      break;
    }
    case "runAutomationNow": {
      const threadId = await ctx.automations?.execute(String(msg.id ?? ""), ctx, route, false);
      ctx.send({ type: "automationRunStarted", id: msg.id, threadId });
      ctx.send({ type: "automations", automations: ctx.automations?.list() ?? [] });
      break;
    }
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
    case "kbAdd": {
      // Base de connaissances (plan 049 T2) : épinglage d'une source — web
      // depuis le browser intégré (texte capturé fourni, pas de re-fetch) ou
      // tout kind accepté par le store. Réponse kbAdded / kbError.
      try {
        const store = new KnowledgeStore(defaultKnowledgeDir());
        const { source, refreshed } = await store.add({
          kind: msg.kind, origin: msg.origin, title: msg.title, text: msg.text,
        });
        ctx.send({ type: "kbAdded", source, refreshed, ...(store.warning ? { warning: store.warning } : {}) });
      } catch (error) {
        let message = error instanceof Error ? error.message : String(error);
        // échec du repli fetch alors que l'utilisateur vient DÉJÀ du bouton
        // livre : ne pas le renvoyer en boucle vers ce même bouton
        if (msg.via === "browser" && message.includes("bloque le téléchargement direct")) {
          message = "La capture du texte n'a rien donné et le site bloque le téléchargement direct — recharge la page, attends la fin du chargement, puis reclique le livre.";
        }
        ctx.send({ type: "kbError", message });
      }
      break;
    }
    case "kbList": {
      // liste des sources pour le picker du composer (plan 049 T3)
      try {
        const store = new KnowledgeStore(defaultKnowledgeDir());
        ctx.send({
          type: "kbSources", sources: store.list(),
          collections: store.collections ?? [],
          archivedCount: store.listAll().length - store.list().length,
          archivedSources: store.list({ archived: true }),
          ...(store.warning ? { warning: store.warning } : {}),
        });
      } catch (error) {
        ctx.send({ type: "kbError", message: error instanceof Error ? error.message : String(error) });
      }
      break;
    }
    case "kbCollection":
    case "kbTag":
    case "kbArchive": {
      // organisation de la base (plan 051 P1) : mutation puis liste complète
      try {
        const store = new KnowledgeStore(defaultKnowledgeDir());
        if (msg.type === "kbCollection") {
          store.collectionOp({ op: msg.op, slug: msg.slug, title: msg.title });
        } else if (msg.type === "kbTag") {
          if (Array.isArray(msg.ids)) store.tagMany(msg.ids, msg.collection, msg.off === true);
          else store.tagSource(msg.id, msg.collection, msg.off === true);
        } else if (Array.isArray(msg.ids)) {
          store.archiveMany(msg.ids, msg.off === true);
        } else {
          store.archiveSource(msg.id, msg.off === true);
        }
        ctx.send({
          type: "kbSources", sources: store.list(),
          collections: store.collections ?? [],
          archivedCount: store.listAll().length - store.list().length,
          archivedSources: store.list({ archived: true }),
          ...(store.warning ? { warning: store.warning } : {}),
        });
      } catch (error) {
        ctx.send({ type: "kbError", message: error instanceof Error ? error.message : String(error) });
      }
      break;
    }
    case "kbRemove": {
      // suppression d'une source depuis le picker : liste à jour + purge des
      // références dans TOUS les threads (sinon pilules orphelines dans les
      // conversations non actives), threads broadcastés si touchés.
      try {
        const store = new KnowledgeStore(defaultKnowledgeDir());
        store.remove(msg.id);
        ctx.send({
          type: "kbSources", sources: store.list(),
          collections: store.collections ?? [],
          archivedCount: store.listAll().length - store.list().length,
          archivedSources: store.list({ archived: true }),
          ...(store.warning ? { warning: store.warning } : {}),
        });
        if (ctx.store) {
          let touched = false;
          for (const thread of ctx.store.list()) {
            const ids = Array.isArray(thread.kbSourceIds) ? thread.kbSourceIds : [];
            const full = Array.isArray(thread.kbFullContent) ? thread.kbFullContent : [];
            if (!ids.includes(msg.id) && !full.includes(msg.id)) continue;
            ctx.store.upsert({
              id: thread.id,
              kbSourceIds: ids.filter((x) => x !== msg.id),
              kbFullContent: full.filter((x) => x !== msg.id),
            }, { preserveUpdatedAt: true });
            touched = true;
          }
          if (touched) (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
        }
      } catch (error) {
        ctx.send({ type: "kbError", message: error instanceof Error ? error.message : String(error) });
      }
      break;
    }
    case "kbPromote": {
      // promotion d'une source vers le corpus gbrain (plan 049 T7)
      try {
        const store = new KnowledgeStore(defaultKnowledgeDir());
        const { id } = promoteToGbrain(store, msg.id, ctx.kbPromoteDeps ?? {});
        ctx.send({ type: "kbPromoted", id });
      } catch (error) {
        ctx.send({ type: "kbError", message: error instanceof Error ? error.message : String(error) });
      }
      break;
    }
    case "kbPromotePage": {
      // page directe gbrain (plan 050 P4) : aperçu sans write, écriture
      // seulement sur confirmation explicite de l'UI (write: true)
      try {
        const store = new KnowledgeStore(defaultKnowledgeDir(), ctx.kbDeps ?? {});
        const out = promotePage(store, {
          id: msg.id, slug: msg.slug, write: msg.write === true,
        }, ctx.kbDeps ?? {});
        ctx.send(out.written
          ? { type: "kbPageWritten", id: out.id, slug: out.slug, updated: out.updated }
          : { type: "kbPagePreview", id: out.id, slug: out.slug, exists: out.exists, title: out.title, chars: out.chars, preview: out.preview });
      } catch (error) {
        ctx.send({ type: "kbError", message: error instanceof Error ? error.message : String(error) });
      }
      break;
    }
    case "gbrainSearch": {
      // recherche du corpus NAS (plan 050 P3) — relais du CLI. Échec (NAS
      // coupé, binaire absent) = gbrainResults avec `error`, en place.
      try {
        const out = await runKbCommand(
          ["gbrain-search", "--query", String(msg.query ?? ""), "--limit", String(msg.limit ?? 12)],
          ctx.kbDeps ?? {},
        );
        ctx.send({ type: "gbrainResults", query: out.query, results: out.results });
      } catch (error) {
        ctx.send({
          type: "gbrainResults", query: String(msg.query ?? ""), results: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }
    case "upsertThread": {
      // patch partiel d'un thread (parité avec la route Rust) — utilisé par le
      // picker KB (T3) pour persister kbSourceIds/kbFullContent par thread.
      try {
        ctx.store.upsert(msg.thread ?? {});
        (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      } catch (error) {
        ctx.send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
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
    case "savePlan": {
      const thread = ctx.store.get(msg.threadId);
      if (!thread?.projectRoot) { ctx.send({ type: "error", threadId: msg.threadId, message: "plan: projet introuvable" }); break; }
      const markdown = String(msg.markdown ?? "");
      if (!markdown.trim() || markdown.length > 1_000_000) { ctx.send({ type: "error", threadId: msg.threadId, message: "plan: contenu invalide" }); break; }
      const stem = String(msg.fileName ?? "plan").replace(/\.md$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "plan";
      const dir = join(thread.projectRoot, ".plan");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${stem}.md`);
      writeFileSync(path, markdown, { mode: 0o600 });
      ctx.send({ type: "planSaved", threadId: msg.threadId, planId: msg.planId, path, scope: "project" });
      break;
    }
    case "exportPlan": {
      const markdown = String(msg.markdown ?? "");
      const path = String(msg.path ?? "");
      if (!markdown.trim() || markdown.length > 1_000_000 || !isAbsolute(path) || !path.toLowerCase().endsWith(".md")) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "plan: destination invalide" });
        break;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, markdown, { mode: 0o600 });
      ctx.send({ type: "planSaved", threadId: msg.threadId, planId: msg.planId, path, scope: "export" });
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
      // Claude peut bifurquer nativement. Les autres providers repartent dans
      // une session neuve et reçoivent une seule fois le transcript copié.
      const src = ctx.store.get(msg.fromThreadId);
      if (!src) {
        ctx.send({ type: "error", message: "fork indisponible pour ce chat" });
        break;
      }
      const nativeClaudeFork = src.provider === "claude" && !!src.sessionId;
      const forkContext = nativeClaudeFork ? null : buildForkContext(msg.contextEvents, src.provider);
      ctx.store.upsert({
        id: msg.newThreadId,
        projectRoot: src.projectRoot,
        provider: src.provider,
        title: "⑂ " + (src.title ?? "fork"),
        sessionId: nativeClaudeFork ? src.sessionId : null,
        forkPending: nativeClaudeFork,
        forkContext,
        status: "idle",
      });
      // le fork reçoit une COPIE du journal du thread SOURCE (fromThreadId)
      // jusqu'au point de fork (eventId) — le reste ne fait pas partie du fork
      Promise.resolve(
        ctx.harnessJournal?.copyThread(msg.fromThreadId, msg.newThreadId, msg.eventId),
      ).catch((e) => console.warn("[atelier] copie journal du fork impossible:", e));
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "revert": {
      // revert = tombstone NON destructif dans le journal par eventId (source de
      // vérité du transcript), + rewind best-effort de la session provider pour
      // que le prochain send reprenne au bon point (resumeSessionAt).
      const t = ctx.store.get(msg.threadId);
      if (!t) {
        ctx.send({ type: "error", threadId: msg.threadId, message: "revert indisponible" });
        break;
      }
      const scope = msg.scope === "files" ? "files" : "thread";
      if (msg.snapshotSha) {
        let checkpoint = null;
        try { checkpoint = await validatedCheckpoint(ctx, msg.threadId, msg); } catch {}
        if (!checkpoint || !t.projectRoot) {
          ctx.send({ type: "error", threadId: msg.threadId, message: "checkpoint introuvable" });
          break;
        }
        try {
          // périmètre du checkpoint : ne restaurer QUE les fichiers du tour —
          // les fichiers créés ailleurs par d'autres sessions ne bloquent plus
          const scopePaths = Array.isArray(checkpoint.event?.checkpoint?.filesChanged) && checkpoint.event.checkpoint.filesChanged.length
            ? checkpoint.event.checkpoint.filesChanged
            : null;
          await ctx.gitops.restore(t.projectRoot, checkpoint.sha, scopePaths);
        } catch (e) {
          ctx.send({ type: "error", threadId: msg.threadId, message: String(e?.message ?? e) });
          break;
        }
        emitGitChanged(ctx, msg.threadId, t.projectRoot);
        if (scope === "files") {
          ctx.send({ type: "reverted", threadId: msg.threadId, scope: "files", snapshotSha: checkpoint.sha });
          break;
        }
      } else if (scope === "files") {
        ctx.send({ type: "error", threadId: msg.threadId, message: "checkpoint introuvable" });
        break;
      }
      // 1) journal : tronquer par eventId (primaire) ou, en repli legacy, par le
      // texte du message user (findRevertPoint historique)
      let truncated = false;
      if (ctx.harnessJournal?.hasJournal(msg.threadId)) {
        try {
          let eventId = msg.eventId ?? null;
          if (!eventId && msg.text != null) {
            const { events } = await ctx.harnessJournal.load(msg.threadId);
            const target = events.find((e) => e.kind === "user" &&
              String(e.text ?? "").trim() === String(msg.text ?? "").trim());
            eventId = target?.meta?.eventId ?? null;
          }
          if (eventId) truncated = await ctx.harnessJournal.truncateFrom(msg.threadId, eventId);
        } catch (e) {
          console.warn("[atelier] tombstone revert journal impossible:", e);
        }
      }
      // 2) rewind de la session native Claude (best-effort — un thread Codex/API
      // ou sans findRevertPoint garde juste le tombstone du journal)
      if (t.provider === "claude" && t.sessionId && ctx.history?.findRevertPoint && msg.text != null) {
        try {
          ctx.providers.claude?.endSession?.(msg.threadId);
          const pt = await ctx.history.findRevertPoint(t.sessionId, t.projectRoot, msg.text);
          if (pt.found) {
            if (pt.uuid) ctx.store.upsert({ id: msg.threadId, resumeAt: pt.uuid, status: "idle" });
            else ctx.store.upsert({ id: msg.threadId, sessionId: null, resumeAt: null, status: "idle" });
          } else if (!truncated) {
            ctx.send({ type: "error", threadId: msg.threadId, message: "message introuvable dans la session" });
            break;
          }
        } catch (e) {
          console.warn("[atelier] rewind session revert impossible:", e);
        }
      }
      ctx.send({ type: "reverted", threadId: msg.threadId, scope: "thread" });
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
      if (w && msg.threadId === w.threadId && w.clientInstanceId != null &&
          msg.clientInstanceId === w.clientInstanceId &&
          ctx.clientInstanceId === w.clientInstanceId) {
        if (msg.response?.allow === true && msg.response?.scope === "session") {
          approvalSessions.add(w.threadId);
        }
        w.answer(msg.response ?? null);
      }
      break;
    }
    case "clientHello": {
      const id = String(msg.clientInstanceId ?? "");
      if (/^[0-9a-f-]{20,}$/i.test(id)) ctx.clientInstanceId = id;
      break;
    }
    case "ping":
      ctx.send({ type: "pong" });
      break;
    case "listCommands":
      ctx.send({ type: "commands", commands: ctx.catalog.listCommands(msg.projectRoot) });
      break;
    case "listPlugins": {
      try {
        const plugins = await ctx.providers.codex.listAtelierPlugins(msg.projectRoot ?? "");
        ctx.send({ type: "plugins", plugins });
      } catch (e) {
        ctx.send({ type: "error", message: `plugins: ${String(e?.message ?? e)}` });
      }
      break;
    }
    case "listFiles":
      ctx.send({ type: "files", projectRoot: msg.projectRoot,
        files: ctx.catalog.listFiles(msg.projectRoot) });
      break;
    case "narvalStatus":
    case "narvalSnapshot":
    case "narvalListDirectory":
    case "narvalInspectJob":
    case "narvalReadText": {
      const requestId = msg.requestId ?? null;
      const types = {
        narvalStatus: "narvalStatus",
        narvalSnapshot: "narvalSnapshot",
        narvalListDirectory: "narvalDirectory",
        narvalInspectJob: "narvalJobDetail",
        narvalReadText: "narvalText",
      };
      try {
        let data;
        if (msg.type === "narvalStatus") data = await narval.status(msg.profile);
        else if (msg.type === "narvalSnapshot") data = await narval.snapshot(msg.profile);
        else if (msg.type === "narvalListDirectory") data = await narval.listDirectory(msg.profile, msg.path);
        else if (msg.type === "narvalInspectJob") data = await narval.inspectJob(msg.profile, msg.jobId);
        else data = await narval.readText(msg.profile, msg.path, msg.tailLines);
        ctx.send({ type: types[msg.type], requestId, ...(msg.path ? { path: msg.path } : {}), data });
      } catch (error) {
        ctx.send({ type: types[msg.type], requestId, ...(msg.path ? { path: msg.path } : {}), error: narval.publicError(error) });
      }
      break;
    }
    case "gitStatus": {
      const root = gitRootFor(ctx, msg);
      ctx.send({ type: "gitStatus", projectRoot: root, status: await ctx.gitops.status(root) });
      break;
    }
    case "gitDiff": {
      const root = gitRootFor(ctx, msg);
      try {
        const scope = msg.scope === "staged" ? "staged" : "changes";
        const contents = msg.path
          ? await ctx.gitops.diffContents(root, msg.path, { scope, base: msg.baseSha ?? null })
          : {};
        ctx.send({ type: "gitDiff", requestId: msg.requestId ?? null, projectRoot: root, path: msg.path ?? null,
          scope, diff: scope === "staged"
            ? await ctx.gitops.diffStaged(root, msg.path ?? null)
            : await ctx.gitops.diff(root, msg.path ?? null), ...contents });
      } catch (error) {
        ctx.send({ type: "gitDiff", requestId: msg.requestId ?? null, projectRoot: root, path: msg.path ?? null,
          scope: msg.scope ?? "changes", diff: "", error: String(error?.message ?? error) });
      }
      break;
    }
    case "generateCommitMsg": {
      const root = gitRootFor(ctx, msg);
      try {
        const scope = msg.scope === "staged" ? "staged" : "changes";
        const status = await ctx.gitops.status(root);
        const context = commitGenerationContext(status, scope === "staged");
        if (!context) throw new Error(scope === "staged"
          ? "Indexe au moins un fichier avant de générer le message."
          : "Aucune modification à résumer.");
        const generate = ctx.providers?.claude?.commitMessage;
        if (typeof generate !== "function") throw new Error("Claude Code est indisponible pour générer le message.");
        const message = await generate.call(ctx.providers.claude, context);
        if (!String(message ?? "").trim()) throw new Error("L’IA n’a retourné aucun message de commit.");
        ctx.send({ type: "commitMsg", projectRoot: root, message });
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
      const paths = Array.isArray(msg.paths) ? msg.paths : [msg.path].filter(Boolean);
      await ctx.gitops.stageFiles(root, paths);
      emitGitChanged(ctx, msg.threadId, root);
      ctx.send({ type: "gitStageDone", projectRoot: root, paths });
      break;
    }
    case "gitUnstage": {
      const root = gitRootFor(ctx, msg);
      const paths = Array.isArray(msg.paths) ? msg.paths : [msg.path].filter(Boolean);
      await ctx.gitops.unstageFiles(root, paths);
      emitGitChanged(ctx, msg.threadId, root);
      ctx.send({ type: "gitUnstageDone", projectRoot: root, paths });
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
      // le journal privé du thread part avec lui (chemin hashé uniquement)
      Promise.resolve(ctx.harnessJournal?.deleteThread(msg.threadId)).catch(() => {});
      harnessThreads.delete(msg.threadId);
      threadDispatchers.delete(msg.threadId);
      emitBox.delete(msg.threadId);
      journalReady.delete(msg.threadId);
      harnessJournalUsed.delete(msg.threadId);
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
      // journal canonique d'abord (plan 025) : replay sémantique complet, avec
      // meta. Exception Grok : les anciens runs Rust n'ont journalisé que les
      // deltas éphémères, donc le journal peut contenir user+done sans aucune
      // réponse. Le transcript natif est alors choisi EN BLOC s'il porte un
      // dialogue plus complet (jamais concaténé, donc aucun doublon).
      if (ctx.harnessJournal?.hasJournal(msg.threadId)) {
        try {
          let events = await ctx.harnessJournal.materialize(msg.threadId);
          if (t?.provider === "grok" && t.sessionId && ctx.sessions?.grokHistory) {
            const native = await ctx.sessions.grokHistory(t.sessionId, t.projectRoot);
            events = preferRicherDialogue(events, native);
          }
          ctx.send({ type: "history", threadId: msg.threadId, events });
          break;
        } catch (e) {
          console.warn("[atelier] journal illisible, repli loaders provider:", e);
        }
      }
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
    case "getAgentHistory": {
      const agentThreadId = String(msg.agentThreadId ?? "");
      const events = await (ctx.sessions?.codexHistory?.(agentThreadId) ?? []);
      ctx.send({
        type: "agentHistory",
        parentThreadId: msg.parentThreadId ?? "",
        agentThreadId,
        // Le prompt parent appartient au chat principal. Le panneau enfant ne
        // montre que les messages réellement émis par le sous-agent.
        events: events.filter((event) => event?.kind !== "user"),
      });
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
        await ctx.providers.codex.compactThread({
          sessionId: t.sessionId,
          cwd: t.projectRoot || process.env.HOME,
          // mode réel du thread : un resume read-only rétrograderait son sandbox
          permissionMode: t.lastTurn?.permissionMode ?? null,
        });
        // frontière via le HARNAIS : meta + sequence monotone + journal (pas de
        // broadcast direct qui laisserait un trou de sequence, plan 025)
        emitBox.set(msg.threadId, ctx.broadcast ?? ctx.send);
        await ensureLegacySeed(ctx, msg.threadId, "codex");
        const h = await harnessFor(ctx, msg.threadId, "codex");
        await h.emitGlobal({ kind: "tool", name: "__compacted" }, { origin: "atelier" });
      } catch (e) {
        ctx.send({ type: "error", threadId: msg.threadId, message: `compact: ${String(e?.message ?? e)}` });
      }
      break;
    }
    case "codexClear": {
      // nouvelle session NATIVE au prochain message, MÊME thread Atelier : le
      // transcript est conservé, la frontière passe par le harnais (meta +
      // sequence + journal), pas un broadcast direct
      emitBox.set(msg.threadId, ctx.broadcast ?? ctx.send);
      await ensureLegacySeed(ctx, msg.threadId, "codex");
      const h = await harnessFor(ctx, msg.threadId, "codex");
      await h.emitGlobal({ kind: "tool", name: "__session-cleared" }, { origin: "atelier" });
      if (ctx.store.get(msg.threadId)) ctx.store.upsert({ id: msg.threadId, sessionId: null });
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
        const args = {
          sessionId: t.sessionId,
          cwd: t.projectRoot || process.env.HOME,
          // mode réel du thread : un resume read-only rétrograderait son sandbox
          permissionMode: t.lastTurn?.permissionMode ?? null,
        };
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
            emitBox.set(msg.threadId, emit);
            await ensureLegacySeed(ctx, msg.threadId, "codex");
            const h = await harnessFor(ctx, msg.threadId, "codex");
            await h.emitGlobal({ kind: "goal", cleared: !goal, goal }, { origin: "provider" });
          }
        }
      } catch (e) {
        ctx.send({ type: "error", threadId: msg.threadId, message: `goal: ${String(e?.message ?? e)}` });
      }
      break;
    }
    case "send": {
      // sérialisé par thread : deux frames WS rapprochées ne franchissent pas
      // ensemble le check « running » (course entre deux sends)
      const sourceId = typeof msg.handoffFromThreadId === "string" ? msg.handoffFromThreadId : "";
      if (sourceId && sourceId !== msg.threadId) {
        await withThreadSendLock(sourceId, () =>
          withThreadSendLock(msg.threadId, () => handleSend(msg, ctx)));
      } else {
        await withThreadSendLock(msg.threadId, () => handleSend(msg, ctx));
      }
      break;
    }
    default:
      ctx.send({ type: "error", message: `type inconnu: ${msg.type}` });
  }
}

async function handleSend(msg, ctx) {
  const { threadId, projectRoot, provider, prompt, title, permissionMode } = msg;
  const p = ctx.providers?.[provider];
  if (!p) {
    ctx.send({ type: "error", threadId, message: `provider inconnu: ${provider}` });
    return;
  }
  const emit = ctx.broadcast ?? ctx.send;
  emitBox.set(threadId, emit);

  try {
    await prepareProviderHandoff(ctx, msg);
  } catch (error) {
    emit({ type: "error", threadId, message: String(error?.message ?? error) });
    return;
  }

  // Un run et son fil durable restent liés à leur provider. Un changement de
  // moteur passe obligatoirement par `handoffFromThreadId` vers un NOUVEAU fil.
  const running = threadRuns.get(threadId);
  if (running && running.turn.provider !== provider) {
    emit({
      type: "error",
      threadId,
      message: `changement de provider (${running.turn.provider} → ${provider}) impossible pendant un run — arrêter le tour en cours d'abord`,
    });
    return;
  }

  let prev = ctx.store.get(threadId);
  if (prev?.provider && prev.provider !== provider) {
    const locked = Boolean(prev.sessionId || prev.lastTurn || ctx.harnessJournal?.hasJournal(threadId));
    if (locked) {
      emit({
        type: "error",
        threadId,
        message: `provider immuable pour ce fil (${prev.provider}); créer un handoff vers ${provider}`,
      });
      return;
    }
    ctx.store.upsert({ id: threadId, provider });
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
  const titlePrompt = String(normalizeDisplayEvent(msg)?.text ?? "").trim() || prompt;
  ctx.store.upsert({
    id: threadId,
    projectRoot,
    provider,
    title: prev?.title ?? title ?? titlePrompt.slice(0, 40),
  });

  await ensureLegacySeed(ctx, threadId, provider);
  const h = await harnessFor(ctx, threadId, provider);
  // re-lire après les awaits (sous le lock, ne peut pas avoir changé de course,
  // mais un turn a pu se terminer entre-temps)
  const runningNow = threadRuns.get(threadId);

  // ---- run actif : steer (défaut) ou queue explicite ----
  if (runningNow && msg.mode !== "queue") {
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
      return;
    }
    if (p.steer && await p.steer({ threadId, prompt, inputs: msg.inputs,
        imagePath: msg.imagePath, attachments: msg.attachments })) {
      h.steer({ messageId: msg.clientMessageId, userEvent });
      h.emit(h.activeTurnId(), { kind: "tool", name: "__steered" });
      return;
    }
    // steer refusé par le provider → queue avec le MÊME messageId et un
    // nouveau turnId, sans dupliquer la bulle user (elle est émise ici)
  }
  if (runningNow) {
    const turnId = h.queue({
      messageId: msg.clientMessageId,
      userEvent: normalizeDisplayEvent(msg),
    });
    h.emit(turnId, { kind: "tool", name: "__queued" });
    const q = pending.get(threadId) ?? [];
    q.push({ msg, turnId });
    pending.set(threadId, q);
    return;
  }

  // ---- turn normal (thread au repos) ----
  await startProviderTurn(ctx, h, msg);
}
