import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityDisclosure, RowButton } from "../ui";
import type { ToolAction } from '../../lib/chat/turnViewModel';
import { isStoppedTerminal } from '../../lib/chat/turnViewModel';
import type { PluginCatalogEntry } from '../../lib/plugins';
import { activityPartKind, distinctToolActions, fmtToolDur, summarizeActivity, type SummaryPartKind, Tick, ToolGlyph, toolOutcome } from './toolPresentation';
import { AgentActivityGroup, isAgentActivityAction, type AgentDisplay, type AgentToolAction } from './AgentActivity';
import type { ActivityAction } from './groupActivityRows';
import { EditLine } from './turnParts';
import { TurnActivityStatus } from './turns';
import { Working } from './turnParts';

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

type StepSegment =
  | { kind: 'cluster'; key: string; part: SummaryPartKind; actions: ActivityAction[] }
  | { kind: 'flat'; key: string; actions: ActivityAction[] };

function actionKey(action: ActivityAction, index: number): string {
  if (action.kind === 'tool_update') return action.id;
  if (action.errorEvent) return `error:${action.errorEvent.meta && 'eventId' in action.errorEvent.meta ? action.errorEvent.meta.eventId : index}`;
  return `${action.name}:${index}`;
}

/** Découpe une étape en SÉRIES : les outils consécutifs de même catégorie
 * (commandes, lectures, recherches…) forment une grappe ; tout le reste
 * (pensée, édition, erreur, sous-agents) reste à plat, dans l'ordre. Sans ce
 * découpage, un tour de trente outils sans narration ne faisait qu'une seule
 * grappe muette (Thierry 2026-09-10). */
export function segmentStep(actions: ActivityAction[]): StepSegment[] {
  const segments: StepSegment[] = [];
  actions.forEach((action, index) => {
    const key = actionKey(action, index);
    const last = segments[segments.length - 1];
    if (isToolLeaf(action) && !isAgentActivityAction(action)) {
      const part = activityPartKind(action);
      if (last?.kind === 'cluster' && last.part === part) { last.actions.push(action); return; }
      segments.push({ kind: 'cluster', key: `cluster:${key}`, part, actions: [action] });
      return;
    }
    if (last?.kind === 'flat') { last.actions.push(action); return; }
    segments.push({ kind: 'flat', key: `flat:${key}`, actions: [action] });
  });
  return segments;
}

/** Une grappe : une ligne de synthèse repliable ; active, elle porte AUSSI
 * la partie vivante (« 8 commandes exécutées · Réflexion en cours… »). */
function ClusterLine(p: {
  actions: ActivityAction[];
  plugins?: PluginCatalogEntry[];
  open: boolean;
  onToggle: () => void;
  live?: { label: string; since: number };
  stamp?: ReactNode;
  children: ReactNode;
}) {
  const summary = summarizeActivity(p.actions, p.plugins);
  const totalMs = p.actions.reduce((sum, action) => (
    action.kind === 'tool_update' && typeof action.durationMs === 'number' && action.durationMs > 0
      ? sum + action.durationMs : sum), 0);
  const failed = p.actions.some((action) => action.kind === 'tool_update' && toolOutcome(action) === 'failed');
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
  return (
    <ActivityDisclosure
      open={p.open}
      onToggle={p.onToggle}
      status={failed ? 'failed' : p.live ? 'running' : 'completed'}
      shimmer={false}
      icon={summary.icon}
      label={p.live
        ? <>
            <span className="activity-cluster-summary">{shownLabel}</span>
            <span className="activity-cluster-sep" aria-hidden="true"> · </span>
            <span className="active-turn-tail activity-cluster-live">
              <span className="turn-quiet is-on turn-working-shimmer" role="status" aria-live="polite">{p.live.label}</span>
            </span>
          </>
        : shownLabel}
      meta={p.live
        ? <Working since={p.live.since} compact />
        : (p.stamp ?? (totalMs > 0 ? fmtToolDur(totalMs) : undefined))}
    >
      {p.children}
    </ActivityDisclosure>
  );
}

/**
 * Une ÉTAPE du tour : les outils consécutifs entre deux narrations, rendus en
 * séries de même catégorie. Une série posée de 3 outils ou plus se replie en
 * une ligne ; en dessous, rangées plates. La dernière série de l'étape ACTIVE
 * tient toujours sur une ligne « synthèse · statut vivant », l'unique ligne de
 * statut du fil ; sans outil, la ligne vivante seule.
 */
export function ActivityStep(p: {
  actions: ToolAction[];
  plugins?: PluginCatalogEntry[];
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
  onOpenAgent: (agent: AgentDisplay) => void;
  hideThinking?: boolean; threadId?: string | null; thinkingCollapsed?: boolean;
  /** Repli contrôlé par la liste virtualisée : `open` force toutes les
   * grappes ouvertes ; `onToggle` est notifié à chaque bascule. */
  open?: boolean;
  onToggle?: () => void;
  /** Étape courante du tour actif : porte la ligne vivante. */
  active?: boolean;
  liveLabel?: string;
  liveKind?: string;
  liveSince?: number;
  stamp?: ReactNode;
}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const distinct = distinctToolActions(p.actions) as ActivityAction[];
  const segments = segmentStep(distinct);
  const last = segments[segments.length - 1];
  const liveCluster = p.active && p.liveLabel && last?.kind === 'cluster' ? last : null;
  const live = p.active && p.liveLabel ? { label: p.liveLabel, since: p.liveSince ?? Date.now() } : null;
  const batch = (actions: ActivityAction[], hideErrors = false) => (
    <ActivityBatch actions={actions} renderToolLine={p.renderToolLine}
      onOpenAgent={p.onOpenAgent} hideThinking={p.hideThinking} threadId={p.threadId}
      thinkingCollapsed={p.thinkingCollapsed} hideErrors={hideErrors} />
  );
  if (!segments.length && !live) return null;
  return (
    <div className={`activity-cluster${p.active ? ' is-active' : ''}`}>
      {segments.map((segment) => {
        if (segment.kind === 'flat') return <Fragment key={segment.key}>{batch(segment.actions)}</Fragment>;
        const isLive = segment === liveCluster;
        if (!isLive && segment.actions.length < STEP_FOLD_THRESHOLD) {
          return <Fragment key={segment.key}>{batch(segment.actions)}</Fragment>;
        }
        const open = p.open || openKeys.has(segment.key);
        return (
          <ClusterLine key={segment.key} actions={segment.actions} plugins={p.plugins}
            open={open}
            onToggle={() => {
              setOpenKeys((prev) => {
                const next = new Set(prev);
                if (next.has(segment.key)) next.delete(segment.key); else next.add(segment.key);
                return next;
              });
              p.onToggle?.();
            }}
            live={isLive && live ? live : undefined}
            stamp={p.stamp}>
            {batch(segment.actions, true)}
          </ClusterLine>
        );
      })}
      {live && !liveCluster ? (
        <div className="working-stack active-turn-tail activity-cluster-live">
          <TurnActivityStatus label={live.label} kind={p.liveKind ?? 'processing'} since={live.since} />
        </div>
      ) : null}
    </div>
  );
}
