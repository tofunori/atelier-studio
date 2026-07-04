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
      const prev = ctx.store.get(threadId);
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
          cwd: projectRoot,
          prompt,
          sessionId: prev?.sessionId ?? null,
          model,
          effort,
          permissionMode,
          mode: msg.mode,
          onSession: (sessionId) => ctx.store.upsert({ id: threadId, sessionId }),
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
        cwd: projectRoot,
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
