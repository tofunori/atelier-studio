import { query } from "@anthropic-ai/claude-agent-sdk";

// settingSources: charge CLAUDE.md, skills (/recherche, /loop…), hooks et MCP
// de l'utilisateur et du projet — même harnais que le CLI Claude Code.
export async function run({ cwd, prompt, sessionId, model, effort, onEvent }) {
  let sid = sessionId ?? null;
  const q = query({
    prompt,
    options: {
      cwd,
      permissionMode: "bypassPermissions",
      settingSources: ["user", "project"],
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      ...(sessionId ? { resume: sessionId } : {}),
    },
  });
  for await (const msg of q) {
    if (msg.type === "system" && msg.subtype === "init") sid = msg.session_id;
    if (msg.type === "assistant") {
      for (const block of msg.message.content ?? []) {
        if (block.type === "text") onEvent({ kind: "text", text: block.text });
        if (block.type === "tool_use") onEvent({ kind: "tool", name: block.name });
      }
    }
    if (msg.type === "result") {
      onEvent({ kind: "done", ok: msg.subtype === "success", result: msg.result ?? "" });
    }
  }
  return { sessionId: sid };
}
