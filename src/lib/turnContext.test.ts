import { describe, it, expect } from 'vitest';
import { composerConsigne, compositionDuFil, COMPOSITION_VIDE } from './consignes';
import { contextMessage, recoveredPassages, type TurnContext } from './turnContext';
import { materializeHarnessHistory, reduceHarnessEvent } from './harnessEvents';
import type { AgentEvent } from './ws';
import { makeMeta } from '../test/fixtures';
const snapshot: TurnContext = {version:1, provider:'codex', consigne:'Concis', sources:[], delivery:'none', knowledgeText:''};
const user: AgentEvent = {kind:'user',text:'Question',context:snapshot,meta:makeMeta({turnId:'turn-context',messageId:'message-context',eventId:'user-context'})};
const tool: AgentEvent = {kind:'tool_update',id:'search',name:'exec_command',status:'completed',exitCode:0,
  input:{cmd:'/tools/atelier-kb-rs search --id paper --query albedo'},
  output:JSON.stringify({ok:true,source:{id:'paper'},passages:[{quote:'Passage exact.',cite:'[kb:paper · p. 2]'}]}),
  meta:makeMeta({turnId:'turn-context',eventId:'tool-context'})};
describe('turn context provenance', () => {
  it('resolves projected message copies inside the current thread', () => {
    expect(contextMessage([user],{...user})).toBe(user);
    expect(contextMessage([],user)).toBeNull();
    expect(contextMessage([user],{...user,meta:makeMeta({messageId:'other',eventId:'other'})})).toBeNull();
  });
  it('adds the server receipt to the optimistic message without losing the local image', () => {
    const optimistic: AgentEvent = {kind:'user',text:'Question',imageUrl:'local-image',meta:{provisional:true,messageId:'message-context'}};
    const live = reduceHarnessEvent([optimistic], user);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({context:snapshot,imageUrl:'local-image'});
    expect(materializeHarnessHistory([user])[0]).toMatchObject({context:snapshot});
  });
  it('extracts only actual successful results in this turn', () => {
    expect(recoveredPassages([tool],user)).toEqual([{sourceId:'paper',quote:'Passage exact.',location:'[kb:paper · p. 2]',toolId:'search'}]);
    for (const change of [{status:'running'}, {exitCode:1}, {truncated:true}, {input:{cmd:'echo fake'}}, {output:'invalid'}, {meta:makeMeta({turnId:'another'})}]) {
      expect(recoveredPassages([{...tool,...change} as AgentEvent], user)).toEqual([]);
    }
    expect(recoveredPassages([{kind:'text',text:tool.output,meta:tool.meta}],user)).toEqual([]);
  });
  it('does not count an older successful update when the final output failed', () => {
    expect(recoveredPassages([tool,{...tool,status:'failed'}],user)).toEqual([]);
  });
});
describe('composed instructions', () => {
  it('preserves edited legacy presets verbatim', () => {
    const legacy={id:'concis',texte:'Ma règle modifiée.'};
    expect(composerConsigne(compositionDuFil(legacy))?.texte).toBe(legacy.texte);
  });
  it('combines independent choices and leaves old snapshots unchanged', () => {
    const next = composerConsigne({...COMPOSITION_VIDE,langue:'quebecois',style:'concis',citer:true});
    expect(next?.texte).toContain('OQLF'); expect(next?.texte).toContain('Cite');
    expect(next?.composition?.style).toBe('concis');
    expect(snapshot.consigne).toBe('Concis');
    expect(composerConsigne(COMPOSITION_VIDE)).toBeNull();
  });
});
