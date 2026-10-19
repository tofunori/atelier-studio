import {describe, expect, it} from 'vitest';
import {groupAgentRows} from './groupAgentRows';
import {agentsFromActions, type AgentToolAction} from './AgentActivity';
import {buildChatTurnViewModels, projectChatTimeline} from '../../lib/chat/turnViewModel';
import {groupActivityRows} from './groupActivityRows';
import type {AgentEvent} from '../../lib/ws';
const turns = [{key:'turn',startIndex:0,endIndex:10}];
const agent = (id: string, status: string, index: number) => ({type:'event' as const,key:`e${index}`,index,event:{
  kind:'tool_update' as const,id,name:'agent:activity',status:'completed' as const,output:'',ts:index,
  agentActivity:{tool:'activity',receiverThreadIds:['child'],agentsStates:{child:{status}},agentThreadId:'child',agentPath:'/root/research'},
}});
it('keeps one block across narration and tools, updated at its original key',()=>{
  const start=agent('spawn','running',1), end=agent('done','completed',5);
  const narration={type:'event' as const,key:'prose',index:2,event:{kind:'text' as const,text:'Checking'}};
  const command={type:'actions' as const,key:'cmd',index:3,actions:[{kind:'tool' as const,name:'Bash'}]};
  const before=groupAgentRows([start],turns);
  const after=groupAgentRows([start,narration,command,end],turns);
  expect(after.map(r=>r.type)).toEqual(['agents','event','actions']);
  expect(after[0].key).toBe(before[0].key);
  if(after[0].type!=='agents')throw Error('agents missing');
  expect(agentsFromActions(after[0].actions)[0].status).toBe('done');
});
it('does not merge the same child across separate turns',()=>{
  const rows=groupAgentRows([agent('first','completed',1),agent('followup','running',11)],
    [...turns,{key:'next',startIndex:10,endIndex:20}]);
  expect(rows).toHaveLength(2);expect(rows[0].key).not.toBe(rows[1].key);
});
it('preserves tool ordering when extracting agents from a mixed batch',()=>{
  const a=agent('s','running',1).event;
  const rows=groupAgentRows([{type:'actions',key:'mixed',index:1,actions:[{kind:'tool',name:'before'},a,{kind:'tool',name:'after'}]}],turns);
  expect(rows.map(r=>r.type)).toEqual(['actions','agents','actions']);
});
it('does not downgrade a newer terminal observation with an older tool snapshot',()=>{
  const completed=agent('done','completed',8).event as AgentToolAction;
  const stale=agent('spawn','running',2).event as AgentToolAction;
  expect(agentsFromActions([completed,stale])[0].status).toBe('done');
});
it('keeps the completed agent available outside a closed execution fold',()=>{
  const events=[{kind:'user' as const,text:'Research'},agent('spawn','running',1).event,
    {kind:'text' as const,text:'Checking sources'},agent('done','completed',3).event,
    {kind:'done' as const,ok:true,result:'Summary'}];
  const models=buildChatTurnViewModels(events,null);
  const projected=projectChatTimeline(events,models,new Set());
  const rows=groupAgentRows(projected,models);
  const groups=rows.filter(r=>r.type==='agents');
  expect(groups).toHaveLength(1);
  expect(agentsFromActions(groups[0].actions)[0].status).toBe('done');
});
describe('a steer message inside the running turn', () => {
  let n = 0;
  const meta = () => ({eventId: `ev${n++}`, turnId: 'T', provider: 'claude'});
  const live = (id: string, status: string) => ({...agent(id, status, n).event, meta: meta()});
  const shape = (events: AgentEvent[], active: boolean) => {
    const models = buildChatTurnViewModels(events, active ? Date.now() : null);
    return groupAgentRows(groupActivityRows(projectChatTimeline(events, models, new Set())), models, events)
      .filter(r => r.type === 'agents' || r.type === 'event')
      .map(r => r.type === 'event' ? (r.event.kind === 'user' ? `user:${r.event.text}` : r.event.kind) : 'agents');
  };
  it('moves the cluster below the steer when an agent launches after it', () => {
    const events = [{kind: 'user', text: 'oui', meta: meta()}, live('a', 'running'),
      {kind: 'user', text: 'steer', meta: meta()}, {kind: 'text', text: 'Nouveau lecteur', meta: meta()},
      live('b', 'running'), live('a', 'running'), {kind: 'text', text: 'Lancé', meta: meta()}] as AgentEvent[];
    expect(shape(events, true)).toEqual(['user:oui', 'user:steer', 'text', 'agents', 'text']);
  });
  it('follows the steer when only an earlier agent keeps reporting', () => {
    const events = [{kind: 'user', text: 'oui', meta: meta()}, live('a', 'running'),
      {kind: 'user', text: 'steer', meta: meta()}, {kind: 'text', text: 'ok', meta: meta()}, live('a', 'running')] as AgentEvent[];
    expect(shape(events, true)).toEqual(['user:oui', 'user:steer', 'agents', 'text']);
  });
  it('stays above a steer when every agent finished before it', () => {
    const events = [{kind: 'user', text: 'oui', meta: meta()}, live('c', 'completed'),
      {kind: 'user', text: 'steer', meta: meta()}, {kind: 'text', text: 'ok', meta: meta()}] as AgentEvent[];
    expect(shape(events, true)).toEqual(['user:oui', 'agents', 'user:steer', 'text']);
  });
  it('keeps the steer and the cluster below it once the turn is folded', () => {
    const events = [{kind: 'user', text: 'oui', meta: meta()}, live('a', 'running'),
      {kind: 'user', text: 'steer', meta: meta()}, live('b', 'running'), live('a', 'completed'), live('b', 'completed'),
      {kind: 'text', text: 'x'.repeat(300), meta: meta()}, {kind: 'done', ok: true, meta: meta()}] as AgentEvent[];
    expect(shape(events, false)).toEqual(['user:oui', 'user:steer', 'agents', 'text', 'done']);
  });
});
