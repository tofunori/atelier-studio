import type { ProjectedTimelineItem, ToolAction } from '../../lib/chat/turnViewModel';
import { isImageGenerationAction } from '../../lib/chat/turnViewModel';
import { distinctToolActions, toolOutcome } from './toolPresentation';
import type { AgentEvent } from '../../lib/ws';

export type ActivityAction = ToolAction & { editEvent?: Extract<AgentEvent, { kind: 'edit' }> };

type Actions = { type: 'actions'; actions: ToolAction[]; index: number; key: string };
type Input = ProjectedTimelineItem | Actions | { type: 'agents'; actions: ToolAction[]; index: number; key: string };

/** Presentation only: meaningful messages and attention requests remain boundaries. */
export function groupActivityRows(rows: Input[]): (ProjectedTimelineItem | Actions)[] {
  const result: (ProjectedTimelineItem | Actions)[] = [];
  let batch: Actions | null = null;
  const append = (action: ToolAction, index: number, key: string) => {
    if (action.name === '__thinking') action = { ...action, name: '__thinking-step' };
    const attention = isImageGenerationAction(action) ||
      (action.kind === 'tool_update' && (toolOutcome(action) === 'failed' ||
        /^(declined|denied|interrupted|cancelled|canceled|stopped)$/i.test(action.status ?? '')));
    if (attention) {
      batch = null;
      result.push({ type: 'event', key, event: action, index });
      return;
    }
    if (!batch) {
      batch = { type: 'actions', key: `activity:${key}`, index, actions: [] };
      result.push(batch);
    }
    batch.actions.push(action);
  };
  for (const row of rows) {
    if (row.type === 'actions' || row.type === 'agents') {
      row.actions.forEach((action, i) => {
        const meta = action.meta && 'eventId' in action.meta ? action.meta : null;
        const identity = meta?.itemId ?? ('id' in action && action.id ? action.id : meta?.eventId ?? `${row.index}:${i}`);
        append(action, row.index, `${meta?.turnId ?? 'legacy'}:${identity}`);
      });
    } else if (row.type === 'event' && row.event.kind === 'tool' && row.event.name === '__thinking') {
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
      append({ kind: 'tool', name: '__thinking-step', detail: row.event.text }, row.index, row.key);
    } else {
      batch = null;
      result.push(row);
    }
  }
  for (const row of result) if (row.type === 'actions') row.actions = distinctToolActions(row.actions);
  return result;
}
