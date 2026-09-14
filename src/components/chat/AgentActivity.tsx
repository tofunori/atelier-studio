import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, GitBranchIcon, CheckIcon, CircleAlertIcon, LoaderCircleIcon, CircleSlashIcon } from "lucide-react";
import { useId, useState } from "react";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { ScrollArea } from "../shadcn/scroll-area";
import { Separator } from "../shadcn/separator";
import { Button, RowButton } from "../ui";
import { MdBody, MD_COMPONENTS, MD_COMPONENTS_STREAMING, useMdPlugins } from "./md";
import { ToolGlyph, activityIconForAction, activeToolLabel } from "./toolPresentation";

export type AgentToolAction = Extract<AgentEvent, { kind: "tool_update" }> & {
  agentActivity: NonNullable<Extract<AgentEvent, { kind: "tool_update" }>["agentActivity"]>;
};

/** Événements montrés dans le transcript d'un sous-agent : prose + outils. */
type TranscriptEvent = Extract<
  AgentEvent,
  { kind: "text" | "streaming" | "thinking" | "thinking_live" | "error" | "tool" | "tool_update" }
>;

export type AgentDisplay = {
  threadId: string;
  displayName: string;
  status: "working" | "done" | "failed" | "interrupted";
  statusMessage: string | null;
  prompt: string | null;
  model: string | null;
  reasoningEffort: string | null;
  agentPath: string | null;
  statusTs?: number;
};

export function isAgentActivityAction(event: AgentEvent): event is AgentToolAction {
  return event.kind === "tool_update" && event.agentActivity != null;
}

function displayNameFromPath(path: string | null | undefined): string | null {
  const leaf = path?.split("/").filter(Boolean).pop()?.trim();
  if (!leaf) return null;
  const spaced = leaf.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : null;
}

function normalizedStatus(status: string | null | undefined): AgentDisplay["status"] {
  switch ((status ?? "").replace(/[_-]/g, "").toLowerCase()) {
    case "completed":
    case "complete":
    case "done":
    case "finished":
    case "shutdown":
      return "done";
    case "errored":
    case "notfound":
    case "failed":
      return "failed";
    case "interrupted":
    case "cancelled":
    case "canceled":
      return "interrupted";
    default:
      return "working";
  }
}

/** Réduction fidèle au modèle Codex : receiverThreadIds créent les agents,
 * agentsStates écrase leur dernier état et subAgentActivity fournit le nom. */
export function agentsFromActions(actions: AgentToolAction[]): AgentDisplay[] {
  const agents = new Map<string, AgentDisplay>();
  const ensure = (threadId: string) => {
    const existing = agents.get(threadId);
    if (existing) return existing;
    const created: AgentDisplay = {
      threadId,
      displayName: t("chat.subagent-default"),
      status: "working",
      statusMessage: null,
      prompt: null,
      model: null,
      reasoningEffort: null,
      agentPath: null,
    };
    agents.set(threadId, created);
    return created;
  };

  for (const action of actions) {
    const activity = action.agentActivity;
    const ids = new Set([
      ...activity.receiverThreadIds,
      ...Object.keys(activity.agentsStates),
      ...(activity.agentThreadId ? [activity.agentThreadId] : []),
    ]);
    for (const threadId of ids) {
      const agent = ensure(threadId);
      if (activity.prompt) agent.prompt = activity.prompt;
      if (activity.model) agent.model = activity.model;
      if (activity.reasoningEffort) agent.reasoningEffort = activity.reasoningEffort;
      if (activity.agentPath && (!activity.agentThreadId || activity.agentThreadId === threadId)) {
        agent.agentPath = activity.agentPath;
        agent.displayName = displayNameFromPath(activity.agentPath) ?? agent.displayName;
      }
      const state = activity.agentsStates[threadId];
      const current = agent.statusTs == null || action.ts == null || action.ts >= agent.statusTs;
      if (state && current) {
        agent.status = normalizedStatus(state.status);
        agent.statusMessage = state.message?.trim() || null;
        agent.statusTs = action.ts;
      } else if (!state && current && activity.activityKind === "interrupted") {
        agent.status = "interrupted";
        agent.statusTs = action.ts;
      }
    }
  }
  let fallback = 0;
  return [...agents.values()].map((agent) => {
    if (agent.displayName !== t("chat.subagent-default")) return agent;
    fallback += 1;
    return { ...agent, displayName: `${t("chat.subagent-default")} ${fallback}` };
  });
}

/** A child rollout can settle before the parent's next status observation. */
export function agentWithTranscriptState(agent: AgentDisplay, events: AgentEvent[]): AgentDisplay {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.kind !== "done" && event.kind !== "started") continue;
    // A follow-up request must not inherit the previous turn's completion.
    if (agent.statusTs != null && event.ts != null && event.ts < agent.statusTs) return agent;
    if (agent.status !== "working" && (agent.statusTs == null || event.ts == null)) return agent;
    const status = event.kind === "started" ? "working" : event.ok ? "done" : "failed";
    return status === agent.status ? agent : { ...agent, status };
  }
  return agent;
}

function opaqueAgentText(text: string | null | undefined): boolean {
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

function agentToolLabel(event: Extract<AgentEvent, { kind: "tool" | "tool_update" }>): string {
  if (/^(?:functions\.)?exec$/u.test(event.name)) {
    const command = wrappedExecCommand(event);
    const code = /\b(?:const|let|await|tools\.)\b/u.test(event.detail ?? "");
    const readable = command ? wrappedCommandDisplay(command) : { name: "command", detail: code ? "" : event.detail };
    const display = { ...event, ...readable };
    return activeToolLabel(display);
  }
  return activeToolLabel(event);
}

export function AgentGlyph({ size = 20 }: { seed: string; size?: number }) {
  return <GitBranchIcon className="agent-glyph" size={size} aria-hidden="true" />;
}

function AgentStateIcon({status}: {status: AgentDisplay["status"]}) {
  const Icon = status === "working" ? LoaderCircleIcon : status === "done" ? CheckIcon
    : status === "failed" ? CircleAlertIcon : CircleSlashIcon;
  return <Icon className="agent-state-icon" data-agent-status={status} size={16} aria-hidden="true" />;
}

export function AgentActivityGroup({actions, onOpenAgent, eventsByThreadId}: {
  actions: AgentToolAction[];
  eventsByThreadId?: ReadonlyMap<string, AgentEvent[]>;
  onOpenAgent: (agent: AgentDisplay) => void;
}) {
  const id = useId();
  const agents = agentsFromActions(actions).map(agent => agentWithTranscriptState(agent, eventsByThreadId?.get(agent.threadId) ?? []));
  const working = agents.filter(agent => agent.status === "working").length;
  const done = agents.filter(agent => agent.status === "done").length;
  const failed = agents.filter(agent => agent.status === "failed").length;
  const interrupted = agents.filter(agent => agent.status === "interrupted").length;
  const allDone = agents.length > 0 && done === agents.length;
  // Manual disclosure wins within a phase; completing or resuming a group
  // returns to the appropriate default without an intermediate painted frame.
  const phase = allDone ? "done" : "active";
  const [disclosure, setDisclosure] = useState<{phase: string; open: boolean} | null>(null);
  if (disclosure && disclosure.phase !== phase) setDisclosure(null);
  const open = disclosure?.phase === phase ? disclosure.open : !allDone;
  if (!agents.length) return null;
  const summary = allDone ? t("chat.subagents-all-done") : [
    done ? t(done === 1 ? "chat.subagents-count-done-one" : "chat.subagents-count-done", {count: done}) : null,
    working ? t("chat.subagents-count-working", {count: working}) : null,
    failed ? t("chat.subagents-count-failed", {count: failed}) : null,
    interrupted ? t(interrupted === 1 ? "chat.subagents-count-interrupted-one" : "chat.subagents-count-interrupted", {count: interrupted}) : null,
  ].filter(Boolean).join(" · ");
  return <section className="agent-activity-group" data-testid="subagent-activity-inline-group"
    aria-label={t(agents.length === 1 ? "chat.subagents-title-one" : "chat.subagents-title", {count: agents.length})}>
    <RowButton className="agent-group-head" aria-expanded={open} aria-controls={id}
      onClick={() => setDisclosure({phase, open: !open})}>
      <GitBranchIcon size={16} aria-hidden="true" />
      <span>{t(agents.length === 1 ? "chat.subagents-title-one" : "chat.subagents-title", {count: agents.length})}</span>
      <span className="agent-group-summary" role="status">{summary}</span>
      <ChevronDownIcon size={14} className="agent-disclosure-icon" aria-hidden="true" />
    </RowButton>
    <div id={id} hidden={!open} className="agent-group-rows">
      {agents.map(agent => <RowButton key={agent.threadId} className="agent-row" data-agent-status={agent.status}
        aria-label={t("chat.subagent-open", {name: agent.displayName})} onClick={() => onOpenAgent(agent)}>
        <AgentStateIcon status={agent.status} />
        <span className="agent-row-copy"><span className="agent-row-name">{agent.displayName}</span>
          <span className="agent-row-description">{agent.status === "working" ? currentAgentActivity(agent, eventsByThreadId?.get(agent.threadId) ?? []) : statusLabel(agent)}</span></span>
        <ChevronRightIcon size={14} className="agent-row-arrow" aria-hidden="true" />
      </RowButton>)}
    </div>
  </section>;
}

function currentAgentActivity(agent: AgentDisplay, events: AgentEvent[], toolsOnly = false): string {
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
  return statusLabel(agent);
}

function statusLabel(agent: AgentDisplay) {
  if (agent.status === "working") return t("chat.subagent-working");
  if (agent.status === "done") return t("chat.subagent-done");
  if (agent.status === "interrupted") return t("chat.subagent-interrupted");
  return t("chat.subagent-failed");
}

export function AgentDetailPanel({
  agent,
  onClose,
  embedded = false,
  events = [],
}: {
  agent: AgentDisplay;
  onClose: () => void;
  /** Rendu comme contenu d'un onglet Atelier, plutôt que tiroir du chat. */
  embedded?: boolean;
  /** Transcript du rollout enfant, demandé séparément du thread parent. */
  events?: AgentEvent[];
}) {
  const transcript = events.filter((event): event is TranscriptEvent => {
    // Outils de l'enfant : on les montre, sauf ses propres appels collab
    // (préfixe `agent:`) — pas de chips imbriquées dans le panneau.
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
  const plugins = useMdPlugins();
  const prose = transcript.filter(event => event.kind === "text" || event.kind === "streaming" || event.kind === "error");
  const activity = transcript.filter(event => event.kind === "tool" || event.kind === "tool_update" || event.kind === "thinking" || event.kind === "thinking_live");
  const fallback = agent.statusMessage && !opaqueAgentText(agent.statusMessage)
    && !prose.some(event => (event.kind === "error" ? event.message : "text" in event ? event.text : "").trim() === agent.statusMessage?.trim())
    ? agent.statusMessage : null;
  return (
    <aside className={cn("agent-detail-panel", embedded && "agent-detail-embedded")} aria-label={agent.displayName}>
      <header className="agent-detail-header">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("action.close")}><ChevronLeftIcon /></Button>
        <AgentGlyph seed={agent.threadId} size={18} />
        <span className="agent-detail-title">{agent.displayName}</span>
        <span className="agent-detail-status" data-agent-status={agent.status} role="status">{statusLabel(agent)}</span>
      </header>
      <Separator />
      <ScrollArea className="agent-detail-scroll">
        <div className="agent-detail-body" data-testid="agent-transcript">
          {(agent.prompt && !opaqueAgentText(agent.prompt) || agent.model || agent.reasoningEffort) ? (
            <details className="agent-detail-disclosure" key={`mission-${agent.threadId}`}>
              <summary>{t("chat.subagent-mission")}</summary>
              {agent.prompt && !opaqueAgentText(agent.prompt) ? <p className="agent-detail-prompt">{agent.prompt}</p> : null}
              <div className="agent-detail-meta">{[agent.model, agent.reasoningEffort].filter(Boolean).join(" · ")}</div>
            </details>
          ) : null}
          {agent.status === "working" ? <div className="agent-detail-live"><AgentStateIcon status="working" />
            <span>{currentAgentActivity(agent, events, true)}</span>
          </div> : null}
          <div className="agent-transcript">
            {prose.map((event, index) => {
              const text = event.kind === "error" ? event.message : "text" in event ? event.text : "";
              const streaming = event.kind === "streaming";
              return <div key={`prose-${index}`} className={cn("agent-report msg typeset typeset-chat", event.kind === "error" && "agent-report-error")}>
                <MdBody text={normalizeMathDelimiters(text)} streaming={streaming}
                  remarkPlugins={plugins.remark} rehypePlugins={plugins.rehype}
                  components={streaming ? MD_COMPONENTS_STREAMING : MD_COMPONENTS} />
              </div>;
            })}
            {fallback ? <div className="agent-report msg typeset typeset-chat"><MdBody streaming={false} text={normalizeMathDelimiters(fallback)}
              remarkPlugins={plugins.remark} rehypePlugins={plugins.rehype} components={MD_COMPONENTS} /></div> : null}
            {!prose.length && !fallback ? <p className="agent-detail-empty" data-testid="agent-transcript-empty">{t(agent.status === "working" ? "chat.subagent-waiting" : "chat.subagent-no-transcript")}</p> : null}
          </div>
          {activity.length > 0 ? <details className="agent-detail-disclosure agent-detail-activity" key={`activity-${agent.threadId}`}>
            <summary>{t("chat.subagent-activity")} · {activity.length}</summary>
            <div className="agent-activity-log">{activity.map((event, index) => {
              if (event.kind !== "tool" && event.kind !== "tool_update") {
                return <p key={`thought-${index}`} className="agent-transcript-thinking">{"text" in event ? event.text : ""}</p>;
              }
              const failed = event.kind === "tool_update" && event.status === "failed";
              const completed = event.kind === "tool_update" && event.status === "completed";
              const output = event.kind === "tool_update" ? event.output : "";
              const line = <><ToolGlyph icon={activityIconForAction(event)} /><span className="agent-tool-line-text">{agentToolLabel(event)}</span>
                <span className="agent-tool-status">{t(failed ? "agent-tool.failed" : completed ? "agent-tool.done" : "agent-tool.pending")}</span></>;
              const key = `tool-${("id" in event ? event.id : null) ?? "legacy"}-${index}`;
              return output ? <details key={key} className="agent-tool-result" data-testid="agent-tool-line">
                <summary className={cn("agent-tool-line", failed && "is-failed")}>{line}</summary><pre className="agent-tool-output">{output}</pre>
              </details> : <div key={key} className={cn("agent-tool-line", failed && "is-failed")} data-testid="agent-tool-line">{line}</div>;
            })}</div>
          </details> : null}
        </div>
      </ScrollArea>
    </aside>
  );
}
