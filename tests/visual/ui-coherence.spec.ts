import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`text and icon controls share the UI scale — ${theme}`, async ({ page }) => {
    await page.goto(`/#uibench${theme === 'light' ? '-light' : ''}`);
    const button = page.getByRole('button', { name: 'Annuler', exact: true }).first();
    const icon = page.getByRole('button', { name: 'Réglages (moyen)', exact: true });
    await expect(button).toBeVisible();
    for (const size of [12, 15, 18]) {
      await page.evaluate(size => {
        document.documentElement.style.fontSize = `${size}px`;
        document.documentElement.style.setProperty('--ui-base-size', `${size}px`);
      }, size);
      expect((await button.boundingBox())!.height).toBeCloseTo(size * 2, 1);
      expect((await icon.boundingBox())!.height).toBeCloseTo(size * 2, 1);
    }
  });
}

test('submenu motion follows its parent and reduced motion disables surface spinners', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#navbench-rich');
  await page.getByText('Rewrap figure 3 — albédo saisonnier', { exact: true }).click({ button: 'right' });
  const trigger = page.getByRole('menuitem', { name: 'Continuer avec…', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowRight');
  const submenu = page.locator('[data-slot="dropdown-menu-sub-content"]');
  await expect(submenu).toBeVisible();
  const motion = await page.locator('[data-slot="dropdown-menu-content"]').evaluate(el => getComputedStyle(el).transitionDuration);
  await expect(submenu).toHaveCSS('transition-duration', motion);
  expect(parseFloat(motion)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(submenu).toHaveCSS('transition-duration', '0s, 0s');
  await expect(submenu).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const animations = await page.evaluate(() => {
    const sample = document.createElement('div');
    sample.innerHTML = '<button class="calculs-refresh is-loading"><svg></svg></button><span class="kbs-spin"></span>';
    document.body.append(sample);
    const names = [...sample.querySelectorAll('svg,.kbs-spin')].map(el => getComputedStyle(el).animationName);
    sample.remove();
    return names;
  });
  expect(animations).toEqual(['none', 'none']);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
