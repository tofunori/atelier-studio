import type {ChatTurnViewModel, ProjectedTimelineItem, ToolAction} from '../../lib/chat/turnViewModel';
import {isAgentActivityAction, type AgentToolAction} from './AgentActivity';

type Actions = {type: 'actions'; actions: ToolAction[]; index: number; key: string};
type Agents = {type: 'agents'; actions: AgentToolAction[]; index: number; key: string};
type Row = ProjectedTimelineItem | Actions | Agents;

/** One stable agent surface per turn, independent of intervening tool batches
 * or narration. Observations remain intact; the component reduces their states. */
export function groupAgentRows(rows: Row[], turns: Pick<ChatTurnViewModel, 'key' | 'startIndex' | 'endIndex'>[]): Row[] {
  const result: Row[] = [];
  const groups = new Map<string, Agents>();
  for (const row of rows) {
    const actions = row.type === 'actions' || row.type === 'agents' ? row.actions
      : row.type === 'event' && isAgentActivityAction(row.event) ? [row.event] : null;
    if (!actions?.some(isAgentActivityAction)) { result.push(row); continue; }
    const index = 'index' in row ? row.index : 0;
    const turn = turns.find(turn => index >= turn.startIndex && index < turn.endIndex);
    const key = `agents:${turn?.key ?? row.key}`;
    let chunk: ToolAction[] = [];
    const flush = () => {
      if (!chunk.length) return;
      const first = chunk[0];
      const identity = first.kind === 'tool_update' ? first.id : first.name;
      result.push({type: 'actions', key: `${row.key}:${identity}`, index, actions: chunk});
      chunk = [];
    };
    for (const action of actions) {
      if (!isAgentActivityAction(action)) { chunk.push(action); continue; }
      flush();
      let group = groups.get(key);
      if (!group) {
        group = {type: 'agents', key, index, actions: []};
        groups.set(key, group);
        result.push(group);
      }
      group.actions.push(action);
    }
    flush();
  }
  return result;
}
