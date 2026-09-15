import {expect, it} from 'vitest';
import {groupAgentRows} from './groupAgentRows';
import {agentsFromActions, type AgentToolAction} from './AgentActivity';
import {buildChatTurnViewModels, projectChatTimeline} from '../../lib/chat/turnViewModel';
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
