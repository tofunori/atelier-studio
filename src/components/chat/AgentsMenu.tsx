// Panneau « Agents » de l'en-tête du chat (maquette 2026-10-21, piste A) :
// les spécialistes délégués de ce fil, puis les sous-agents en cours. Un
// sous-agent terminé reste visible deux minutes, puis passe sous un pied
// replié ; l'historique complet vit dans le fil de la conversation.
import { useRef, useState, type ReactElement } from "react";
import { LazyDropdownMenu, type LazyDropdownMenuGroup } from "../ui/LazyDropdownMenu";
import { t } from "../../lib/i18n";
import type { LinkedAgentSummary } from "../../lib/threadLinks";
import { AgentDuration, AgentRowGlyph, type AgentDisplay } from "./AgentActivity";
import { agentTitle, liveStatusMessage, statusLabel } from "./agentText";
import { LiveClock } from "./LiveClock";
import { ToolStateGlyph } from "./toolPresentation";

/** Délai après lequel un sous-agent terminé quitte la liste principale. */
export const AGENT_DONE_GRACE_MS = 2 * 60 * 1000;

export type HeaderSubagent = { agent: AgentDisplay; latestTurn: boolean };

/** Sous-agents montrés d'emblée (en cours, ou finis depuis moins de deux
 * minutes) et ceux rangés sous le pied. */
export function splitSubagents(all: HeaderSubagent[], now: number) {
  const visible: AgentDisplay[] = [];
  const done: AgentDisplay[] = [];
  for (const { agent } of all) {
    const fresh = agent.status === "working"
      || (agent.endTs != null && now - agent.endTs < AGENT_DONE_GRACE_MS);
    (fresh ? visible : done).push(agent);
  }
  return { visible, done };
}

function ago(iso: string | undefined, now: number): string | null {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return null;
  const minutes = Math.floor(Math.max(0, now - at) / 60000);
  if (minutes < 1) return t("home.rel.now");
  if (minutes < 60) return t("home.rel.min", { n: minutes });
  if (minutes < 60 * 24) return t("home.rel.hours", { n: Math.floor(minutes / 60) });
  return t("home.rel.days", { n: Math.floor(minutes / (60 * 24)) });
}

const outcome = (agent: AgentDisplay) => agent.status === "working" ? "running"
  : agent.status === "done" ? "done" : agent.status === "failed" ? "failed" : "none";

function SubagentRow({ agent }: { agent: AgentDisplay }) {
  const activity = agent.status === "working" ? liveStatusMessage(agent) : statusLabel(agent);
  const meta = agent.description ? [agent.displayName, activity].filter(Boolean).join(" · ") : activity;
  return (
    <span className="agents-mi" data-agent-status={agent.status}>
      <span className="agents-mi-lead"><AgentRowGlyph /></span>
      <span className="agents-mi-text">
        <span className="agents-mi-l1"><span className="agents-mi-name">{agentTitle(agent)}</span></span>
        {meta ? <span className="agents-mi-l2">{meta}</span> : null}
      </span>
      <AgentDuration agent={agent} />
      <span className="tool-status"><ToolStateGlyph outcome={outcome(agent)} /></span>
    </span>
  );
}

function SpecialistRow({ entry, now }: { entry: LinkedAgentSummary; now: number }) {
  const nom = entry.specialiste?.nom ?? entry.title;
  const court = entry.specialiste?.nomCourt ?? nom;
  const state = entry.running ? "working" : entry.paused ? "paused" : "idle";
  const l2 = entry.running ? t("chat.agents-specialist-working")
    : entry.paused ? t("chat.agents-specialist-paused")
    : t("chat.agents-specialist-idle", { nom: court });
  return (
    <span className="agents-mi" data-agent-status={state}>
      <span className="agents-mi-lead"><span className="agents-mi-monogram" aria-hidden="true">{court.charAt(0).toUpperCase()}</span></span>
      <span className="agents-mi-text">
        <span className="agents-mi-l1">
          <span className="agents-mi-name">{nom}</span>
          {entry.title ? <span className="agents-mi-title">{entry.title}</span> : null}
        </span>
        <span className="agents-mi-l2">{l2}</span>
      </span>
      {entry.running && entry.since != null
        ? <LiveClock since={entry.since} className="tool-duration" />
        : <span className="tool-duration">{entry.running ? null : ago(entry.updatedAt, now)}</span>}
      <span className="tool-status">{entry.running ? <ToolStateGlyph outcome="running" /> : null}</span>
    </span>
  );
}

/** Chargé à la demande (budget du JS d'entrée) : l'en-tête fournit le bouton,
 * qu'il montre seul le temps que ce module arrive. */
export default function AgentsMenu({ subagents, specialists, running, trigger, onOpenSubagent, onOpenSpecialist }: {
  subagents: HeaderSubagent[];
  specialists: LinkedAgentSummary[];
  running: number;
  trigger: (open: boolean) => ReactElement;
  onOpenSubagent: (agent: AgentDisplay) => void;
  onOpenSpecialist: (threadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const now = Date.now();
  const { visible, done } = splitSubagents(subagents, now);

  const subagentItem = (agent: AgentDisplay) => ({
    key: `agent:${agent.threadId}`,
    className: "agents-menu-item",
    label: <SubagentRow agent={agent} />,
    onSelect: () => onOpenSubagent(agent),
  });
  const groups: LazyDropdownMenuGroup[] = [];
  if (specialists.length) {
    groups.push({
      key: "specialists",
      label: <span className="agents-menu-group">{t("chat.agents-specialists")}</span>,
      items: specialists.map((entry) => ({
        key: `specialist:${entry.id}`,
        className: "agents-menu-item",
        label: <SpecialistRow entry={entry} now={now} />,
        onSelect: () => onOpenSpecialist(entry.id),
      })),
    });
  }
  if (visible.length) {
    groups.push({ key: "subagents", label: <span className="agents-menu-group">{t("chat.agents-subagents-running")}</span>, items: visible.map(subagentItem) });
  }
  if (!groups.length) {
    groups.push({ key: "empty", items: [{ key: "empty", disabled: true, className: "agents-menu-empty", label: t("chat.agents-none-active") }] });
  }
  if (done.length) {
    groups.push({
      key: "done",
      separatorBefore: true,
      items: [
        {
          key: "done-toggle",
          keepOpen: true,
          className: "agents-menu-foot",
          label: (
            <span className="agents-menu-foot-row" data-open={showDone || undefined}>
              <svg className="agents-menu-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>
              <span>{t(done.length === 1 ? "chat.agents-done-one" : "chat.agents-done", { count: done.length })}</span>
              <span className="agents-menu-foot-hint">{t("chat.agents-done-hint")}</span>
            </span>
          ),
          onSelect: () => setShowDone((value) => !value),
        },
        ...(showDone ? done.map(subagentItem) : []),
      ],
    });
  }

  return (
    <LazyDropdownMenu
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) setShowDone(false); }}
      triggerRef={anchor}
      align="end"
      className="agents-menu"
      label={t("chat.agents-menu")}
      header={(
        <span className="agents-menu-head">
          {t("chat.agents-menu")}
          {running > 0 ? <span className="agents-menu-count">{t(running === 1 ? "chat.agents-active-one" : "chat.agents-active", { count: running })}</span> : null}
        </span>
      )}
      trigger={trigger(open)}
      groups={groups}
    />
  );
}
