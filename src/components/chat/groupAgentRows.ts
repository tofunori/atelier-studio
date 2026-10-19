import type {ChatTurnViewModel, ProjectedTimelineItem, ToolAction} from '../../lib/chat/turnViewModel';
import type {AgentEvent} from '../../lib/ws';
import {isAgentActivityAction, type AgentToolAction} from './AgentActivity';

type Actions = {type: 'actions'; actions: ToolAction[]; index: number; key: string};
type Agents = {type: 'agents'; actions: AgentToolAction[]; index: number; key: string};
type Row = ProjectedTimelineItem | Actions | Agents;
type Turn = Pick<ChatTurnViewModel, 'key' | 'startIndex' | 'endIndex'>;

const rowIndex = (row: Row) => ('index' in row ? row.index : 0);
const rowAgentActions = (row: Row) => row.type === 'actions' || row.type === 'agents' ? row.actions
  : row.type === 'event' && isAgentActivityAction(row.event) ? [row.event] : null;

/** Message utilisateur après lequel la grappe d'un tour doit vivre.
 *
 * Un message de pilotage (steer) entre dans le tour EN COURS : sans cette
 * ancre, la grappe restait au-dessus de lui, à la place du premier
 * lancement, et ses agents continuaient de tourner dans ce qui se lit comme
 * la réponse précédente (Thierry 2026-10-19). La grappe suit donc le dernier
 * message utilisateur qui précède la dernière activité d'agent : un agent qui
 * se lance, avance ou se termine après le steer la fait descendre ; des
 * agents tous finis avant lui la laissent où elle était. */
function anchorUserIndex(events: AgentEvent[], turn: Turn): number {
  let lastAgent = -1;
  for (let index = turn.endIndex - 1; index >= turn.startIndex; index -= 1) {
    if (isAgentActivityAction(events[index])) { lastAgent = index; break; }
  }
  for (let index = lastAgent - 1; index >= turn.startIndex; index -= 1) {
    if (events[index]?.kind === 'user') return index;
  }
  return -1;
}

/** One stable agent surface per turn, independent of intervening tool batches
 * or narration. Observations remain intact; the component reduces their states. */
export function groupAgentRows(rows: Row[], turns: Turn[], events?: AgentEvent[]): Row[] {
  const turnOf = (index: number) => turns.find(turn => index >= turn.startIndex && index < turn.endIndex);
  // « Après le message » se lit dans l'ordre des lignes, pas par index : un
  // groupe d'outil se rend à sa PREMIÈRE apparition avec l'index de sa
  // dernière mise à jour.
  const anchors = new Map<string, {user: number; agentRowAfter: boolean}>();
  for (const turn of turns) anchors.set(turn.key, {user: events ? anchorUserIndex(events, turn) : -1, agentRowAfter: false});
  const isAnchorUser = (row: Row, anchor: {user: number}) =>
    row.type === 'event' && row.event.kind === 'user' && row.index === anchor.user;
  const passed = new Set<string>();
  for (const [key, anchor] of anchors) if (anchor.user < 0) passed.add(key);
  for (const row of rows) {
    const key = turnOf(rowIndex(row))?.key ?? '';
    const anchor = anchors.get(key);
    if (!anchor) continue;
    if (isAnchorUser(row, anchor)) passed.add(key);
    else if (passed.has(key) && rowAgentActions(row)?.some(isAgentActivityAction)) anchor.agentRowAfter = true;
  }
  passed.clear();
  for (const [key, anchor] of anchors) if (anchor.user < 0) passed.add(key);

  const result: Row[] = [];
  const groups = new Map<string, Agents>();
  const placed = new Set<string>();
  const firstSeen = new Map<string, number>();
  const groupFor = (key: string, index: number) => {
    let group = groups.get(key);
    if (!group) {
      group = {type: 'agents', key, index, actions: []};
      groups.set(key, group);
    }
    return group;
  };
  const place = (key: string, group: Agents) => {
    if (placed.has(key)) return;
    placed.add(key);
    result.push(group);
  };
  for (const row of rows) {
    const index = rowIndex(row);
    const turn = turnOf(index);
    const anchor = turn ? anchors.get(turn.key) : undefined;
    const actions = rowAgentActions(row);
    if (!actions?.some(isAgentActivityAction)) {
      result.push(row);
      if (turn && anchor && isAnchorUser(row, anchor)) {
        passed.add(turn.key);
        // Steer sans nouveau lancement : la grappe se pose juste sous lui.
        const key = `agents:${turn.key}`;
        if (!anchor.agentRowAfter && groups.has(key)) place(key, groupFor(key, index));
      }
      continue;
    }
    const key = `agents:${turn?.key ?? row.key}`;
    const canPlace = !turn || !anchor || passed.has(turn.key);
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
      const group = groupFor(key, index);
      if (!firstSeen.has(key)) firstSeen.set(key, result.length);
      if (canPlace) place(key, group);
      group.actions.push(action);
    }
    flush();
  }
  // Filet : une ancre jamais rencontrée (message hors des lignes) remet la
  // grappe à sa première apparition plutôt que de la perdre.
  const missing = [...groups].filter(([key]) => !placed.has(key))
    .sort(([a], [b]) => (firstSeen.get(b) ?? 0) - (firstSeen.get(a) ?? 0));
  for (const [key, group] of missing) result.splice(firstSeen.get(key) ?? result.length, 0, group);
  return result;
}
