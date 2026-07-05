// ctx: { send(obj), store, providers, broadcast(obj) }

// file d'attente par thread pour les providers SANS steering (Codex) :
// les messages envoyés pendant un run partent automatiquement au tour suivant.
const pending = new Map(); // threadId -> [msg...]

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
    case "deleteThread": {
      ctx.store.delete(msg.threadId);
      (ctx.broadcast ?? ctx.send)({ type: "threads", threads: ctx.store.list() });
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
        // historique Codex non supporté v1
        ctx.send({ type: "history", threadId: msg.threadId, events: [] });
        break;
      }
      const events = await ctx.history.claudeHistory(t.sessionId, t.projectRoot);
      ctx.send({ type: "history", threadId: msg.threadId, events });
      break;
    }
    case "listThreads":
      ctx.send({ type: "threads", threads: ctx.store.list() });
      break;
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
        emit({ type: "event", threadId, event: { kind: "tool",
          name: `changement de provider → nouvelle session ${provider} (l'autre agent ne partage pas sa mémoire)` } });
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
            emit({ type: "event", threadId, event });
            if (event.kind === "done" || event.kind === "error") {
              ctx.store.upsert({
                id: threadId,
                status: event.kind === "done" ? "done" : "idle",
              });
              emit({ type: "threads", threads: ctx.store.list() });
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
        emit({ type: "event", threadId, event: { kind: "tool", name: "⏳ message en file d'attente" } });
        break;
      }
      // fire-and-forget : plusieurs threads streament en parallèle
      p.run({
        threadId,
        cwd: projectRoot || process.env.HOME,
        prompt,
        sessionId: prev?.sessionId ?? null,
        model,
        effort,
        permissionMode,
        onEvent: (event) => emit({ type: "event", threadId, event }),
      })
        .then(({ sessionId }) => {
          ctx.store.upsert({ id: threadId, sessionId, status: "done" });
          emit({ type: "threads", threads: ctx.store.list() });
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
