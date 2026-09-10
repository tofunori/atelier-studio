import { describe, expect, it } from 'vitest';
import { groupActivityRows } from './groupActivityRows';
import type { ProjectedTimelineItem, ToolAction } from '../../lib/chat/turnViewModel';
const event = (event: Extract<ProjectedTimelineItem, { type: 'event' }>['event'], index: number): ProjectedTimelineItem => ({ type: 'event', key: `e${index}`, event, index });
const tools = (name: string, index: number) => ({ type: 'actions' as const, key: `t${index}`, index, actions: [{ kind: 'tool_update', id: String(index), name, status: 'completed' } as ToolAction] });
describe('groupActivityRows', () => {
  it('absorbs legacy reasoning markers without splitting the activity batch', () => {
    const result = groupActivityRows([
      tools('Read', 0), event({ kind: 'tool', name: '__thinking' }, 1),
      tools('Bash', 2), event({ kind: 'thinking', text: 'Vérification' }, 3),
      tools('view_image', 4),
    ]);
    expect(result).toHaveLength(1);
    if (result[0].type !== 'actions') throw new Error('Expected activity batch');
    expect(result[0].actions.map(action => action.name)).toEqual(['Read', '__thinking-step', 'Bash', '__thinking-step', 'view_image']);
  });
  it('bundles edited files with nearby tools while preserving their diffs', () => {
    const edit = { kind: 'edit' as const, projectRoot: '/project', baseSha: 'base', files: [
      { path: 'discussion_en.tex', add: 2, del: 1, oldText: 'old', newText: 'new' },
      { path: 'results_en.tex', add: 1, del: 0, unified: '@@ diff' },
    ] };
    const result = groupActivityRows([tools('Read', 0), event(edit, 1), tools('Bash', 2)]);
    expect(result).toHaveLength(1);
    if (result[0].type !== 'actions') throw new Error('Expected a single activity batch');
    expect(result[0].actions).toHaveLength(4);
    expect(result[0].actions[1]).toMatchObject({ name: '__edits:discussion_en.tex', editEvent: { projectRoot: '/project', baseSha: 'base', files: [edit.files[0]] } });
    expect(result[0].actions[2]).toMatchObject({ editEvent: { files: [edit.files[1]] } });
  });
  it('joins mixed actions across reasoning, with a stable key on append', () => {
    const first = tools('Bash', 0);
    const initial = groupActivityRows([first]);
    const result = groupActivityRows([first, event({ kind: 'thinking', text: 'Contrôle' }, 1), tools('view_image', 2), { ...tools('spawn_agent', 3), type: 'agents' }]);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe(initial[0].key);
    expect(result[0].type === 'actions' && result[0].actions).toHaveLength(4);
  });
  it('keeps narration between separate batches', () => {
    const narration = event({ kind: 'text', text: 'Je vérifie les annexes.' }, 1);
    const result = groupActivityRows([tools('Read', 0), narration, tools('Bash', 2)]);
    expect(result.map(row => row.type)).toEqual(['actions', 'event', 'actions']);
    expect(result[1]).toBe(narration);
  });
  it('exposes failed tools and generated images outside the batch', () => {
    const failed = tools('Bash', 1); failed.actions[0] = { ...failed.actions[0], status: 'failed', exitCode: 1 } as ToolAction;
    const result = groupActivityRows([tools('Read', 0), failed, tools('image_generation', 2), tools('Read', 3)]);
    expect(result.map(row => row.type)).toEqual(['actions', 'event', 'event', 'actions']);
  });
  it('does not swallow pending permissions', () => {
    const permission = event({ kind: 'permission', toolName: 'Bash', requestId: 'approval', answered: null, input: {} }, 1);
    expect(groupActivityRows([tools('Read', 0), permission, tools('Read', 2)])[1]).toBe(permission);
  });
  it('keeps an agent-first batch stable as its source group grows', () => {
    const first = { ...tools('spawn_agent', 0), type: 'agents' as const, key: 'agents:first:first' };
    const grown = { ...first, key: 'agents:first:last', actions: [...first.actions, ...tools('spawn_agent', 1).actions] };
    expect(groupActivityRows([first])[0].key).toBe(groupActivityRows([grown])[0].key);
  });
  it('keeps declined actions visible', () => {
    const row = tools('Bash', 0); row.actions[0] = { ...row.actions[0], status: 'declined' } as ToolAction;
    expect(groupActivityRows([row])[0].type).toBe('event');
  });
  it('keeps the same block when an item receives a new event identity', () => {
    const make = (eventId: string, status: string) => {
      const row = tools('Bash', 0);
      row.actions[0] = { ...row.actions[0], status, meta: { eventId, itemId: 'command-1', turnId: 'turn-1' } } as ToolAction;
      return row;
    };
    expect(groupActivityRows([make('first', 'running')])[0].key)
      .toBe(groupActivityRows([make('second', 'completed')])[0].key);
  });
});
