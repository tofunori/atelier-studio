import { expect, test } from '@playwright/test';

test('settings selection stays compact and usable without decorative arrows', async ({ page }) => {
  await page.goto('/#setbench-opencode');
  await page.getByRole('button', { name: 'Modèles', exact: true }).click();
  const trigger = page.getByRole('combobox', { name: 'Provider par défaut', exact: true });
  await expect(trigger).toBeVisible();
  expect(await trigger.locator('svg').count()).toBe(0);
  const box = await trigger.boundingBox();
  expect(box!.width).toBeLessThan(100);
  expect(box!.height).toBeLessThan(30);
  await trigger.click();
  const choice = page.getByRole('option', { name: 'Codex', exact: true });
  await expect(choice).toBeVisible();
  expect((await choice.boundingBox())!.height).toBeLessThan(30);
  await choice.click();
  await expect(trigger).toContainText('Codex');
  await expect(trigger).toBeFocused();
  await trigger.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await trigger.press('Escape');
  await expect(page.getByRole('listbox')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
