import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { RowButton } from "../ui";
import type { ToolAction } from '../../lib/chat/turnViewModel';
import { isStoppedTerminal } from '../../lib/chat/turnViewModel';
import { distinctToolActions, Tick, ToolGlyph } from './toolPresentation';
import { AgentActivityGroup, isAgentActivityAction, type AgentDisplay, type AgentToolAction } from './AgentActivity';
import type { ActivityAction } from './groupActivityRows';
import { EditLine } from './turnParts';

/** The turn owns disclosure; its actions stay in chronological order. */
export function ActivityBatch(p: {
  actions: ToolAction[];
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
  onOpenAgent: (agent: AgentDisplay) => void;
  hideThinking?: boolean; threadId?: string | null;
  /** Normal view keeps long reasoning folded while retaining a readable leaf. */
  thinkingCollapsed?: boolean;
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
        if (isStoppedTerminal(action.errorEvent)) return null;
        return <div className="activity-batch-error" role="alert" key={key}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2.2 14.5 13.5H1.5z" />
            <path d="M8 6.5v3.2M8 11.9v.1" />
          </svg>
          <span>{action.errorEvent.message}</span>
        </div>;
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
