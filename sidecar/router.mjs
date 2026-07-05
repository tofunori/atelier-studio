import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { writeFileAtomic } from "./store.mjs";

// ctx: { send(obj), store, providers, broadcast(obj) }

// file d'attente par thread pour les providers SANS steering (Codex) :
// les messages envoyés pendant un run partent automatiquement au tour suivant.
const pending = new Map(); // threadId -> [msg...]
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

function gitRootFor(ctx, msg) {
  const thread = msg.threadId ? ctx.store?.get(msg.threadId) : null;
  const root = msg.root ?? msg.projectRoot ?? thread?.projectRoot;
  if (!root) throw new Error("projectRoot requis");
  return root;
}

function emitGitChanged(ctx, threadId, projectRoot) {
  (ctx.broadcast ?? ctx.send)({ type: "gitChanged", threadId, projectRoot });
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

async function appendLedgerForDone(ctx, turn, event) {
  if (!ctx.ledger?.append || event.kind !== "done") return;
  const thread = ctx.store.get(turn.threadId);
  let filesChanged = [];
  if (turn.projectRoot && turn.snapshotSha && ctx.gitops?.changedSince) {
    try {
      filesChanged = await ctx.gitops.changedSince(turn.projectRoot, turn.snapshotSha);
    } catch {}
  }
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
    case "clearPasted": {
      ctx.send({ type: "pastedCleared", removed: ctx.clearPasted() });
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
      await ctx.gitops.restore(t.projectRoot, t.lastSnapshot);
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
    case "getHistory": {
      const t = ctx.store.get(msg.threadId);
      if (!t?.sessionId) {
        ctx.send({ type: "history", threadId: msg.threadId, events: [] });
        break;
      }
      if (t.provider !== "claude") {
        const events = await ctx.sessions.codexHistory(t.sessionId);
        ctx.send({ type: "history", threadId: msg.threadId, events });
        break;
      }
      const events = await ctx.history.claudeHistory(t.sessionId, t.projectRoot);
      ctx.send({ type: "history", threadId: msg.threadId, events });
      break;
    }
    case "listThreads":
      ctx.send({ type: "threads", threads: ctx.store.list() });
      break;
    case "quickAsk": {
      // session éphémère : hors ThreadStore, hors ledger, hors snapshot git
      const { qaId, prompt, provider = "claude", model, effort } = msg;
      const p = ctx.providers?.[provider];
      if (!p) { ctx.send({ type: "qaEvent", qaId, event: { kind: "error", message: "provider inconnu" } }); break; }
      ctx.qaSessions ??= new Map();
      const prev = ctx.qaSessions.get(qaId);
      const emitQa = (event) => ctx.send({ type: "qaEvent", qaId, event });
      p.run({
        threadId: null,
        cwd: process.env.HOME,
        prompt,
        sessionId: prev?.sessionId ?? null,
        model: model || undefined,
        effort: effort || undefined,
        permissionMode: "default",
        onEvent: emitQa,
      })
        .then(({ sessionId }) => {
          if (sessionId) ctx.qaSessions.set(qaId, { provider, sessionId });
        })
        .catch((e) => emitQa({ kind: "error", message: String(e?.message ?? e) }));
      break;
    }
    case "qaPromote": {
      const s = ctx.qaSessions?.get(msg.qaId);
      if (!s) { ctx.send({ type: "error", message: "session quick ask introuvable" }); break; }
      ctx.store.upsert({
        id: msg.newThreadId,
        projectRoot: msg.projectRoot ?? "",
        provider: s.provider,
        title: "⚡ " + (msg.title ?? "Quick Ask"),
        sessionId: s.sessionId,
        status: "idle",
      });
      ctx.qaSessions.delete(msg.qaId);
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
      break;
    }
    case "send": {
      const { threadId, projectRoot, provider, prompt, title, model, effort, permissionMode } = msg;
      const p = ctx.providers?.[provider];
      if (!p) {
        ctx.send({ type: "error", threadId, message: `provider inconnu: ${provider}` });
        break;
      }
      const emit = ctx.broadcast ?? ctx.send;
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
        emit({ type: "event", threadId, event: { kind: "tool", name: `__provider-switch:${provider}` } });
      }
      ctx.store.upsert({
        id: threadId,
        projectRoot,
        provider,
        title: prev?.title ?? title ?? prompt.slice(0, 40),
        status: "running",
      });
      emit({ type: "threads", threads: ctx.store.list() });

      if (provider === "claude") {
        // session persistante ; steer/queue = priority native du SDK ('now'/'next')
        const tools = [];
        const snapshotSha = await snapshotBeforeProvider(ctx, threadId);
        const turn = { threadId, projectRoot, provider, model, effort, prompt, tools, snapshotSha };
        p.send({
          threadId,
          cwd: projectRoot || process.env.HOME,
          prompt,
          sessionId: prev?.sessionId ?? null,
          model,
          effort,
          permissionMode,
          mode: msg.mode,
          resumeAt: prev?.resumeAt ?? null,
          fork: prev?.forkPending ?? false,
          onSession: (sessionId) =>
            ctx.store.upsert({ id: threadId, sessionId, resumeAt: null, forkPending: false }),
          onEvent: (event) => {
            collectTool(tools, event);
            emit({ type: "event", threadId, event });
            if (event.kind === "done") emitGitChanged(ctx, threadId, projectRoot);
            if (event.kind === "done") appendLedgerForDone(ctx, turn, event).catch((e) => {
              ctx.send({ type: "error", threadId, message: `ledger: ${String(e)}` });
            });
            if (event.kind === "done" || event.kind === "error") {
              ctx.store.upsert({
                id: threadId,
                status: event.kind === "done" ? "done" : "idle",
              });
              emit({ type: "threads", threads: ctx.store.list() });
              if (event.kind === "done" && event.ok !== false) {
                maybeTitleThread(ctx, emit, threadId, prompt).catch(() => {});
              }
              // dépiler la file d'attente explicite
              const q = pending.get(threadId);
              const next = q?.shift();
              if (q && q.length === 0) pending.delete(threadId);
              if (next) route(next, ctx);
            }
          },
        });
        break;
      }

      // providers sans steering (Codex) : file d'attente
      if (prev?.status === "running") {
        const q = pending.get(threadId) ?? [];
        q.push(msg);
        pending.set(threadId, q);
        emit({ type: "event", threadId, event: { kind: "tool", name: "__queued" } });
        break;
      }
      // fire-and-forget : plusieurs threads streament en parallèle
      const tools = [];
      const snapshotSha = await snapshotBeforeProvider(ctx, threadId);
      const turn = { threadId, projectRoot, provider, model, effort, prompt, tools, snapshotSha };
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
        webSearch: msg.webSearch,
        additionalDirectories: msg.additionalDirectories,
        onEvent: (event) => {
          collectTool(tools, event);
          emit({ type: "event", threadId, event });
          if (event.kind === "done") emitGitChanged(ctx, threadId, projectRoot);
          if (event.kind === "done") appendLedgerForDone(ctx, turn, event).catch((e) => {
            ctx.send({ type: "error", threadId, message: `ledger: ${String(e)}` });
          });
        },
      })
        .then(({ sessionId }) => {
          ctx.store.upsert({ id: threadId, sessionId, status: "done" });
          emit({ type: "threads", threads: ctx.store.list() });
          maybeTitleThread(ctx, emit, threadId, prompt).catch(() => {});
        })
        .catch((e) => {
          ctx.store.upsert({ id: threadId, status: "idle" });
          emit({ type: "event", threadId, event: { kind: "error", message: String(e) } });
          emit({ type: "threads", threads: ctx.store.list() });
        })
        .finally(() => {
          const q = pending.get(threadId);
          const next = q?.shift();
          if (q && q.length === 0) pending.delete(threadId);
          if (next) route(next, ctx);
        });
      break;
    }
    default:
      ctx.send({ type: "error", message: `type inconnu: ${msg.type}` });
  }
}
