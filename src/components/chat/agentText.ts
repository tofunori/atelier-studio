// Lecture d'un sous-agent sans rendu : titre, activité courante, transcript
// montré et outils Codex rendus lisibles. Partagé par la grappe du fil, le
// menu de l'en-tête et la vue du sous-agent.
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { activeToolLabel } from "./toolPresentation";
import type { AgentDisplay } from "./AgentActivity";

/** Événements montrés dans le transcript d'un sous-agent : prose + outils. */
export type TranscriptEvent = Extract<
  AgentEvent,
  { kind: "text" | "streaming" | "thinking" | "thinking_live" | "error" | "tool" | "tool_update" }
>;

export function opaqueAgentText(text: string | null | undefined): boolean {
  return /\bgAAAAA[A-Za-z0-9_-]{24,}/u.test(text ?? "");
}

/** Codex journalise `functions.exec` comme un petit programme JavaScript.
 * On en extrait uniquement la chaîne `cmd` afin de présenter l'action réelle
 * sans exposer le wrapper interne ni évaluer du code provenant du rollout. */
function wrappedExecCommand(event: Extract<AgentEvent, { kind: "tool" | "tool_update" }>): string | null {
  const input = event.kind === "tool_update" && event.input && typeof event.input === "object"
    ? event.input as Record<string, unknown>
    : null;
  const candidates = [typeof input?.raw === "string" ? input.raw : null, event.detail].filter(
    (value): value is string => Boolean(value),
  );
  for (const source of candidates) {
    const call = /\btools\.exec_command\s*\(\s*\{/u.exec(source);
    if (!call) continue;
    const tail = source.slice(call.index + call[0].length);
    const field = /\bcmd\s*:\s*/u.exec(tail);
    if (!field) continue;
    const start = field.index + field[0].length;
    const quote = tail[start];
    if (quote !== '"' && quote !== "'" && quote !== "`") continue;
    let value = "";
    for (let index = start + 1; index < tail.length; index += 1) {
      const char = tail[index];
      if (char === quote) return value.trim() || null;
      if (char !== "\\") {
        value += char;
        continue;
      }
      const escaped = tail[index + 1];
      if (escaped == null) break;
      value += escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped;
      index += 1;
    }
  }
  return null;
}

function wrappedCommandDisplay(command: string): { name: string; detail: string; input?: { command: string } } {
  const first = command.split(/\r?\n/u, 1)[0]?.trim() ?? command.trim();
  const tokens = first.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
  const executable = tokens[0]?.replace(/^.*[/\\]/u, "").toLowerCase() ?? "";
  const targetToken = [...tokens.slice(1)].reverse().find(token => !token.startsWith("-"));
  const target = targetToken?.replace(/^["']|["']$/gu, "").split(/[/\\]/u).pop() ?? "";
  if (["cat", "bat", "head", "tail", "less", "more", "sed"].includes(executable) && target) {
    return { name: "cat", detail: target };
  }
  if (["rg", "grep", "egrep", "fgrep", "ag", "ack", "find", "fd"].includes(executable) && target) {
    return { name: "search", detail: target };
  }
  if (["ls", "tree"].includes(executable)) {
    return { name: "ls", detail: target };
  }
  return { name: "command", detail: command, input: { command } };
}

/** Outil d'un enfant Codex lisible comme une action du fil : le wrapper
 * `functions.exec` cède la place à la commande qu'il porte. */
export function readableAgentTool<T extends Extract<AgentEvent, { kind: "tool" | "tool_update" }>>(event: T): T {
  if (!/^(?:functions\.)?exec$/u.test(event.name)) return event;
  const command = wrappedExecCommand(event);
  return command ? { ...event, ...wrappedCommandDisplay(command) } : event;
}

export function agentToolLabel(event: Extract<AgentEvent, { kind: "tool" | "tool_update" }>): string {
  if (/^(?:functions\.)?exec$/u.test(event.name)) {
    const command = wrappedExecCommand(event);
    const code = /\b(?:const|let|await|tools\.)\b/u.test(event.detail ?? "");
    const readable = command ? wrappedCommandDisplay(command) : { name: "command", detail: code ? "" : event.detail };
    const display = { ...event, ...readable };
    return activeToolLabel(display);
  }
  return activeToolLabel(event);
}

/** Titre d'une rangée : la mission quand l'agent en donne une, sinon son nom. */
export function agentTitle(agent: AgentDisplay): string {
  return agent.description || agent.displayName;
}

export function currentAgentActivity(agent: AgentDisplay, events: AgentEvent[], toolsOnly = false): string {
  // A resumed child must not show the previous turn's last command or report.
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.kind === "started" || event.kind === "done") break;
    if (agent.statusTs != null && "ts" in event && event.ts != null && event.ts < agent.statusTs) continue;
    if (event.kind === "tool" || event.kind === "tool_update") {
      if (/^(?:agent:|(?:functions\.)?collaboration[.:])/u.test(event.name) || opaqueAgentText(event.detail)) continue;
      return agentToolLabel(event);
    }
    if (!toolsOnly && (event.kind === "text" || event.kind === "streaming") && event.text.trim() && !opaqueAgentText(event.text)) {
      return event.text.replace(/\s+/g, " ").trim().slice(0, 180);
    }
  }
  // Sans transcript enfant (sous-agents Claude), la dernière activité connue
  // du parent : verbe d'outil ou résumé, comme la rangée du terminal.
  return (agent.status === "working" ? liveStatusMessage(agent) : null) ?? statusLabel(agent);
}

export function liveStatusMessage(agent: AgentDisplay): string | null {
  const message = agent.statusMessage?.replace(/\s+/g, " ").trim();
  return message && !opaqueAgentText(message) ? message.slice(0, 180) : null;
}

export function statusLabel(agent: AgentDisplay) {
  if (agent.status === "working") return t("chat.subagent-working");
  if (agent.status === "done") return t("chat.subagent-done");
  if (agent.status === "interrupted") return t("chat.subagent-interrupted");
  return t("chat.subagent-failed");
}

/** Événements d'un sous-agent montrés à l'écran, dans l'ordre : prose,
 * pensée et outils, sans ses propres appels collab (préfixe `agent:`) ni les
 * blobs chiffrés de Codex. */
export function subagentTranscript(events: AgentEvent[]): TranscriptEvent[] {
  return events.filter((event): event is TranscriptEvent => {
    if (event.kind === "tool" || event.kind === "tool_update") {
      return !/^(?:agent:|(?:functions\.)?collaboration[.:])/u.test(event.name)
        && !opaqueAgentText(event.detail)
        && !(event.kind === "tool_update" && opaqueAgentText(event.output));
    }
    if (event.kind === "error" && opaqueAgentText(event.message)) return false;
    if ("text" in event && opaqueAgentText(event.text)) return false;
    return event.kind === "text"
      || event.kind === "streaming"
      || event.kind === "thinking"
      || event.kind === "thinking_live"
      || event.kind === "error";
  });
}
