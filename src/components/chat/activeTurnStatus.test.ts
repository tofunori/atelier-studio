import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../lib/i18n';
import type { AgentEvent } from '../../lib/ws';
import { buildChatTurnViewModels } from '../../lib/chat/turnViewModel';
import { activeTurnStatus } from './activeTurnStatus';

const user: AgentEvent = { kind: 'user', text: 'Vérifie la figure.', ts: 1000 };
const thought: AgentEvent = { kind: 'thinking_live', text: 'Je vérifie.', ts: 2000 };
const tool = (id: string, status = 'inProgress', name = 'Read', more: Partial<Extract<AgentEvent, {kind:'tool_update'}>> = {}): AgentEvent =>
  ({ kind: 'tool_update', id, name, status, detail: 'results_en.tex', output: '', ...more });
function status(events: AgentEvent[]) {
  const turns = buildChatTurnViewModels(events, 1000);
  const turn = turns[turns.length - 1];
  return activeTurnStatus(turn, events);
}
beforeEach(() => setLanguage('fr'));

describe('activité unique du tour', () => {
  it('alterne réflexion, lecture, traitement et réflexion confirmée', () => {
    expect(status([user, thought]).kind).toBe('thinking');
    expect(status([user, thought, tool('r')]).label).toContain('Lit');
    expect(status([user, thought, tool('r'), tool('r', 'completed')])).toEqual({kind:'processing',label:'Traitement en cours…'});
    expect(status([user, thought, tool('r', 'completed'), {...thought,ts:3000}]).kind).toBe('thinking');
  });
  it('ne remplace pas un outil actif par une narration ou un raisonnement', () => {
    expect(status([user, tool('r'), {kind:'streaming',text:'Je continue.'}, thought]).kind).toBe('action');
  });
  it('ne clôt que les appels terminés dans un groupe parallèle', () => {
    const events=[user,tool('read'),tool('tests','running','Bash',{detail:'npm test'})];
    expect(status(events).label).toBe('2 actions en cours…');
    expect(status([...events,tool('read','completed')]).label).toBe('Exécute les tests');
    expect(status([...events,tool('read','completed'),tool('tests','completed','Bash')]).kind).toBe('processing');
  });
  it.each(['Read','Grep','list_files','Edit','Bash','web_search','view_image','image_generation','mcp__zotero__search','TodoWrite','context_compact','unknown_tool'])('suit la famille %s sans faux thinking', name => {
    expect(status([user, tool('x','in_progress',name)]).kind).toBe('action');
    expect(status([user, tool('x','completed',name)]).kind).toBe('processing');
  });
  it('reconnaît le chargement de skill', () => {
    expect(status([user, tool('x','running','Read',{detail:'skills/figures/SKILL.md'})]).label).toContain('Charge');
  });
  it('garde les agents actifs après la fin de spawn puis suit leurs fins individuelles', () => {
    const agent = (id: string, states: Record<string,{status:string}>) => tool(id,'completed','spawn_agent',{
      agentActivity:{tool:'spawn_agent',receiverThreadIds:Object.keys(states),agentsStates:states},
    });
    const events=[user,agent('spawn',{a:{status:'running'},b:{status:'running'}})];
    expect(status(events).label).toBe('2 agents en cours…');
    expect(status([...events,agent('update',{a:{status:'completed'}})]).label).toBe('Un agent travaille…');
    expect(status([...events,agent('update',{a:{status:'completed'},b:{status:'completed'}})]).kind).toBe('processing');
  });
  it.each(['inprogress','interrupted','failed'])('lit aussi le statut enfant %s quand la coordination est terminée', childState => {
    const event=tool('spawn','completed','spawn_agent',{agentActivity:{tool:'spawn_agent',receiverThreadIds:['a'],agentsStates:{a:{status:childState}}}});
    expect(status([user,event]).kind).toBe(childState==='inprogress'?'action':childState);
  });
  it('ne confond pas attente humaine et exécution', () => {
    expect(status([user,tool('x'),{kind:'permission',requestId:'p',toolName:'Bash',answered:null}]).kind).toBe('waiting');
  });
  it.each(['failed','interrupted','cancelled','denied'])('conserve le résultat %s sans annoncer une réflexion', state => {
    expect(status([user,tool('x',state)]).kind).toBe(state==='failed'?'failed':'interrupted');
    expect(status([user,tool('x',state),thought]).kind).toBe('thinking');
  });
  it('respecte le code de sortie même si le fournisseur annonce completed', () => {
    expect(status([user,tool('x','completed','Bash',{exitCode:2})]).kind).toBe('failed');
  });
  it('présente les statuts inconnus comme du traitement, sans certifier une exécution', () => {
    expect(status([user,tool('x','unrecognized')]).kind).toBe('processing');
  });
  it('ne récupère pas un agent du tour précédent', () => {
    const old=tool('a','completed','spawn_agent',{agentActivity:{tool:'spawn_agent',receiverThreadIds:['a'],agentsStates:{a:{status:'running'}}}});
    expect(status([user,old,{kind:'done',ok:true,result:''},{...user,ts:4000}]).kind).toBe('processing');
  });
  it('la rédaction succède aux outils terminés', () => {
    expect(status([user,tool('x','completed'),{kind:'streaming',text:'Voici le résultat.'}]).kind).toBe('writing');
  });
});
