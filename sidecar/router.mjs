// ctx: { send(obj), store, providers, broadcast(obj) }
export async function route(msg, ctx) {
  switch (msg.type) {
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
        });
      break;
    }
    default:
      ctx.send({ type: "error", message: `type inconnu: ${msg.type}` });
  }
}
