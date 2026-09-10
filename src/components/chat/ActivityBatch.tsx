import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityDisclosure, RowButton } from "../ui";
import type { ToolAction } from '../../lib/chat/turnViewModel';
import { isStoppedTerminal } from '../../lib/chat/turnViewModel';
import type { PluginCatalogEntry } from '../../lib/plugins';
import { distinctToolActions, fmtToolDur, summarizeActivity, Tick, ToolGlyph, toolOutcome } from './toolPresentation';
import { AgentActivityGroup, isAgentActivityAction, type AgentDisplay, type AgentToolAction } from './AgentActivity';
import type { ActivityAction } from './groupActivityRows';
import { EditLine } from './turnParts';
import { TurnActivityStatus } from './turns';

/** The turn owns disclosure; its actions stay in chronological order. */
export function ActivityBatch(p: {
  actions: ToolAction[];
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
  onOpenAgent: (agent: AgentDisplay) => void;
  hideThinking?: boolean; threadId?: string | null;
  /** Normal view keeps long reasoning folded while retaining a readable leaf. */
  thinkingCollapsed?: boolean;
  /** L'étape rend ses erreurs au-dessus du pli : le corps n'en reprend pas. */
  hideErrors?: boolean;
}) {
  const actions: ActivityAction[] = (distinctToolActions(p.actions) as ActivityAction[]).filter(action =>
    action.name !== '__thinking-step' || (!p.hideThinking && 'detail' in action && Boolean(action.detail?.trim())));
  if (!actions.length) return null;
  const actionKey = (action: ActivityAction, index: number) =>
    action.kind === 'tool_update'
      ? action.id
      : action.errorEvent
      ? `error:${action.errorEvent.meta && 'eventId' in action.errorEvent.meta ? action.errorEvent.meta.eventId : index}`
      : `${action.name}:${index}`;
  return <div className="activity-action-list">
    {actions.map((action, index) => {
      const key = actionKey(action, index);
      if (action.name === '__thinking-step') {
        const text = 'detail' in action ? action.detail?.trim() : '';
        return !p.hideThinking && text
          ? <ThoughtLeaf key={key} text={text} collapsed={p.thinkingCollapsed ?? false} />
          : null;
      }
      if (action.editEvent) return <EditLine key={key} event={action.editEvent} threadId={p.threadId ?? null} />;
      if (action.errorEvent) {
        // A voluntary stop is represented by the turn status and should not
        // leave a second red error row in the transcript.
        if (isStoppedTerminal(action.errorEvent) || p.hideErrors) return null;
        return <ActivityErrorLeaf key={key} message={action.errorEvent.message} />;
      }
      if (isAgentActivityAction(action)) {
        if (index > 0 && isAgentActivityAction(actions[index - 1])) return null;
        // Consecutive lifecycle observations belong to one agent surface. The
        // group itself derives current states from the observations; this
        // renderer does not maintain a competing "current" state.
        const agentActions: AgentToolAction[] = [action as AgentToolAction];
        let next = index + 1;
        while (next < actions.length && isAgentActivityAction(actions[next])) {
          agentActions.push(actions[next] as AgentToolAction);
          next += 1;
        }
        return <AgentActivityGroup key={key} actions={agentActions} onOpenAgent={p.onOpenAgent} />;
      }
      return <Fragment key={key}>{p.renderToolLine(action, index)}</Fragment>;
    })}
  </div>;
}

/** A reasoning leaf has the same depth as a tool leaf: one compact row, then
 * an optional body. It intentionally avoids `.ui-activity`, so a completed
 * turn still has a single outer fold and no nested category disclosure. */
function ThoughtLeaf({ text, collapsed }: { text: string; collapsed: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  useEffect(() => { setOpen(!collapsed); }, [collapsed]);
  const preview = text.replace(/\s+/g, ' ').trim();
  return (
    <div className={`activity-thought ${open ? 'open' : 'collapsed'}`}>
      <RowButton
        type="button"
        className="activity-thought-head"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <ToolGlyph icon={{ cat: 'thinking' }} />
        <span className="activity-thought-preview">{preview}</span>
        <Tick open={open} />
      </RowButton>
      {open && <div className="activity-thought-body">{text}</div>}
    </div>
  );
}

/** Une erreur reste LISIBLE sous une étape repliée : elle vit à côté du pli,
 * jamais dans son corps (spec « grappes d'activité », 2026-09-10). */
export function ActivityErrorLeaf({ message }: { message: string }) {
  return (
    <div className="activity-batch-error" role="alert">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2.2 14.5 13.5H1.5z" />
        <path d="M8 6.5v3.2M8 11.9v.1" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/** Une feuille d'outil réelle : ni raisonnement, ni erreur, ni édition
 * synthétique — ce sont elles seules que la synthèse compte. */
function isToolLeaf(action: ActivityAction): boolean {
  if (action.errorEvent || action.editEvent) return false;
  return action.name !== '__thinking-step' && action.name !== '__error'
    && !action.name.startsWith('__edits:');
}

/** Seuil de repli : en dessous, la liste plate reste plus lisible que le pli. */
const STEP_FOLD_THRESHOLD = 3;

/**
 * Une ÉTAPE du tour : les outils consécutifs entre deux narrations. Terminée
 * et fournie, elle se replie en une ligne de synthèse ; active, elle porte la
 * synthèse ET l'unique ligne de statut vivant du fil.
 */
export function ActivityStep(p: {
  actions: ToolAction[];
  plugins?: PluginCatalogEntry[];
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
  onOpenAgent: (agent: AgentDisplay) => void;
  hideThinking?: boolean; threadId?: string | null; thinkingCollapsed?: boolean;
  /** Repli contrôlé (la liste virtualisée détient l'état) ; sinon état local. */
  open?: boolean;
  onToggle?: () => void;
  /** Étape courante du tour actif : shimmer + ligne vivante. */
  active?: boolean;
  liveLabel?: string;
  liveKind?: string;
  liveSince?: number;
  stamp?: ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = p.open ?? localOpen;
  const toggle = () => { setLocalOpen((previous) => !previous); p.onToggle?.(); };
  const distinct = distinctToolActions(p.actions) as ActivityAction[];
  const leaves = distinct.filter(isToolLeaf);
  const errors = distinct.filter((action) => action.errorEvent && !isStoppedTerminal(action.errorEvent));
  const summary = summarizeActivity(leaves, p.plugins);
  const totalMs = leaves.reduce((sum, action) => (
    action.kind === 'tool_update' && typeof action.durationMs === 'number' && action.durationMs > 0
      ? sum + action.durationMs : sum), 0);
  const failed = leaves.some((action) => action.kind === 'tool_update' && toolOutcome(action) === 'failed');
  // Le libellé de synthèse attend 160 ms de stabilité : une rafale d'outils de
  // 40 ms faisait clignoter la ligne (leçon ActivityGroup, 2026-08).
  const nextLabel = summary.label;
  const nextLabelRef = useRef(nextLabel);
  nextLabelRef.current = nextLabel;
  const [shownLabel, setShownLabel] = useState(nextLabel);
  const labelTimer = useRef<number | null>(null);
  useEffect(() => {
    if (labelTimer.current != null || nextLabel === shownLabel) return;
    labelTimer.current = window.setTimeout(() => {
      labelTimer.current = null;
      setShownLabel(nextLabelRef.current);
    }, 160);
  }, [nextLabel, shownLabel]);
  useEffect(() => () => { if (labelTimer.current != null) window.clearTimeout(labelTimer.current); }, []);

  const body = <ActivityBatch actions={p.actions} renderToolLine={p.renderToolLine}
    onOpenAgent={p.onOpenAgent} hideThinking={p.hideThinking} threadId={p.threadId}
    thinkingCollapsed={p.thinkingCollapsed} hideErrors />;

  // Sous le seuil, la liste plate reste plus lisible qu'un pli : deux rangées
  // ne font pas un écran, et replier une étape sans outil masquerait la pensée
  // vivante — seul le NOMBRE d'outils justifie le pli.
  const folded = leaves.length >= STEP_FOLD_THRESHOLD;
  if (!folded && !p.active) {
    return <ActivityBatch actions={p.actions} renderToolLine={p.renderToolLine}
      onOpenAgent={p.onOpenAgent} hideThinking={p.hideThinking} threadId={p.threadId}
      thinkingCollapsed={p.thinkingCollapsed} />;
  }
  return (
    <div className={`activity-step${p.active ? ' is-active' : ''}`}>
      {folded ? (
        <>
          <ActivityDisclosure
            open={open}
            onToggle={toggle}
            status={failed ? 'failed' : p.active ? 'running' : 'completed'}
            shimmer={Boolean(p.active)}
            icon={summary.icon}
            label={shownLabel}
            meta={p.stamp ?? (totalMs > 0 ? fmtToolDur(totalMs) : undefined)}
          >
            {body}
          </ActivityDisclosure>
          {errors.map((action, index) => (
            <ActivityErrorLeaf key={`step-error:${index}`} message={action.errorEvent!.message} />
          ))}
        </>
      ) : (
        <ActivityBatch actions={p.actions} renderToolLine={p.renderToolLine}
          onOpenAgent={p.onOpenAgent} hideThinking={p.hideThinking} threadId={p.threadId}
          thinkingCollapsed={p.thinkingCollapsed} />
      )}
      {p.active && p.liveLabel ? (
        <div className="working-stack active-turn-tail activity-step-live">
          <TurnActivityStatus label={p.liveLabel} kind={p.liveKind ?? 'processing'}
            since={p.liveSince ?? Date.now()} />
        </div>
      ) : null}
    </div>
  );
}
