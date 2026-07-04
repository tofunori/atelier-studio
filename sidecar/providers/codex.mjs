import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const controllers = new Map(); // threadId -> AbortController

export function interrupt(threadId) {
  controllers.get(threadId)?.abort();
}

export async function run({ threadId, cwd, prompt, sessionId, model, effort, onEvent }) {
  // model / effort / sandbox = ThreadOptions (doc officielle) ; TurnOptions = signal seulement
  const threadOpts = {
    workingDirectory: cwd,
    skipGitRepoCheck: true,
    sandboxMode: "danger-full-access",
    ...(model ? { model } : {}),
    ...(effort ? { modelReasoningEffort: effort } : {}),
  };
  const thread = sessionId
    ? codex.resumeThread(sessionId, threadOpts)
    : codex.startThread(threadOpts);
  const ctrl = new AbortController();
  if (threadId) controllers.set(threadId, ctrl);
  const turnOptions = { signal: ctrl.signal };
  try {
    const { events } = await thread.runStreamed(prompt, turnOptions);
    for await (const ev of events) {
      // feedback en direct : items démarrés (commande, raisonnement…)
      if (ev.type === "item.started" && ev.item?.type === "command_execution") {
        onEvent({ kind: "tool", name: (ev.item.command ?? "commande") + " …" });
      }
      if (ev.type === "item.started" && ev.item?.type === "reasoning") {
        onEvent({ kind: "tool", name: "réflexion…" });
      }
      if (ev.type === "item.completed" && ev.item?.type === "agent_message") {
        onEvent({ kind: "text", text: ev.item.text ?? "" });
      }
      if (ev.type === "item.completed" && ev.item?.type === "command_execution") {
        onEvent({ kind: "tool", name: ev.item.command ?? "commande" });
      }
      if (ev.type === "turn.completed") {
        const u = ev.usage ?? {};
        onEvent({ kind: "done", ok: true, result: "", usage: {
          context: (u.input_tokens ?? 0) + (u.cached_input_tokens ?? 0),
          output: u.output_tokens ?? 0, cost: null, turns: null } });
      }
      if (ev.type === "turn.failed") {
        onEvent({ kind: "error", message: ev.error?.message ?? "échec" });
      }
    }
  } catch (e) {
    if (ctrl.signal.aborted) {
      onEvent({ kind: "done", ok: false, result: "interrompu" });
    } else {
      throw e;
    }
  } finally {
    if (threadId) controllers.delete(threadId);
  }
  return { sessionId: thread.id ?? sessionId };
}
