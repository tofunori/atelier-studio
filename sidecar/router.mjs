// ctx: { send(obj), store, providers, broadcast(obj) }
export async function route(msg, ctx) {
  switch (msg.type) {
    case "ping":
      ctx.send({ type: "pong" });
      break;
    case "listThreads":
      ctx.send({ type: "threads", threads: ctx.store.list() });
      break;
    case "send": {
      const { threadId, projectRoot, provider, prompt, title } = msg;
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
