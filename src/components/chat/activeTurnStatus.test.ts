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
  const codexUser: AgentEvent = { ...user, meta: { schemaVersion: 1, eventId: 'user', provider: 'codex', threadId: 't', turnId: 'a', sequence: 1, ts: 1000, durable: true, origin: 'atelier' } };
  const supervision = (state: 'running' | 'completed' | 'failed', sequence = 3): AgentEvent => ({
    kind: 'activity', id: 'codex-supervision', title: 'Ancien statut technique', status: state,
    meta: { ...codexUser.meta!, eventId: `probe-${sequence}`, sequence, ts: sequence * 1000 },
  });
  it('ne présente pas une attente Codex comme une réflexion attestée', () => {
    expect(status([codexUser])).toEqual({ kind: 'processing', label: 'En attente du modèle…' });
    expect(status([codexUser, supervision('running')])).toEqual({ kind: 'processing', label: 'En attente du modèle…' });
    expect(status([codexUser, supervision('failed')]).label).toContain('Connexion à vérifier');
    expect(status([codexUser, { kind: 'tool', name: '__thinking' }])).toEqual({ kind: 'thinking', label: 'Réflexion en cours…' });
  });
  it('priorise la compaction, les outils et les demandes humaines sur la surveillance', () => {
    for (const name of ['__compacted', 'web_search', 'Read']) {
      const action = tool('action', 'inProgress', name);
      expect(status([codexUser, action, supervision('running')])).toEqual(status([codexUser, action]));
    }
    expect(status([codexUser, supervision('running'), { kind: 'permission', requestId: 'p', toolName: 'Bash', answered: null }]).kind).toBe('waiting');
  });
  it('la reprise et une sonde périmée ne remplacent pas la rédaction', () => {
    const writing: AgentEvent = { kind: 'streaming', text: 'La réponse', meta: { ...codexUser.meta!, eventId: 'writing', sequence: 5, ts: 5000 } };
    expect(status([codexUser, supervision('completed', 6), writing]).kind).toBe('writing');
    expect(status([codexUser, supervision('running', 3), writing]).kind).toBe('writing');
    expect(status([codexUser, supervision('running'), { kind: 'done', ok: true, result: '' }]).kind).toBe('completed');
  });
  it('présente uniquement le lifecycle dérivé, même si le tableau fourni diverge', () => {
    const completed = tool('r', 'completed');
    const events = [user, completed];
    const turn = buildChatTurnViewModels(events, 1000)[0];
    // `events` is kept in the API for compatibility; the active status must
    // not rescan a stale snapshot and announce a running call.
    expect(activeTurnStatus(turn, [user, tool('r', 'running')])).toEqual({
      kind: 'thinking', label: 'Réflexion en cours…',
    });
  });

  it('reprend la réflexion après la lecture sans attendre un événement de raisonnement', () => {
    expect(status([user, thought]).kind).toBe('thinking');
    expect(status([user, thought, tool('r')]).label).toContain('Lit');
    expect(status([user, thought, tool('r'), tool('r', 'completed')])).toEqual({kind:'thinking',label:'Réflexion en cours…'});
    expect(status([user, thought, tool('r', 'completed'), {...thought,ts:3000}]).kind).toBe('thinking');
  });
  it('ne remplace pas un outil actif par une narration ou un raisonnement', () => {
    expect(status([user, tool('r'), {kind:'streaming',text:'Je continue.'}, thought]).kind).toBe('action');
  });
  it('ne clôt que les appels terminés dans un groupe parallèle', () => {
    const events=[user,tool('read'),tool('tests','running','Bash',{detail:'npm test'})];
    expect(status(events).label).toBe('2 actions en cours…');
    expect(status([...events,tool('read','completed')]).label).toBe('Exécute les tests');
    expect(status([...events,tool('read','completed'),tool('tests','completed','Bash')]).kind).toBe('thinking');
  });
  it.each(['Read','Grep','list_files','Edit','Bash','web_search','view_image','image_generation','mcp__zotero__search','TodoWrite','context_compact','unknown_tool'])('priorise la famille %s puis reprend la réflexion', name => {
    expect(status([user, tool('x','in_progress',name)]).kind).toBe('action');
    expect(status([user, tool('x','completed',name)]).kind).toBe('thinking');
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
    expect(status([...events,agent('update',{a:{status:'completed'},b:{status:'completed'}})]).kind).toBe('thinking');
  });
  it.each(['inprogress','interrupted','failed'])('garde un tour actif après le statut enfant %s', childState => {
    const event=tool('spawn','completed','spawn_agent',{agentActivity:{tool:'spawn_agent',receiverThreadIds:['a'],agentsStates:{a:{status:childState}}}});
    expect(status([user,event]).kind).toBe(childState==='inprogress'?'action':'thinking');
  });
  it('ne confond pas attente humaine et exécution', () => {
    expect(status([user,tool('x'),{kind:'permission',requestId:'p',toolName:'Bash',answered:null}]).kind).toBe('waiting');
  });
  it.each(['failed','interrupted','cancelled','denied'])('conserve le résultat %s comme détail sans terminer le tour', state => {
    expect(status([user,tool('x',state)]).kind).toBe('thinking');
    expect(status([user,tool('x',state),thought]).kind).toBe('thinking');
  });
  it('respecte le code de sortie même si le fournisseur annonce completed', () => {
    expect(status([user,tool('x','completed','Bash',{exitCode:2})]).kind).toBe('thinking');
  });
  it('présente les statuts inconnus comme du traitement, sans certifier une exécution', () => {
    expect(status([user,tool('x','unrecognized')]).kind).toBe('processing');
  });
  it('mappe les terminaux du tour sans requalifier un outil échoué', () => {
    expect(status([user, tool('x', 'failed'), { kind: 'done', ok: true, result: '' }])).toEqual({
      kind: 'completed', label: 'Tour terminé',
    });
    expect(status([user, tool('x', 'failed'), { kind: 'done', ok: false, result: 'échec du tour' }])).toEqual({
      kind: 'failed', label: 'Action échouée',
    });
    expect(status([user, tool('x', 'failed'), { kind: 'error', message: 'interrupted by user' }])).toEqual({
      kind: 'interrupted', label: 'Action interrompue',
    });
  });
  it('ne récupère pas un agent du tour précédent', () => {
    const old=tool('a','completed','spawn_agent',{agentActivity:{tool:'spawn_agent',receiverThreadIds:['a'],agentsStates:{a:{status:'running'}}}});
    expect(status([user,old,{kind:'done',ok:true,result:''},{...user,ts:4000}]).kind).toBe('thinking');
  });
  it('la rédaction succède aux outils terminés', () => {
    expect(status([user,tool('x','completed'),{kind:'streaming',text:'Voici le résultat.'}]).kind).toBe('writing');
  });
});
