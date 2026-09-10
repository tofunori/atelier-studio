import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderUi } from '../../test/render';
import { ActivityBatch } from './ActivityBatch';
import type { ToolAction } from '../../lib/chat/turnViewModel';
afterEach(cleanup);
const command = (id: string): ToolAction => ({ kind: 'tool_update', id, name: 'Bash', status: 'completed', output: '' });
describe('ActivityBatch', () => {
  it('preserves an open category when another action arrives', () => {
    const props = { open: true, onToggle: vi.fn(), onOpenAgent: vi.fn(), renderToolLine: (action: ToolAction) => <span key={'id' in action ? action.id : action.name}>{'id' in action ? action.id : action.name}</span> };
    const view = renderUi(<ActivityBatch {...props} actions={[command('first')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Commandes · 1' }));
    expect(screen.getByText('first')).toBeTruthy();
    view.rerender(<ActivityBatch {...props} actions={[command('first'), command('second')]} />);
    expect(screen.getByRole('button', { name: 'Commandes · 2' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('second')).toBeTruthy();
  });
  it('honors hidden reasoning and does not label live reasoning completed', () => {
    const props = { open: true, onToggle: vi.fn(), onOpenAgent: vi.fn(), renderToolLine: () => null };
    const actions: ToolAction[] = [{ kind: 'tool', name: '__thinking-step', detail: 'Résumé de réflexion' }];
    const view = renderUi(<ActivityBatch {...props} actions={actions} />);
    expect(screen.queryByText(/terminée/)).toBeNull();
    view.rerender(<ActivityBatch {...props} actions={actions} hideThinking />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
