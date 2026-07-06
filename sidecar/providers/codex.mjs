import { Codex } from "@openai/codex-sdk";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Dernier token_count du rollout d'un thread : vrai contexte + fenêtre modèle. */
function lastTokenCount(sessionId) {
  try {
    const base = join(homedir(), ".codex", "sessions");
    let file = null;
    const walk = (d, depth) => {
      if (file || depth > 4) return;
      for (const e of readdirSync(d).sort().reverse()) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p, depth + 1);
        else if (e.includes(sessionId) && e.endsWith(".jsonl")) { file = p; return; }
      }
    };
    if (!existsSync(base)) return null;
    walk(base, 0);
    if (!file) return null;
    const lines = readFileSync(file, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const p = JSON.parse(lines[i]).payload;
        if (p?.type === "token_count" && p.info) {
          return {
            context: p.info.last_token_usage?.total_tokens ?? null,
            window: p.info.model_context_window ?? null,
            output: p.info.total_token_usage?.output_tokens ?? null,
          };
        }
      } catch {}
    }
  } catch {}
  return null;
}
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

export function buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories, sandbox }) {
  return {
    workingDirectory: cwd,
    skipGitRepoCheck: true,
    sandboxMode: sandbox ?? "danger-full-access",
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
  sandbox,
  timeoutMs,
  onEvent,
}) {
  // model / effort / sandbox = ThreadOptions (doc officielle) ; TurnOptions = signal seulement
  const threadOpts = buildThreadOptions({ cwd, model, effort, webSearch, additionalDirectories, sandbox });
  const thread = sessionId
    ? codex.resumeThread(sessionId, threadOpts)
    : codex.startThread(threadOpts);
  const ctrl = new AbortController();
  if (threadId) controllers.set(threadId, ctrl);
  const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  const turnOptions = { signal: ctrl.signal };
  const activityId = `codex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    const input = buildCodexInput({ prompt, inputs, imagePath, attachments });
    const { events } = await thread.runStreamed(input, turnOptions);
    // affichage SOBRE : une seule ligne par commande (au démarrage, tronquée),
    // pas de doublon à la complétion, un seul état de réflexion consécutif
    let lastTool = "";
    let activity = {
      kind: "activity",
      id: activityId,
      phase: "thinking",
      title: "Thinking",
      detail: "Preparing the next step",
      status: "running",
      steps: [],
    };
    const emitActivity = (patch = {}) => {
      activity = {
        ...activity,
        ...patch,
        steps: patch.steps ?? activity.steps,
      };
      const steps = activity.steps.map(({ key, ...step }) => step);
      onEvent({ ...activity, steps });
    };
    const upsertStep = ({ key, title, detail, phase = "tool", status = "running" }) => {
      const existing = activity.steps.findIndex((step) => step.key === key);
      const step = { key, title, detail, phase, status, ts: Date.now() };
      const steps = existing >= 0
        ? activity.steps.map((item, idx) => (idx === existing ? { ...item, ...step } : item))
        : [...activity.steps, step].slice(-8);
      emitActivity({ title, detail, phase, status: status === "failed" ? "failed" : "running", steps });
    };
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
      const status = item.status === "completed" || item.status === "succeeded"
        ? (item.exit_code && item.exit_code !== 0 ? "failed" : "completed")
        : item.status === "failed" ? "failed" : "running";
      upsertStep({
        key: `cmd:${item.id ?? commandName(item)}`,
        title: status === "running" ? "Running command" : status === "failed" ? "Command failed" : "Command finished",
        detail: commandName(item),
        phase: "command",
        status,
      });
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
      upsertStep({
        key: "todos",
        title: "Updating plan",
        detail: `${(item.items ?? []).filter((todo) => todo.completed).length}/${(item.items ?? []).length} done`,
        phase: "todo",
        status: "running",
      });
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
        emitActivity();
      }
      if (ev.type === "item.started" && ev.item?.type === "command_execution") {
        upsertStep({
          key: `cmd:${ev.item.id ?? commandName(ev.item)}`,
          title: "Running command",
          detail: commandName(ev.item),
          phase: "command",
          status: "running",
        });
        emitTool(commandName(ev.item));
      }
      if (ev.type === "item.started" && ev.item?.type === "reasoning") {
        emitActivity({ phase: "thinking", title: "Thinking", detail: "Planning the next action", status: "running" });
        emitTool("__thinking");
      }
      // le SDK livre le TEXTE du raisonnement — même rendu que le thinking Claude
      if (ev.type === "item.completed" && ev.item?.type === "reasoning" && ev.item.text) {
        onEvent({ kind: "thinking", text: ev.item.text });
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
        upsertStep({
          key: `edits:${files.join(",")}`,
          title: "Applying edits",
          detail: files.length ? files.slice(0, 3).join(", ") : "Files changed",
          phase: "edit",
          status: "completed",
        });
        emitTool(files.length ? `__edits:${files.slice(0, 3).join(", ")}${files.length > 3 ? "…" : ""}` : "__edits:");
      }
      if (ev.type === "item.started" && ev.item?.type === "web_search") {
        upsertStep({
          key: `search:${String(ev.item.query ?? "")}`,
          title: "Searching web",
          detail: String(ev.item.query ?? "").slice(0, 80),
          phase: "search",
          status: "running",
        });
        emitTool(`recherche web : ${String(ev.item.query ?? "").slice(0, 50)}`);
      }
      if (ev.type === "item.completed" && ev.item?.type === "mcp_tool_call") {
        upsertStep({
          key: `mcp:${ev.item.tool ?? "mcp"}`,
          title: "Using tool",
          detail: String(ev.item.tool ?? "mcp"),
          phase: "tool",
          status: "completed",
        });
        emitTool(`outil ${ev.item.tool ?? "mcp"}`);
      }
      if (ev.type === "turn.completed") {
        const u = ev.usage ?? {};
        // usage du SDK = cumul de tous les appels du tour (contexte recompté) ;
        // le rollout donne le VRAI dernier état + la fenêtre du modèle
        const tc = lastTokenCount(thread.id);
        emitActivity({
          title: "Finished",
          detail: activity.steps.length ? `${activity.steps.length} actions` : "No tools used",
          status: "completed",
          phase: activity.phase,
        });
        onEvent({ kind: "done", ok: true, result: "", usage: {
          context: tc?.context ?? (u.input_tokens ?? 0),
          window: tc?.window ?? null,
          output: u.output_tokens ?? 0, cost: null, turns: null } });
      }
      if (ev.type === "turn.failed") {
        emitActivity({ title: "Failed", detail: ev.error?.message ?? "Codex failed", status: "failed" });
        onEvent({ kind: "error", message: ev.error?.message ?? "failed" });
      }
      if (ev.type === "error") {
        emitActivity({ title: "Failed", detail: ev.message ?? "Codex error", status: "failed" });
        onEvent({ kind: "error", message: ev.message ?? "erreur Codex" });
      }
    }
  } catch (e) {
    if (ctrl.signal.aborted) {
      onEvent({ kind: "activity", id: activityId, title: "Interrupted", detail: "Stopped by user", status: "failed" });
      onEvent({ kind: "done", ok: false, result: "interrompu" });
    } else {
      throw e;
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (threadId) controllers.delete(threadId);
  }
  return { sessionId: thread.id ?? sessionId };
}

/** Rate limits OpenAI du rollout le plus récent (primary=5h, secondary=hebdo). */
export function rateLimits() {
  try {
    const base = join(homedir(), ".codex", "sessions");
    if (!existsSync(base)) return null;
    let newest = null;
    const walk = (d, depth) => {
      if (depth > 4) return;
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, depth + 1);
        else if (e.endsWith(".jsonl") && (!newest || st.mtimeMs > newest.m)) newest = { p, m: st.mtimeMs };
      }
    };
    walk(base, 0);
    if (!newest) return null;
    const lines = readFileSync(newest.p, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const pl = JSON.parse(lines[i]).payload;
        if (pl?.type === "token_count" && pl.rate_limits) return { ts: newest.m, data: pl.rate_limits };
      } catch {}
    }
  } catch {}
  return null;
}
