import type { AgentEvent } from '../../lib/ws';
import type { ChatTurnViewModel, ToolAction } from '../../lib/chat/turnViewModel';
import { t } from '../../lib/i18n';
import { activeToolLabel, toolOutcome } from './toolPresentation';

export type TurnActivityStatus = {
  kind: 'thinking' | 'action' | 'writing' | 'waiting' | 'processing' | 'failed' | 'interrupted';
  label: string;
};
const normalize = (status?: string) => status?.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/_/g, '-') ?? '';
const isRunning = (status?: string) => /^(running|in-progress|inprogress|pending|queued|started|executing)$/.test(normalize(status));
const isReasoning = (event: AgentEvent) => event.kind === 'thinking' || event.kind === 'thinking_live'
  || event.kind === 'thinking_progress' || event.kind === 'thinking_delta'
  || (event.kind === 'tool' && (event.name === '__thinking' || event.name === '__thinking-step'));

/** Presentation uses actual lifecycle signals, not the generic thinking fallback
 * of the timeline model. An old reasoning segment is not a new reasoning phase. */
export function activeTurnStatus(turn: ChatTurnViewModel, events: AgentEvent[]): TurnActivityStatus {
  if (turn.activeState?.kind === 'waiting') return { kind: 'waiting', label: t('chat.awaiting-response') };
  let reasoningIndex = -1;
  let latestIndex = -1;
  let latest: AgentEvent | undefined;
  const agents = new Map<string, string>();
  for (let index = turn.startIndex; index < turn.endIndex; index++) {
    const event = events[index];
    if (!event) continue;
    if (isReasoning(event)) reasoningIndex = index;
    if (isReasoning(event) || ['text', 'streaming', 'tool', 'tool_update', 'activity', 'edit', 'drafting'].includes(event.kind)) {
      latestIndex = index;
      latest = event;
    }
    if (event.kind === 'tool_update' && event.agentActivity) {
      for (const [id, state] of Object.entries(event.agentActivity.agentsStates)) agents.set(id, state.status);
    }
  }
  const activeAgents = [...agents.values()].filter(isRunning).length;
  const boundary = Math.max(turn.latestAssistantIndex ?? -1, reasoningIndex);
  const running = turn.actionGroups.flatMap<ToolAction>(group => {
    const action = group.actions[group.actions.length - 1];
    if (!action || action.name.startsWith('__thinking')) return [];
    if (action.kind === 'tool_update') {
      // A completed spawn is not a completed child. Conversely, don't count a
      // coordination call and its children twice when child states are known.
      if (action.agentActivity && Object.keys(action.agentActivity.agentsStates).length) return [];
      return isRunning(action.status) && !(action.exitCode != null && action.exitCode !== 0) ? [action] : [];
    }
    // Legacy calls lack a terminal signal; a new narration/reasoning segment
    // ends their inferred activity. Explicitly running calls above survive it.
    return group.index > boundary && turn.activeState?.kind === 'activity' ? [action] : [];
  });
  const count = running.length + activeAgents;
  if (activeAgents && running.length === 0) return { kind: 'action', label: t(activeAgents === 1 ? 'chat.agent-running' : 'chat.agents-running', { n: activeAgents }) };
  if (count > 1) return { kind: 'action', label: t('chat.tools-running', { n: count }) };
  if (running.length === 1) return { kind: 'action', label: activeToolLabel(running[0]) };
  if (turn.activeState?.kind === 'activity') {
    const event = events[turn.activeState.eventIndex];
    if (event?.kind === 'activity' && (!event.status || event.status === 'running')) {
      return { kind: 'action', label: event.title || t('chat.activity') };
    }
  }
  if (latest && isReasoning(latest) && reasoningIndex === latestIndex) return { kind: 'thinking', label: t('chat.turn-active') };
  if (latest?.kind === 'streaming') return { kind: 'writing', label: t('chat.answering') };
  if (latest?.kind === 'drafting') return { kind: 'action', label: t('chat.activity-drafting', { tool: latest.tool }) };
  if (latest?.kind === 'tool_update' && latest.agentActivity) {
    const childStates = Object.values(latest.agentActivity.agentsStates).map(child => normalize(child.status));
    if (childStates.some(state => /^(failed|error|errored)$/.test(state))) return { kind: 'failed', label: t('chat.action-failed') };
    if (childStates.some(state => /^(interrupted|cancelled|canceled|stopped)$/.test(state))) return { kind: 'interrupted', label: t('chat.action-interrupted') };
  }
  if (latest?.kind === 'tool_update' && toolOutcome(latest) === 'failed') {
    const interrupted = /^(interrupted|cancelled|canceled|denied|declined|stopped)$/.test(normalize(latest.status));
    return { kind: interrupted ? 'interrupted' : 'failed', label: t(interrupted ? 'chat.action-interrupted' : 'chat.action-failed') };
  }
  return { kind: 'processing', label: t('chat.processing') };
}
