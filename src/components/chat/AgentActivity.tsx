import { ChevronLeftIcon } from "lucide-react";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { Badge } from "../shadcn/badge";
import { Bubble, BubbleContent } from "../shadcn/bubble";
import { Button } from "../shadcn/button";
import { Message, MessageContent, MessageGroup } from "../shadcn/message";
import { ScrollArea } from "../shadcn/scroll-area";
import { Separator } from "../shadcn/separator";
import { RowButton } from "../ui";

export type AgentToolAction = Extract<AgentEvent, { kind: "tool_update" }> & {
  agentActivity: NonNullable<Extract<AgentEvent, { kind: "tool_update" }>["agentActivity"]>;
};

export type AgentDisplay = {
  threadId: string;
  displayName: string;
  status: "working" | "done" | "failed" | "interrupted";
  statusMessage: string | null;
  prompt: string | null;
  model: string | null;
  reasoningEffort: string | null;
  agentPath: string | null;
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
    case "shutdown":
      return "done";
    case "errored":
    case "notfound":
    case "failed":
      return "failed";
    case "interrupted":
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
      if (state) {
        agent.status = normalizedStatus(state.status);
        agent.statusMessage = state.message?.trim() || null;
      } else if (activity.activityKind === "interrupted") {
        agent.status = "interrupted";
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

function hashHue(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash % 360;
}

export function AgentGlyph({ seed, size = 20 }: { seed: string; size?: number }) {
  const hue = hashHue(seed);
  return (
    <svg className="agent-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g transform="translate(12 12)">
        {[0, 45, 90, 135].map((angle, index) => (
          <rect
            key={angle}
            x="-3.1"
            y="-10"
            width="6.2"
            height="12"
            rx="2.6"
            transform={`rotate(${angle})`}
            fill={`hsl(${(hue + index * 22) % 360} 78% ${56 + (index % 2) * 8}%)`}
            opacity="0.92"
          />
        ))}
        <circle r="3" fill={`hsl(${(hue + 36) % 360} 75% 72%)`} />
      </g>
    </svg>
  );
}

function groupStatus(agents: AgentDisplay[]) {
  if (agents.some((agent) => agent.status === "failed")) return t("chat.subagents-failed");
  if (agents.some((agent) => agent.status === "interrupted")) return t("chat.subagents-interrupted");
  if (agents.length > 0 && agents.every((agent) => agent.status === "done")) return t("chat.subagents-finished");
  if (agents.some((agent) => agent.statusMessage)) return t("chat.subagents-updated");
  return t("chat.subagents-started");
}

export function AgentActivityGroup({
  actions,
  onOpenAgent,
}: {
  actions: AgentToolAction[];
  onOpenAgent: (agent: AgentDisplay) => void;
}) {
  const agents = agentsFromActions(actions);
  if (agents.length === 0) return null;
  const visible = agents.slice(0, 3);
  const hidden = agents.length - visible.length;
  return (
    <div className="agent-activity-group" data-testid="subagent-activity-inline-group">
      {visible.map((agent) => (
        <RowButton
          key={agent.threadId}
          className="agent-chip"
          aria-label={t("chat.subagent-open", { name: agent.displayName })}
          onClick={() => onOpenAgent(agent)}
        >
          <AgentGlyph seed={agent.threadId} size={18} />
          <span>{agent.displayName}</span>
        </RowButton>
      ))}
      {hidden > 0 ? <span className="agent-group-status">{t("chat.subagents-more", { count: hidden })} </span> : null}
      <span className="agent-group-status">{groupStatus(agents)}</span>
    </div>
  );
}

function statusLabel(agent: AgentDisplay) {
  if (agent.status === "working") return t("chat.subagent-working");
  if (agent.status === "done") return t("chat.subagent-done");
  if (agent.status === "interrupted") return t("chat.subagent-interrupted");
  return t("chat.subagent-failed");
}

function statusVariant(agent: AgentDisplay) {
  if (agent.status === "failed") return "destructive" as const;
  if (agent.status === "working") return "secondary" as const;
  return "outline" as const;
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
  const transcript = events.filter((event) =>
    event.kind === "text"
    || event.kind === "streaming"
    || event.kind === "thinking"
    || event.kind === "thinking_live"
    || event.kind === "error",
  );
  return (
    <aside className={cn("agent-detail-panel", embedded && "agent-detail-embedded")} aria-label={agent.displayName}>
      <header className="agent-detail-header">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("action.close")}>
          <ChevronLeftIcon />
        </Button>
        <AgentGlyph seed={agent.threadId} size={24} />
        <span className="agent-detail-title">{agent.displayName}</span>
      </header>
      <Separator />
      <ScrollArea className="agent-detail-scroll">
        <div className="agent-detail-body">
          <Badge variant={statusVariant(agent)}>{statusLabel(agent)}</Badge>
          {agent.prompt ? <p className="agent-detail-prompt">{agent.prompt}</p> : null}
          {(agent.model || agent.reasoningEffort) ? (
            <div className="agent-detail-meta">{[agent.model, agent.reasoningEffort].filter(Boolean).join(" · ")}</div>
          ) : null}
          {agent.statusMessage ? <div className="agent-detail-message">{agent.statusMessage}</div> : null}
          {transcript.length > 0 ? (
            <MessageGroup className="agent-transcript" data-testid="agent-transcript">
              {transcript.map((event, index) => {
                const isError = event.kind === "error";
                const isThinking = event.kind === "thinking" || event.kind === "thinking_live";
                const text = isError ? event.message : event.text;
                const eventTs = "ts" in event ? event.ts : undefined;
                return (
                  <Message key={`${event.kind}-${eventTs ?? index}-${index}`}>
                    <MessageContent>
                      <Bubble variant={isError ? "destructive" : isThinking ? "ghost" : "outline"}>
                        <BubbleContent className={isThinking ? "agent-transcript-thinking" : undefined}>
                          {text}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                );
              })}
            </MessageGroup>
          ) : (
            <p className="agent-detail-empty" data-testid="agent-transcript-empty">{t("chat.subagent-waiting")}</p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
