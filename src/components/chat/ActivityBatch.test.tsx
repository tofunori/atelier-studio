import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderUi } from '../../test/render';
import { ActivityBatch, ActivityStep } from './ActivityBatch';
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
    expect(document.querySelector('.ui-activity-label.is-shimmering')).toBeTruthy();
  });

  it('étape active courte : rangées plates ET une seule ligne vivante', () => {
    renderUi(<ActivityStep {...props} actions={[command('a'), command('b')]}
      active liveLabel="Réflexion en cours…" liveSince={Date.now()} />);
    expect(document.querySelector('.ui-activity')).toBeNull();
    expect(document.querySelectorAll('.activity-action-list .tool-output')).toHaveLength(2);
    expect(document.querySelectorAll('.activity-cluster-live [role=status]')).toHaveLength(1);
  });

  it('affiche la durée cumulée des outils de l’étape', () => {
    const timed = (id: string, ms: number) => ({ ...command(id), durationMs: ms }) as ToolAction;
    renderUi(<ActivityStep {...props} actions={[timed('a', 1200), timed('b', 800), timed('c', 1000)]} />);
    expect(document.querySelector('.ui-activity-meta')?.textContent).toBe('3 s');
  });
});
