import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { AgentEvent } from "../../lib/ws";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { t } from "../../lib/i18n";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { IconButton, RowButton } from "../ui";
import { ActivityStep } from "./ActivityBatch";
import { AgentDuration, type AgentDisplay } from "./AgentActivity";
import { agentTitle, currentAgentActivity, opaqueAgentText, readableAgentTool, subagentTranscript } from "./agentText";
import { MdBody, MD_COMPONENTS, MD_COMPONENTS_STREAMING, useMdPlugins } from "./md";
import type { ToolAction } from "../../lib/chat/turnViewModel";
import { ToolStateGlyph } from "./toolPresentation";
import { TurnActivityStatus } from "./turns";

type Block =
  | { kind: "step"; key: string; actions: ToolAction[] }
  | { kind: "prose"; key: string; text: string; streaming: boolean; error: boolean };

/** Le transcript dans l'ordre : chaque suite d'outils et de pensées devient
 * une étape (la même grappe que dans le fil), chaque texte un paragraphe. */
function transcriptBlocks(events: AgentEvent[]): Block[] {
  const blocks: Block[] = [];
  let step: Extract<Block, { kind: "step" }> | null = null;
  subagentTranscript(events).forEach((event, index) => {
    if (event.kind === "tool" || event.kind === "tool_update" || event.kind === "thinking" || event.kind === "thinking_live") {
      if (!step) {
        step = { kind: "step", key: `step-${index}`, actions: [] };
        blocks.push(step);
      }
      step.actions.push(event.kind === "thinking" || event.kind === "thinking_live"
        ? { kind: "tool", name: "__thinking-step", detail: event.text }
        : readableAgentTool(event));
      return;
    }
    step = null;
    const text = event.kind === "error" ? event.message : event.text;
    if (text.trim()) blocks.push({ kind: "prose", key: `prose-${index}`, text, streaming: event.kind === "streaming", error: event.kind === "error" });
  });
  return blocks;
}

function ChevronIcon({ back = false }: { back?: boolean }) {
  return <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={back ? "M9.5 4.5 6 8l3.5 3.5" : "M6.5 4.5 10 8l-3.5 3.5"} />
  </svg>;
}

/** Ce que la vue montre autour du transcript : mission, rapport de repli
 * et ligne vivante. */
function viewParts(agent: AgentDisplay, events: AgentEvent[], blocks: Block[]) {
  const working = agent.status === "working";
  const prompt = agent.prompt && !opaqueAgentText(agent.prompt) ? agent.prompt : null;
  // Sous-agent sans transcript lisible (Claude d'avant la relecture du disque,
  // ou fichier absent) : son dernier message d'état tient lieu de rapport.
  // Un message d'état qui ne fait que répéter la mission (titre) n'est pas un
  // rapport : la vue dit alors qu'aucun compte rendu n'a été enregistré.
  const message = agent.statusMessage?.trim();
  const fallback = !blocks.length && !working && message && !opaqueAgentText(message)
    && message !== agent.description?.trim() ? message : null;
  // Avec un transcript, l'outil en cours s'y lit déjà : la ligne vivante dit
  // seulement que l'agent travaille. Sans transcript, sa dernière activité.
  const live = !working ? null : blocks.length ? t("chat.subagent-working") : currentAgentActivity(agent, events, true);
  return { working, prompt, fallback, live, empty: !blocks.length && !fallback && !working };
}

function stateOutcome(status: AgentDisplay["status"]) {
  return status === "working" ? "running" : status === "done" ? "done" : status === "failed" ? "failed" : "none";
}

function SubagentProse({ text, streaming = false, error = false }: { text: string; streaming?: boolean; error?: boolean }) {
  const mdPlugins = useMdPlugins();
  return (
    <div className={`subagent-prose msg typeset typeset-chat${error ? " is-error" : ""}`}>
      <MdBody text={normalizeMathDelimiters(text)} streaming={streaming}
        remarkPlugins={mdPlugins.remark} rehypePlugins={mdPlugins.rehype}
        components={streaming ? MD_COMPONENTS_STREAMING : MD_COMPONENTS} />
    </div>
  );
}

function SubagentViewHeader({ agent, title, threadTitle, onClose }: {
  agent: AgentDisplay; title: string; threadTitle: string; onClose: () => void;
}) {
  return (
    <header className="subagent-view-header">
      <IconButton label={t("chat.subagent-back")} onClick={onClose}><ChevronIcon back /></IconButton>
      <nav className="subagent-crumb" aria-label={t("chat.subagent-crumb")}>
        <RowButton className="subagent-crumb-thread" onClick={onClose}>{threadTitle}</RowButton>
        <span className="subagent-crumb-sep"><ChevronIcon /></span>
        <span className="subagent-crumb-title" aria-current="page">{title}</span>
        {agent.description ? <span className="subagent-crumb-type">{agent.displayName}</span> : null}
      </nav>
      <span className="subagent-view-state" role="status">
        <AgentDuration agent={agent} />
        <span className="tool-status"><ToolStateGlyph outcome={stateOutcome(agent.status)} /></span>
      </span>
    </header>
  );
}

/** Un sous-agent lu à la place du chat : sa mission, puis son travail en
 * direct sur la grille du fil, jusqu'à son rapport. Le fil d'Ariane, la
 * flèche ou Échap ramènent au chat, resté monté dessous à sa position. */
export function SubagentView({ agent, events, threadTitle, onClose, renderToolLine, plugins, hideThinking, thinkingCollapsed, threadId }: {
  agent: AgentDisplay;
  events: AgentEvent[];
  threadTitle: string;
  onClose: () => void;
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
  plugins?: PluginCatalogEntry[];
  hideThinking?: boolean;
  thinkingCollapsed?: boolean;
  threadId?: string | null;
}) {
  const blocks = transcriptBlocks(events);
  const title = agentTitle(agent);
  const { working, prompt, fallback, live, empty } = viewParts(agent, events, blocks);
  const lastStep = blocks.length ? blocks[blocks.length - 1] : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Suit le bas tant que le lecteur y est, comme le fil ; un défilement vers
  // le haut le laisse lire en paix.
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [events, agent.status]);

  return (
    <section className="subagent-view" data-testid="subagent-view" data-agent-status={agent.status} aria-label={title}>
      <SubagentViewHeader agent={agent} title={title} threadTitle={threadTitle} onClose={onClose} />
      <div className="subagent-view-scroll" ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}>
        <div className="subagent-view-body" data-testid="agent-transcript">
          {prompt ? <div className="subagent-mission">
            <div className="subagent-mission-label">{t("chat.subagent-mission")}</div>
            <div className="subagent-mission-text">{prompt}</div>
          </div> : null}
          {blocks.map((block) => block.kind === "step"
            ? <ActivityStep key={block.key} actions={block.actions} plugins={plugins} renderToolLine={renderToolLine}
                onOpenAgent={() => {}} hideThinking={hideThinking} thinkingCollapsed={thinkingCollapsed} threadId={threadId}
                active={working && block === lastStep} />
            : <SubagentProse key={block.key} text={block.text} streaming={block.streaming} error={block.error} />)}
          {fallback ? <SubagentProse text={fallback} /> : null}
          {live ? <div className="working-stack subagent-view-live">
            <TurnActivityStatus label={live} kind="action" since={agent.startTs} />
          </div> : null}
          {empty ? <p className="subagent-view-empty" data-testid="agent-transcript-empty">
            {t("chat.subagent-no-transcript")}</p> : null}
        </div>
      </div>
      <footer className="subagent-view-foot"><kbd>{t("chat.subagent-esc-key")}</kbd><span>{t("chat.subagent-esc-hint")}</span></footer>
    </section>
  );
}
