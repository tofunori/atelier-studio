import type { AgentEvent } from '../../lib/ws';
import type { ChatTurnViewModel } from '../../lib/chat/turnViewModel';
import { t } from '../../lib/i18n';
import { activeToolLabel } from './toolPresentation';

export type TurnActivityStatus = {
  kind: 'thinking' | 'action' | 'writing' | 'waiting' | 'processing' | 'failed' | 'interrupted' | 'completed';
  label: string;
};

/**
 * Present the canonical lifecycle projection.
 *
 * `events` remains an optional compatibility argument for callers that still
 * pass the transcript. It is intentionally unused: scanning it here used to
 * create a second state machine that disagreed with `turnViewModel` during
 * fast tool completion, replay, and parallel-agent updates.
 */
export function activeTurnStatus(turn: ChatTurnViewModel, _events?: AgentEvent[]): TurnActivityStatus {
  const lifecycle = turn.lifecycle;
  if (!lifecycle) return { kind: 'thinking', label: t('chat.turn-active') };

  if (lifecycle.state.kind === 'terminal') {
    if (lifecycle.state.status === 'failed') return { kind: 'failed', label: t('chat.action-failed') };
    if (lifecycle.state.status === 'stopped') return { kind: 'interrupted', label: t('chat.action-interrupted') };
    // A completed turn is not an active status in the normal tail (the view
    // hides it), but preserving the terminal kind keeps this function a pure
    // projection of the lifecycle when called by replay/tests.
    return { kind: 'completed', label: t('chat.turn-done') };
  }

  if (lifecycle.state.kind === 'waiting' || lifecycle.pendingInteractionIndex != null) {
    return { kind: 'waiting', label: t('chat.awaiting-response') };
  }

  const activeAgents = lifecycle.runningAgents.length;
  const runningTools = lifecycle.runningTools;
  const runningCount = activeAgents + runningTools.length;
  if (activeAgents > 0 && runningTools.length === 0) {
    return {
      kind: 'action',
      label: t(activeAgents === 1 ? 'chat.agent-running' : 'chat.agents-running', { n: activeAgents }),
    };
  }
  if (runningCount > 1) return { kind: 'action', label: t('chat.tools-running', { n: runningCount }) };
  if (runningTools.length === 1) return { kind: 'action', label: activeToolLabel(runningTools[0]!) };

  const latestActivity = lifecycle.latestActivity;
  if (lifecycle.state.kind === 'activity' && latestActivity && latestActivity.status !== 'completed' && latestActivity.status !== 'failed') {
    return { kind: 'action', label: latestActivity.title || t('chat.activity') };
  }
  if (lifecycle.state.kind === 'answering') return { kind: 'writing', label: t('chat.answering') };
  if (lifecycle.state.kind === 'reasoning') return { kind: 'thinking', label: t('chat.turn-active') };
  if (lifecycle.state.kind === 'processing') return { kind: 'processing', label: t('chat.processing') };
  return { kind: 'thinking', label: t('chat.turn-active') };
}
