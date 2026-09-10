import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderUi } from '../../test/render';
import { AssistantText } from './turns';
afterEach(cleanup);

it('keeps intermediate text visible but reveals its actions only when the turn ends', () => {
  const props = {
    event: { kind: 'text' as const, text: 'Je vérifie la formulation.', ts: 1000 },
    index: 2, timeFormat: '24h' as const, pinned: false, onFork: vi.fn(), onTogglePin: vi.fn(),
  };
  const view = renderUi(<AssistantText {...props} showActions={false} />);
  expect(screen.getByText('Je vérifie la formulation.')).toBeTruthy();
  expect(view.container.querySelector('.msg-actions')).toBeNull();
  view.rerender(<AssistantText {...props} showActions />);
  expect(view.container.querySelector('.msg-actions')).not.toBeNull();
  expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
});
