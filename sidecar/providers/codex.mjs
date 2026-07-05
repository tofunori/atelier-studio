import { Codex } from "@openai/codex-sdk";
import { execSync } from "node:child_process";
// CLI système d'abord (mêmes versions/config que l'utilisateur) ; binaire
// embarqué du SDK en secours (absent du bundle allégé).
let CODEX_BIN = null;
try {
  CODEX_BIN = execSync("command -v codex", { encoding: "utf8" }).trim() || null;
} catch {}


const codex = new Codex(CODEX_BIN ? { codexPathOverride: CODEX_BIN } : {});
const controllers = new Map(); // threadId -> AbortController

export function buildCodexInput({ prompt, inputs, imagePath, attachments }) {
  if (Array.isArray(inputs) && inputs.length > 0) {
    const clean = inputs
      .map((input) => {
        if (input?.type === "text") return { type: "text", text: String(input.text ?? "") };
        if (input?.type === "local_image" && input.path) {
          return { type: "local_image", path: String(input.path) };
        }
        return null;
      })
      .filter(Boolean);
    return clean.length ? clean : String(prompt ?? "");
  }

  const imagePaths = new Set();
  if (imagePath) imagePaths.add(String(imagePath));
  for (const a of attachments ?? []) {
    const path = a?.path ?? a?.imagePath;
    if (path) imagePaths.add(String(path));
  }
  if (imagePaths.size === 0) return String(prompt ?? "");

  return [
    { type: "text", text: String(prompt ?? "") },
    ...[...imagePaths].map((path) => ({ type: "local_image", path })),
  ];
}

export function buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories }) {
  return {
    workingDirectory: cwd,
    skipGitRepoCheck: true,
    sandboxMode: "danger-full-access",
    ...(model ? { model } : {}),
    ...(effort ? { modelReasoningEffort: effort } : {}),
    ...(webSearch ? { webSearchMode: webSearch === "cached" ? "cached" : "live" } : {}),
    ...(Array.isArray(additionalDirectories) && additionalDirectories.length
      ? { additionalDirectories: additionalDirectories.map(String) }
      : {}),
  };
}

export function interrupt(threadId) {
  controllers.get(threadId)?.abort();
}

export async function run({
  threadId,
  cwd,
  prompt,
  inputs,
  imagePath,
  attachments,
  sessionId,
  model,
  effort,
  webSearch,
  additionalDirectories,
  onEvent,
}) {
  // model / effort / sandbox = ThreadOptions (doc officielle) ; TurnOptions = signal seulement
  const threadOpts = buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories });
  const thread = sessionId
    ? codex.resumeThread(sessionId, threadOpts)
    : codex.startThread(threadOpts);
  const ctrl = new AbortController();
  if (threadId) controllers.set(threadId, ctrl);
  const turnOptions = { signal: ctrl.signal };
  try {
    const input = buildCodexInput({ prompt, inputs, imagePath, attachments });
    const { events } = await thread.runStreamed(input, turnOptions);
    // affichage SOBRE : une seule ligne par commande (au démarrage, tronquée),
    // pas de doublon à la complétion, un seul "réflexion…" consécutif
    let lastTool = "";
    const emitTool = (name) => {
      if (name === lastTool) return;
      lastTool = name;
      onEvent({ kind: "tool", name });
    };
    const commandName = (item) => {
      const cmd = String(item.command ?? "commande").replace(/\s+/g, " ").trim();
      return cmd.length > 64 ? cmd.slice(0, 64) + "…" : cmd;
    };
    const emitCommandUpdate = (item) => {
      onEvent({
        kind: "tool_update",
        id: item.id,
        name: commandName(item),
        output: String(item.aggregated_output ?? ""),
        status: item.status,
        exitCode: item.exit_code,
      });
    };
    const emitTodos = (item) => {
      onEvent({
        kind: "todos",
        items: (item.items ?? []).map((todo) => ({
          text: String(todo.text ?? ""),
          completed: Boolean(todo.completed),
        })),
      });
    };
    for await (const ev of events) {
      if (ev.type === "turn.started") {
        onEvent({ kind: "started" });
      }
      if (ev.type === "item.started" && ev.item?.type === "command_execution") {
        emitTool(commandName(ev.item));
      }
      if (ev.type === "item.started" && ev.item?.type === "reasoning") {
        emitTool("réflexion…");
      }
      if (
        (ev.type === "item.started" || ev.type === "item.updated" || ev.type === "item.completed") &&
        ev.item?.type === "todo_list"
      ) {
        emitTodos(ev.item);
      }
      if (ev.type === "item.updated" && ev.item?.type === "agent_message") {
        onEvent({ kind: "stream_set", text: ev.item.text ?? "" });
      }
      if (
        (ev.type === "item.updated" || ev.type === "item.completed") &&
        ev.item?.type === "command_execution"
      ) {
        emitCommandUpdate(ev.item);
      }
      if (ev.type === "item.completed" && ev.item?.type === "agent_message") {
        onEvent({ kind: "text", text: ev.item.text ?? "" });
      }
      if (ev.type === "item.completed" && ev.item?.type === "error") {
        onEvent({ kind: "error", message: ev.item.message ?? "erreur Codex" });
      }
      if (ev.type === "item.completed" && ev.item?.type === "file_change") {
        const files = (ev.item.changes ?? []).map((ch) => ch.path?.split("/").pop()).filter(Boolean);
        emitTool(files.length ? `modifie ${files.slice(0, 3).join(", ")}${files.length > 3 ? "…" : ""}` : "modifie des fichiers");
      }
      if (ev.type === "item.started" && ev.item?.type === "web_search") {
        emitTool(`recherche web : ${String(ev.item.query ?? "").slice(0, 50)}`);
      }
      if (ev.type === "item.completed" && ev.item?.type === "mcp_tool_call") {
        emitTool(`outil ${ev.item.tool ?? "mcp"}`);
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
      if (ev.type === "error") {
        onEvent({ kind: "error", message: ev.message ?? "erreur Codex" });
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
