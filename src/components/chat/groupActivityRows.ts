import type { ProjectedTimelineItem, ToolAction } from '../../lib/chat/turnViewModel';
import { distinctToolActions } from './toolPresentation';
import type { AgentEvent } from '../../lib/ws';

/**
 * A chronological leaf in the activity surface.  Synthetic edit/error rows
 * retain their source event so the leaf can expose the original interaction
 * without rebuilding lifecycle state in the renderer.
 */
export type ActivityAction = ToolAction & {
  editEvent?: Extract<AgentEvent, { kind: 'edit' }>;
  errorEvent?: Extract<AgentEvent, { kind: 'error' }>;
};

type Actions = { type: 'actions'; actions: ActivityAction[]; index: number; key: string };
type Input = ProjectedTimelineItem | Actions | { type: 'agents'; actions: ToolAction[]; index: number; key: string };

/** Presentation only: meaningful messages and attention requests remain boundaries. */
export function groupActivityRows(rows: Input[]): (ProjectedTimelineItem | Actions)[] {
  const result: (ProjectedTimelineItem | Actions)[] = [];
  let batch: Actions | null = null;
  let lastThought: ActivityAction | null = null;
  const append = (action: ActivityAction, index: number, key: string) => {
    if (action.name === '__thinking') action = { ...action, name: '__thinking-step' };
    if (!batch) {
      batch = { type: 'actions', key: `activity:${key}`, index, actions: [] };
      result.push(batch);
    }
    batch.actions.push(action);
  };
  const appendThought = (text: string, index: number, key: string) => {
    // Providers such as Grok persist reasoning in short chunks, sometimes in
    // the middle of a word. Consecutive reasoning rows are one leaf; joining
    // without an inserted separator preserves the provider's exact spacing.
    if (batch && lastThought && batch.actions[batch.actions.length - 1] === lastThought) {
      const merged: ActivityAction = {
        ...lastThought,
        detail: `${lastThought.detail ?? ''}${text}`,
      };
      batch.actions[batch.actions.length - 1] = merged;
      lastThought = merged;
      return;
    }
    const action: ActivityAction = { kind: 'tool', name: '__thinking-step', detail: text };
    append(action, index, key);
    lastThought = action;
  };
  for (const row of rows) {
    if (row.type === 'actions' || row.type === 'agents') {
      lastThought = null;
      row.actions.forEach((action, i) => {
        const meta = action.meta && 'eventId' in action.meta ? action.meta : null;
        const identity = meta?.itemId ?? ('id' in action && action.id ? action.id : meta?.eventId ?? `${row.index}:${i}`);
        append(action, row.index, `${meta?.turnId ?? 'legacy'}:${identity}`);
      });
    } else if (row.type === 'event' && row.event.kind === 'tool' && row.event.name === '__thinking') {
      lastThought = null;
      append(row.event, row.index, row.key);
    } else if (row.type === 'event' && row.event.kind === 'edit') {
      row.event.files.forEach((file) => {
        const action: ActivityAction = {
          kind: 'tool', name: `__edits:${file.path}`,
          editEvent: { ...row.event as Extract<AgentEvent, { kind: 'edit' }>, files: [file] },
        };
        append(action, row.index, `${row.key}:${file.path}`);
      });
    } else if (row.type === 'event' && (row.event.kind === 'thinking' || row.event.kind === 'thinking_live')) {
      appendThought(row.event.text, row.index, row.key);
    } else if (row.type === 'event' && row.event.kind === 'error') {
      // Errors are part of the same chronological activity stream.  Keep the
      // source event attached to a synthetic tool leaf so the surface can
      // render the message without introducing a second disclosure level.
      append({ kind: 'tool', name: '__error', detail: row.event.message, errorEvent: row.event }, row.index, row.key);
    } else {
      batch = null;
      lastThought = null;
      result.push(row);
    }
  }
  for (const row of result) {
    if (row.type !== 'actions') continue;
    // The deduper keys tool updates by lifecycle identity while preserving the
    // synthetic metadata carried by edit/error leaves.
    row.actions = distinctToolActions(row.actions) as ActivityAction[];
  }
  return result;
}
