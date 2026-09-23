import { expect, test } from '@playwright/test';
import { codexComposite, codexObservedLive, claudeObservedLive } from '../../src/lib/chat/streamReplayFixtures';

test('terminal wins over a delayed running flag', async ({ page }) => {
  await page.goto('/#chatbench-replay-stale');
  await page.getByRole('combobox', { name: 'Étape du replay' }).selectOption(String(codexComposite.events.length));
  await expect(page.locator('.active-turn-tail [role="status"]')).toHaveCount(0);
  await expect(page.locator('.assistant-message .msg-actions')).toHaveCount(1);
});

for (const [route, fixture] of [
  ['replay', codexComposite], ['replaycodex', codexObservedLive], ['replayclaude', claudeObservedLive],
] as const) {
  test(`${fixture.id}: production Chat preserves activity, fold and reload`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 760 });
    await page.goto(`/#chatbench-${route}`);
    const step = page.getByRole('combobox', { name: 'Étape du replay' });
    const status = page.locator('.active-turn-tail [role="status"]');
    for (const point of fixture.checkpoints) {
      await step.selectOption(String(point.after));
      if (point.activeState === null) {
        await expect(status).toHaveCount(0);
      } else {
        await expect(status).toHaveCount(1);
        await expect(status).toBeVisible();
        if (point.statusKind === 'thinking') await expect(status).toContainText('Réflexion en cours');
        if (point.statusKind === 'action') await expect(status).not.toContainText('Réflexion en cours');
        if (point.statusKind === 'writing') await expect(status).toContainText('Rédaction');
        await expect(page.locator('.assistant-message .msg-actions')).toHaveCount(0);
      }
    }
    const fold = page.locator('.ui-activity.is-summary .ui-activity-trigger');
    await expect(fold).toHaveCount(1);
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.tool-output')).toHaveCount(0);
    await expect(page.locator('.assistant-message .msg-actions')).toHaveCount(1);
    await fold.click();
    await expect(page.locator('.tool-output').first()).toBeVisible();
    // A turn disclosure contains direct tool rows; no intermediary batch/category disclosure.
    await expect(page.locator('.ui-activity-detail .ui-activity')).toHaveCount(0);
    const tool = page.locator('.tool-output-head').first();
    await tool.click();
    await expect(tool).toHaveAttribute('aria-expanded', 'true');
    await fold.click();
    await page.getByRole('button', { name: 'Recharger l’historique' }).click();
    await expect(status).toHaveCount(0);
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.tool-output')).toHaveCount(0);
  });
}
