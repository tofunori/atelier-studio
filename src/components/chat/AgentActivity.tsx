import { ChevronLeftIcon, GitBranchIcon, CheckIcon, CircleAlertIcon, LoaderCircleIcon, CircleSlashIcon } from "lucide-react";
import { useState } from "react";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { ScrollArea } from "../shadcn/scroll-area";
import { Separator } from "../shadcn/separator";
import { ActivityDisclosure, Button, RowButton } from "../ui";
import { MdBody, MD_COMPONENTS, MD_COMPONENTS_STREAMING, useMdPlugins } from "./md";
import { Tick, ToolGlyph, ToolStateGlyph, activityIconForAction, fmtToolDur } from "./toolPresentation";
import { LiveClock } from "./LiveClock";
import { agentTitle, agentToolLabel, currentAgentActivity, liveStatusMessage, opaqueAgentText, statusLabel, subagentTranscript } from "./agentText";

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
  /** Mission en quelques mots (`description` de l'outil Agent de Claude) :
   * titre de la rangée. Codex n'en donne pas, le nom tient lieu de titre. */
  description?: string | null;
  statusTs?: number;
  /** Première observation de l'agent et, une fois posé, son dernier état :
   * bornes de la durée affichée sur sa rangée. */
  startTs?: number;
  endTs?: number;
  /** Durée exacte annoncée par le CLI à la fin (Claude). */
  durationMs?: number;
};

export function isAgentActivityAction(event: AgentEvent): event is AgentToolAction {
  return event.kind === "tool_update" && event.agentActivity != null;
}

function displayNameFromPath(path: string | null | undefined): string | null {
  const leaf = path?.split("/").filter(Boolean).pop()?.trim();
  if (!leaf) return null;
  // Type d'agent intégré au CLI Claude : nom anglais générique.
  if (leaf === "general-purpose") return t("chat.subagent-type-general");
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
      // Claude ne laisse au fil que le dernier état de l'agent (même id) : son
      // heure de lancement voyage avec. Codex garde un événement par étape.
      const startedAt = activity.agentThreadId === threadId && activity.startedAt != null ? activity.startedAt : action.ts;
      if (startedAt != null && (agent.startTs == null || startedAt < agent.startTs)) agent.startTs = startedAt;
      if (activity.durationMs != null && activity.agentThreadId === threadId) agent.durationMs = activity.durationMs;
      if (activity.description?.trim() && (!activity.agentThreadId || activity.agentThreadId === threadId)) {
        agent.description = activity.description.replace(/\s+/g, " ").trim();
      }
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
        agent.endTs = agent.status === "working" ? undefined : action.ts;
      } else if (!state && current && activity.activityKind === "interrupted") {
        agent.status = "interrupted";
        agent.statusTs = action.ts;
        agent.endTs = action.ts;
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
    if (status === agent.status) return agent;
    return { ...agent, status, endTs: status === "working" ? undefined : event.ts ?? agent.endTs };
  }
  return agent;
}

export function AgentGlyph({ size = 20 }: { seed: string; size?: number }) {
  return <GitBranchIcon className="agent-glyph" size={size} aria-hidden="true" />;
}

function AgentStateIcon({status}: {status: AgentDisplay["status"]}) {
  const Icon = status === "working" ? LoaderCircleIcon : status === "done" ? CheckIcon
    : status === "failed" ? CircleAlertIcon : CircleSlashIcon;
  return <Icon className="agent-state-icon" data-agent-status={status} size={16} aria-hidden="true" />;
}

/** Glyphe d'un sous-agent dans sa rangée (étincelle trait fin, même gabarit
 * que les icônes d'outil) ; l'en-tête du groupe garde le glyphe « agent ». */
export function AgentRowGlyph() {
  return <svg width={15} height={15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2.4c.4 3.2 2.1 5 5.6 5.6-3.5.6-5.2 2.4-5.6 5.6-.4-3.2-2.1-5-5.6-5.6 3.5-.6 5.2-2.4 5.6-5.6z" />
  </svg>;
}

/** Colonne de durée : chrono pendant le travail, mot court sur un échec ou
 * une interruption (comme « exit N » des commandes), durée posée sinon. */
export function AgentDuration({ agent }: { agent: AgentDisplay }) {
  if (agent.status === "working") {
    return agent.startTs != null ? <LiveClock since={agent.startTs} className="tool-duration" /> : <span className="tool-duration" />;
  }
  const label = agent.status === "failed" ? t("chat.subagent-short-failed")
    : agent.status === "interrupted" ? t("chat.subagent-short-interrupted")
    : agent.durationMs != null && agent.durationMs > 0 ? fmtToolDur(agent.durationMs)
    : agent.startTs != null && agent.endTs != null && agent.endTs > agent.startTs ? fmtToolDur(agent.endTs - agent.startTs) : null;
  return <span className="tool-duration">{label}</span>;
}

/** Les sous-agents d'un tour, comme une grappe d'actions : UNE rangée de
 * synthèse sur la grille du fil (icône · libellé · durée · état · chevron),
 * dépliée tant qu'un agent travaille, puis une rangée par agent. Un clic sur
 * un agent ouvre son compte rendu dans le panneau. */
export function AgentActivityGroup({actions, onOpenAgent, eventsByThreadId}: {
  actions: AgentToolAction[];
  eventsByThreadId?: ReadonlyMap<string, AgentEvent[]>;
  onOpenAgent: (agent: AgentDisplay) => void;
}) {
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
  const title = t(agents.length === 1 ? "chat.subagents-title-one" : "chat.subagents-title", {count: agents.length});
  // La coche, l'anneau ou la croix disent déjà l'état : la note ne nomme que
  // l'avancement d'un groupe en cours et ce qui n'a pas abouti.
  const note = [
    working && agents.length > 1 ? t(done <= 1 ? "chat.subagents-progress-one" : "chat.subagents-progress", {done, count: agents.length}) : null,
    failed ? t("chat.subagents-count-failed", {count: failed}) : null,
    interrupted ? t(interrupted === 1 ? "chat.subagents-count-interrupted-one" : "chat.subagents-count-interrupted", {count: interrupted}) : null,
  ].filter(Boolean).join(" · ");
  const starts = agents.map(agent => agent.startTs).filter((ts): ts is number => ts != null);
  // Fin d'un agent : sa durée exacte quand le CLI la donne, sinon son dernier état.
  const ends = agents.map(agent => agent.durationMs != null && agent.startTs != null ? agent.startTs + agent.durationMs : agent.endTs)
    .filter((ts): ts is number => ts != null);
  const start = starts.length ? Math.min(...starts) : null;
  const end = ends.length === agents.length && ends.length ? Math.max(...ends) : null;
  const meta = working
    ? start != null ? <LiveClock since={start} /> : undefined
    : start != null && end != null && end > start ? fmtToolDur(end - start) : undefined;
  return <section className="agent-activity-group" data-testid="subagent-activity-inline-group" aria-label={title}>
    <ActivityDisclosure open={open} onToggle={() => setDisclosure({phase, open: !open})}
      icon={{cat: "agent"}} status={working ? "running" : failed ? "failed" : "completed"} meta={meta}
      label={<>{title}{note ? <span className="agent-group-note" role="status">{note}</span> : null}</>}>
      <div className="agent-group-rows">
        {agents.map(agent => {
          const name = agentTitle(agent);
          const events = eventsByThreadId?.get(agent.threadId) ?? [];
          const live = agent.status === "working" ? currentAgentActivity(agent, events) : null;
          const showLive = live && live !== name && live !== statusLabel(agent);
          return <div key={agent.threadId} className="agent-item">
            <RowButton className="agent-row" data-agent-status={agent.status}
              aria-label={t("chat.subagent-open", {name})} onClick={() => onOpenAgent(agent)}>
              <span className="agent-row-icon"><AgentRowGlyph /></span>
              <span className="agent-row-name">{name}
                {agent.description ? <span className="agent-row-type">{agent.displayName}</span> : null}</span>
              {<AgentDuration agent={agent} />}
              <span className="tool-status" title={agent.status === "failed" ? statusLabel(agent) : undefined}>
                <ToolStateGlyph outcome={agent.status === "working" ? "running" : agent.status === "done" ? "done" : agent.status === "failed" ? "failed" : "none"} />
              </span>
              <Tick />
            </RowButton>
            {showLive ? <div className="agent-row-live">{live}</div> : null}
          </div>;
        })}
      </div>
    </ActivityDisclosure>
  </section>;
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
  const transcript = subagentTranscript(events);
  const plugins = useMdPlugins();
  const prose = transcript.filter(event => event.kind === "text" || event.kind === "streaming" || event.kind === "error");
  const activity = transcript.filter(event => event.kind === "tool" || event.kind === "tool_update" || event.kind === "thinking" || event.kind === "thinking_live");
  // En cours, le message d'état est l'activité de la ligne « en direct »,
  // pas un rapport à répéter en dessous.
  const statusIsLive = agent.status === "working" && liveStatusMessage(agent) != null
    && currentAgentActivity(agent, events, true) === liveStatusMessage(agent);
  const fallback = agent.statusMessage && !opaqueAgentText(agent.statusMessage) && !statusIsLive
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
