import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderUi } from '../../test/render';
import { ActivityBatch } from './ActivityBatch';
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
