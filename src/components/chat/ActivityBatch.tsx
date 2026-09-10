import { useState, type ReactNode } from 'react';
import type { ToolAction } from '../../lib/chat/turnViewModel';
import type { PluginCatalogEntry } from '../../lib/plugins';
import { ActivityDisclosure } from '../ui/ActivityDisclosure';
import { activityIconForAction, distinctToolActions, type ToolCat } from './toolPresentation';
import { AgentActivityGroup, agentsFromActions, isAgentActivityAction, type AgentDisplay } from './AgentActivity';
import type { ActivityAction } from './groupActivityRows';
import { EditLine } from './turnParts';

const labels: Record<ToolCat, string> = {
  command: 'Commandes', read: 'Fichiers consultés', image: 'Images consultées',
  skill: 'Outils chargés', edit: 'Fichiers modifiés', agent: 'Agents',
  integration: 'Intégrations', thinking: 'Phases de réflexion', search: 'Recherches',
  list: 'Dossiers', web: 'Recherches web', todo: 'Plan', permission: 'Autorisations',
  visualization: 'Figures', compaction: 'Contexte', interrupted: 'Interruptions', tool: 'Autres outils',
};

export function ActivityBatch(p: {
  actions: ToolAction[]; plugins?: PluginCatalogEntry[]; open: boolean; onToggle: () => void;
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
  onOpenAgent: (agent: AgentDisplay) => void; stamp?: ReactNode; hideThinking?: boolean; threadId?: string | null;
}) {
  const [opened, setOpened] = useState<Set<ToolCat>>(() => new Set());
  const categories = new Map<ToolCat, ActivityAction[]>();
  const actions = distinctToolActions(p.actions).filter(action => !p.hideThinking || action.name !== '__thinking-step');
  for (const action of actions) {
    const cat = isAgentActivityAction(action) ? 'agent' : activityIconForAction(action, p.plugins).cat;
    const entries = categories.get(cat) ?? [];
    entries.push(action); categories.set(cat, entries);
  }
  const count = actions.filter(action => action.name !== '__thinking-step').length;
  if (!actions.length) return null;
  return <ActivityDisclosure open={p.open} onToggle={p.onToggle} icon={{ cat: 'tool' }}
    label={`${count || actions.length} activité${(count || actions.length) > 1 ? 's' : ''}`}
    meta={p.stamp}>
    <div className="activity-batch-categories">
      {[...categories].map(([cat, entries]) => <ActivityDisclosure key={cat} open={opened.has(cat)}
        onToggle={() => setOpened(previous => { const next = new Set(previous); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; })}
        icon={{ cat }} label={`${labels[cat]} · ${cat === 'agent' && entries.every(isAgentActivityAction) ? agentsFromActions(entries).length : entries.length}`}>
        <div className="tool-group-list">
          {cat === 'agent' && entries.every(isAgentActivityAction)
            ? <AgentActivityGroup actions={entries} onOpenAgent={p.onOpenAgent} />
            : entries.map((action, index) => action.editEvent
              ? <EditLine key={action.name} event={action.editEvent} threadId={p.threadId ?? null} />
              : cat === 'thinking'
              ? <p className="activity-batch-thought" key={index}>{'detail' in action && action.detail || 'Phase de réflexion'}</p>
              : p.renderToolLine(action, index))}
        </div>
      </ActivityDisclosure>)}
    </div>
  </ActivityDisclosure>;
}
