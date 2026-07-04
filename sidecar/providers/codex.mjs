import { Codex } from "@openai/codex-sdk";

const codex = new Codex();

export async function run({ cwd, prompt, sessionId, model, effort, onEvent }) {
  const thread = sessionId
    ? codex.resumeThread(sessionId, { workingDirectory: cwd, skipGitRepoCheck: true })
    : codex.startThread({ workingDirectory: cwd, skipGitRepoCheck: true });
  const turnOptions = {
    ...(model ? { model } : {}),
    ...(effort ? { modelReasoningEffort: effort } : {}),
  };
  const { events } = await thread.runStreamed(prompt, turnOptions);
  for await (const ev of events) {
    if (ev.type === "item.completed" && ev.item?.type === "agent_message") {
      onEvent({ kind: "text", text: ev.item.text ?? "" });
    }
    if (ev.type === "item.completed" && ev.item?.type === "command_execution") {
      onEvent({ kind: "tool", name: ev.item.command ?? "commande" });
    }
    if (ev.type === "turn.completed") onEvent({ kind: "done", ok: true, result: "" });
    if (ev.type === "turn.failed") {
      onEvent({ kind: "error", message: ev.error?.message ?? "échec" });
    }
  }
  return { sessionId: thread.id ?? sessionId };
}
