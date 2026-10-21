import { expect, test } from '@playwright/test';

test('settings selection stays compact and usable with a single disclosure chevron', async ({ page }) => {
  await page.goto('/#setbench-opencode');
  await page.getByRole('button', { name: 'Modèles', exact: true }).click();
  const trigger = page.getByRole('combobox', { name: 'Provider par défaut', exact: true });
  await expect(trigger).toBeVisible();
  // un seul chevron d'ouverture (finition lot 3) : l'affordance, pas un décor
  expect(await trigger.locator('svg').count()).toBe(1);
  const box = await trigger.boundingBox();
  expect(box!.width).toBeLessThan(100);
  expect(box!.height).toBeLessThan(30);
  await trigger.click();
  const choice = page.getByRole('option', { name: 'Codex', exact: true });
  await expect(choice).toBeVisible();
  // rangée du contrat commun des menus (--menu-row-height, finition lot 3)
  expect((await choice.boundingBox())!.height).toBeLessThanOrEqual(32);
  await choice.click();
  await expect(trigger).toContainText('Codex');
  await expect(trigger).toBeFocused();
  await trigger.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
