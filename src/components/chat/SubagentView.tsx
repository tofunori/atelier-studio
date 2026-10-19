import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { AgentEvent } from "../../lib/ws";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { t } from "../../lib/i18n";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { IconButton, RowButton } from "../ui";
import { ActivityStep } from "./ActivityBatch";
import {
  agentDuration, agentTitle, currentAgentActivity, opaqueAgentText, readableAgentTool, subagentTranscript,
  type AgentDisplay,
} from "./AgentActivity";
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
  const mdPlugins = useMdPlugins();
  const blocks = transcriptBlocks(events);
  const working = agent.status === "working";
  const title = agentTitle(agent);
  const prompt = agent.prompt && !opaqueAgentText(agent.prompt) ? agent.prompt : null;
  // Sous-agent sans transcript lisible (Claude d'avant la relecture du disque,
  // ou fichier absent) : son dernier message d'état tient lieu de rapport.
  const fallback = !blocks.length && !working && agent.statusMessage && !opaqueAgentText(agent.statusMessage)
    ? agent.statusMessage : null;
  // Avec un transcript, l'outil en cours s'y lit déjà : la ligne vivante dit
  // seulement que l'agent travaille. Sans transcript, sa dernière activité.
  const live = !working ? null : blocks.length ? t("chat.subagent-working") : currentAgentActivity(agent, events, true);
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
      <header className="subagent-view-header">
        <IconButton label={t("chat.subagent-back")} onClick={onClose}><ChevronIcon back /></IconButton>
        <nav className="subagent-crumb" aria-label={t("chat.subagent-crumb")}>
          <RowButton className="subagent-crumb-thread" onClick={onClose}>{threadTitle}</RowButton>
          <span className="subagent-crumb-sep"><ChevronIcon /></span>
          <span className="subagent-crumb-title" aria-current="page">{title}</span>
          {agent.description ? <span className="subagent-crumb-type">{agent.displayName}</span> : null}
        </nav>
        <span className="subagent-view-state" role="status">
          {agentDuration(agent)}
          <span className="tool-status">
            <ToolStateGlyph outcome={working ? "running" : agent.status === "done" ? "done" : agent.status === "failed" ? "failed" : "none"} />
          </span>
        </span>
      </header>
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
            : <div key={block.key} className={`subagent-prose msg typeset typeset-chat${block.error ? " is-error" : ""}`}>
                <MdBody text={normalizeMathDelimiters(block.text)} streaming={block.streaming}
                  remarkPlugins={mdPlugins.remark} rehypePlugins={mdPlugins.rehype}
                  components={block.streaming ? MD_COMPONENTS_STREAMING : MD_COMPONENTS} />
              </div>)}
          {fallback ? <div className="subagent-prose msg typeset typeset-chat">
            <MdBody streaming={false} text={normalizeMathDelimiters(fallback)}
              remarkPlugins={mdPlugins.remark} rehypePlugins={mdPlugins.rehype} components={MD_COMPONENTS} />
          </div> : null}
          {live ? <div className="working-stack subagent-view-live">
            <TurnActivityStatus label={live} kind="action" since={agent.startTs} />
          </div> : null}
          {!blocks.length && !fallback && !working ? <p className="subagent-view-empty" data-testid="agent-transcript-empty">
            {t("chat.subagent-no-transcript")}</p> : null}
        </div>
      </div>
      <footer className="subagent-view-foot"><kbd>{t("chat.subagent-esc-key")}</kbd><span>{t("chat.subagent-esc-hint")}</span></footer>
    </section>
  );
}
