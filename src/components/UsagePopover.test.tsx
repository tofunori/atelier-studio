import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { writeUsageSnapshot } from '../lib/usageSummary';
import { wsSend } from '../lib/wsBus';
import UsagePopover from './UsagePopover';

vi.mock('../lib/wsBus', () => ({ wsSend: vi.fn() }));
vi.mock('./shadcn/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverContent: ({ children }: { children: ReactNode }) => children,
}));

it('keeps usage received before first mount and updates while closed', () => {
  writeUsageSnapshot({ models: { 'cached-before-open': { turns: 1, output: 123 } } });
  const view = render(<UsagePopover open onClose={() => {}} />);
  expect(screen.getByText('cached-before-open')).toBeTruthy();
  expect(wsSend).not.toHaveBeenCalled();
  view.rerender(<UsagePopover open={false} onClose={() => {}} />);
  act(() => {
    const next = { models: { 'updated-while-closed': { turns: 2, output: 456 } } };
    writeUsageSnapshot(next);
    window.dispatchEvent(new CustomEvent('usage-data', { detail: next }));
  });
  view.rerender(<UsagePopover open onClose={() => {}} />);
  expect(screen.getByText('updated-while-closed')).toBeTruthy();
  expect(screen.queryByText('cached-before-open')).toBeNull();
  expect(wsSend).not.toHaveBeenCalled();
  view.unmount();
});

it('displays OpenCode token, turn and cost usage', () => {
  writeUsageSnapshot({
    providers: {
      opencode: {
        kind: 'tokens',
        ts: Date.now(),
        data: { input: 120_000, output: 8_000, turns: 5, cost: 0.42, period: 'today' },
      },
    },
    models: { 'opencode-go/gpt-6-luna': { turns: 5, output: 8_000 } },
  });
  const view = render(<UsagePopover open onClose={() => {}} />);
  expect(screen.getByText('OpenCode')).toBeTruthy();
  expect(screen.getByText(/128 k tok · 5 .* · \$0\.42/)).toBeTruthy();
  expect(screen.getByText('opencode-go/gpt-6-luna')).toBeTruthy();
  view.unmount();
});
