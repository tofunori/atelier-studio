import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderUi } from '../../test/render';
import { ActivityBatch, ActivityStep, mergeSettledStep, segmentStep } from './ActivityBatch';
import { ToolOutputLine } from './toolPresentation';
import type { ToolAction } from '../../lib/chat/turnViewModel';
afterEach(cleanup);
const command = (id: string): ToolAction => ({ kind: 'tool_update', id, name: 'Bash', status: 'completed', output: id });
const props = { onOpenAgent: vi.fn(), renderToolLine: (action: ToolAction) => action.kind === 'tool_update' ? <ToolOutputLine event={action} compact /> : null };
describe('ActivityBatch', () => {
  it('shows actions directly in chronological order and reveals output in one click', () => {
    const view = renderUi(<ActivityBatch {...props} actions={[command('first'), { kind: 'tool', name: '__thinking-step', detail: 'Vérification utile' }, command('second')]} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByText(/activité|Commandes ·|Phases de réflexion/)).toBeNull();
    expect(view.container.textContent!.indexOf('Vérification utile')).toBeGreaterThan(view.container.textContent!.indexOf('Commande'));
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('first')).toBeTruthy();
    view.rerender(<ActivityBatch {...props} actions={[command('first'), { kind: 'tool', name: '__thinking-step', detail: 'Vérification utile' }, command('second'), command('third')]} />);
    expect(screen.getAllByRole('button')[0].getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('first')).toBeTruthy();
  });
  it('omits empty reasoning and honors hidden reasoning', () => {
    const actions: ToolAction[] = [{ kind: 'tool', name: '__thinking-step', detail: '   ' }, { kind: 'tool', name: '__thinking-step', detail: 'Résumé utile' }];
    const view = renderUi(<ActivityBatch {...props} thinkingCollapsed actions={actions} />);
    expect(screen.queryByText('Phase de réflexion')).toBeNull();
    expect(screen.getByText('Résumé utile')).toBeTruthy();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText('Résumé utile')).toHaveLength(2);
    view.rerender(<ActivityBatch {...props} thinkingCollapsed actions={actions} hideThinking />);
    expect(screen.queryByText('Résumé utile')).toBeNull();
  });
  it('keeps failed output accessible without opening it automatically', () => {
    const failed = { ...command('failure'), status: 'failed', exitCode: 1 } as ToolAction;
    renderUi(<ActivityBatch {...props} actions={[failed]} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('exit 1')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.getByText('failure')).toBeTruthy();
  });
});

const errorLeaf = (message: string): ToolAction => ({
  kind: 'tool', name: '__error', detail: message,
  errorEvent: { kind: 'error', message } as never,
} as ToolAction);

describe('ActivityStep', () => {
  it('replie une étape terminée de 3 outils en une seule ligne, dépliée au clic', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b'), command('c')]} />);
    const trigger = document.querySelector('.ui-activity-trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.tool-output')).toHaveLength(0);
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('.tool-output')).toHaveLength(3);
  });

  it('laisse une étape de deux outils à plat, sans pli', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b')]} />);
    expect(document.querySelector('.ui-activity')).toBeNull();
    expect(document.querySelectorAll('.activity-action-list .tool-output')).toHaveLength(2);
  });

  it('garde la feuille d’erreur visible même repliée', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b'), command('c'), errorLeaf('Échec net')]} />);
    const alert = document.querySelector('[role=alert]') as HTMLElement;
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Échec net');
    expect(alert.closest('.ui-activity-detail')).toBeNull();
  });

  it('étape active : synthèse + une seule ligne vivante, sans rangées terminées empilées', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b'), command('c')]}
      active liveLabel="Réflexion en cours…" liveSince={Date.now()} />);
    expect(document.querySelector('.ui-activity')).toBeTruthy();
    expect(document.querySelectorAll('.tool-output')).toHaveLength(0);
    const live = document.querySelectorAll('.activity-cluster-live [role=status]');
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toContain('Réflexion en cours');
    // Le reflet vit sur le STATUT fusionné, jamais sur la synthèse : sinon la
    // phrase entière clignoterait (v2, 2026-09-10).
    expect(live[0]).toHaveClass('turn-working-shimmer');
    expect(document.querySelector('.ui-activity-label.is-shimmering')).toBeNull();
  });

  it('étape active de deux outils : une seule ligne fusionnée, rangées au clic', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b')]}
      active liveLabel="Réflexion en cours…" liveSince={Date.now()} />);
    // Même sous le seuil de repli, la série ACTIVE tient sur une ligne : c'est
    // elle qui porte le statut, donc pas de rangées empilées au-dessus.
    const trigger = document.querySelector('.ui-activity-trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(document.querySelectorAll('.tool-output')).toHaveLength(0);
    expect(document.querySelectorAll('.activity-cluster-live [role=status]')).toHaveLength(1);
    fireEvent.click(trigger);
    expect(document.querySelectorAll('.activity-action-list .tool-output')).toHaveLength(2);
    expect(document.querySelectorAll('.activity-cluster-live [role=status]')).toHaveLength(1);
  });

  it('affiche la durée cumulée des outils de l’étape', () => {
    const timed = (id: string, ms: number) => ({ ...command(id), durationMs: ms }) as ToolAction;
    renderUi(<ActivityStep {...props} actions={[timed('a', 1200), timed('b', 800), timed('c', 1000)]} />);
    expect(document.querySelector('.ui-activity-meta')?.textContent).toBe('3 s');
  });
});

const read = (id: string, file: string): ToolAction => ({
  kind: 'tool_update', id, name: 'Read', status: 'completed', output: id,
  detail: file, input: { file_path: file },
} as ToolAction);
const thought = (detail: string): ToolAction => ({ kind: 'tool', name: '__thinking-step', detail } as ToolAction);
const agent = (id: string): ToolAction => ({
  kind: 'tool_update', id, name: 'Task', status: 'completed', output: id,
  agentActivity: { tool: 'Task', receiverThreadIds: [id], agentsStates: { [id]: { status: 'completed' } } },
} as ToolAction);

// Sans découpage par catégorie, un tour de trente outils sans narration ne
// faisait qu'UNE grappe muette (spec v2, Thierry 2026-09-10).
describe('mergeSettledStep', () => {
  it("une étape dépassée regroupe toutes ses séries d'outils en une seule grappe, les feuilles plates après", () => {
    const tool = (id: string, name: string, input: Record<string, unknown>) => ({ kind: 'tool_update', id, name, input, output: '', status: 'completed' } as any);
    const thought = { kind: 'tool', name: '__thinking-step', detail: 'je réfléchis' } as any;
    const segments = segmentStep([tool('1', 'Bash', { command: 'python3 run.py' }), tool('2', 'Read', { file_path: 'a.md' }), thought, tool('3', 'Bash', { command: 'python3 check.py' })]);
    expect(segments.map((s) => s.kind)).toEqual(['cluster', 'cluster', 'flat', 'cluster']);
    const merged = mergeSettledStep(segments);
    expect(merged.map((s) => `${s.kind}×${s.actions.length}`)).toEqual(['cluster×3', 'flat×1']);
  });
});

describe('segmentStep', () => {
  it('regroupe les outils consécutifs de même catégorie et coupe au changement', () => {
    const segments = segmentStep([
      command('a'), command('b'), read('r1', 'src/a.ts'), read('r2', 'src/b.ts'), command('c'),
    ] as never);
    expect(segments.map((segment) => segment.kind)).toEqual(['cluster', 'cluster', 'cluster']);
    expect(segments.map((segment) => (segment.kind === 'cluster' ? segment.part : 'flat')))
      .toEqual(['commands', 'exploration', 'commands']);
    expect(segments.map((segment) => segment.actions.length)).toEqual([2, 2, 1]);
  });

  it('coupe la série sur une pensée, une erreur ou un sous-agent', () => {
    const segments = segmentStep([
      command('a'), thought('Je vérifie'), command('b'), errorLeaf('Échec net'), command('c'), agent('sub-1'),
    ] as never);
    expect(segments.map((segment) => segment.kind))
      .toEqual(['cluster', 'flat', 'cluster', 'flat', 'cluster', 'flat']);
    expect(segments.map((segment) => segment.actions.length)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('garde les non-outils consécutifs dans une seule série plate, dans l’ordre', () => {
    const segments = segmentStep([thought('D’abord'), errorLeaf('Puis'), agent('sub-1')] as never);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('flat');
    expect(segments[0].actions.map((action) => action.name)).toEqual(['__thinking-step', '__error', 'Task']);
  });

  it('n’émet aucune série sans action', () => {
    expect(segmentStep([])).toEqual([]);
  });
});

describe('ActivityStep — ligne vivante fusionnée', () => {
  const timed = (id: string, ms: number) => ({ ...command(id), durationMs: ms }) as ToolAction;

  it('fusionne « synthèse · statut » sur une ligne, chrono en méta', () => {
    const view = renderUi(<ActivityStep {...props} actions={[timed('a', 1200), timed('b', 800), timed('c', 1000)]}
      active liveLabel="Réflexion en cours…" liveSince={Date.now() - 3000} />);
    const line = document.querySelector('.activity-cluster.is-active .ui-activity') as HTMLElement;
    expect(line).toHaveClass('is-running');
    const label = line.querySelector('.ui-activity-label') as HTMLElement;
    const summary = label.querySelector('.activity-cluster-summary') as HTMLElement;
    expect(summary.textContent?.trim()).toBeTruthy();
    expect(summary.textContent).not.toContain('Réflexion en cours');
    expect(label.querySelector('.activity-cluster-sep')?.textContent).toContain('·');
    const status = label.querySelector('.active-turn-tail.activity-cluster-live [role=status]') as HTMLElement;
    expect(status.textContent).toBe('Réflexion en cours…');
    // Méta = chrono du tour tant que ça travaille, PAS la durée cumulée.
    expect(line.querySelector('.ui-activity-meta .turn-activity-elapsed')).toBeTruthy();
    expect(line.querySelector('.ui-activity-meta')?.textContent).not.toBe('3 s');

    // Une fois l'étape posée, la MÊME ligne redevient une synthèse simple.
    view.rerender(<ActivityStep {...props} actions={[timed('a', 1200), timed('b', 800), timed('c', 1000)]} />);
    expect(document.querySelector('.activity-cluster .ui-activity')).toBe(line);
    expect(line).toHaveClass('is-completed');
    expect(document.querySelectorAll('[role=status]')).toHaveLength(0);
    expect(line.querySelector('.ui-activity-meta')?.textContent).toBe('3 s');
    expect(line.querySelector('.ui-activity-label')?.textContent).toBe(summary.textContent);
  });

  it('sépare la ligne vivante quand la dernière série n’est pas une grappe', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b'), command('c'), thought('Je conclus')]}
      active liveLabel="Réflexion en cours…" liveSince={Date.now()} />);
    const tail = document.querySelector('.working-stack.active-turn-tail.activity-cluster-live') as HTMLElement;
    expect(tail).toBeTruthy();
    expect(tail.querySelector('.turn-tail-row')).toBeTruthy();
    // La grappe posée qui précède garde sa synthèse, sans statut vivant.
    const cluster = document.querySelector('.activity-cluster .ui-activity') as HTMLElement;
    expect(cluster).toHaveClass('is-completed');
    expect(cluster.querySelector('[role=status]')).toBeNull();
    expect(document.querySelectorAll('[role=status]')).toHaveLength(1);
  });

  it('étape sans outil : la ligne vivante seule', () => {
    renderUi(<ActivityStep {...props} actions={[]} active liveLabel="Réflexion en cours…" liveSince={Date.now()} />);
    expect(document.querySelector('.ui-activity')).toBeNull();
    expect(document.querySelectorAll('.working-stack.active-turn-tail.activity-cluster-live [role=status]')).toHaveLength(1);
  });

  it('aucune ligne vivante quand le tour est posé', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b'), command('c')]} />);
    expect(document.querySelectorAll('[role=status]')).toHaveLength(0);
    expect(document.querySelector('.activity-cluster-live')).toBeNull();
  });
});
