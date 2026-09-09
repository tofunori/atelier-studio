import { expect, test, type Locator } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`navigation menus share the composer contract — ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(`/#navbench-rich${theme === 'light' ? '-light' : ''}`);
    const font = await page.locator('.pnav').evaluate(el => getComputedStyle(el).fontFamily);
    const row = async (el: Locator) => {
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS('font-size', '12px');
      await expect(el).toHaveCSS('font-family', font);
      await expect(el).toHaveCSS('padding-top', '6px');
      expect((await el.boundingBox())!.height).toBe(32);
    };
    const thread = page.getByText('Rewrap figure 3 — albédo saisonnier', { exact: true });
    await thread.click({ button: 'right' });
    await row(page.getByRole('menuitem', { name: 'Renommer', exact: true }));
    await page.locator('[data-slot="dropdown-menu-content"]').screenshot({ path: info.outputPath('chat.png') });
    const sub = page.getByRole('menuitem', { name: 'Continuer avec…', exact: true });
    await row(sub);
    await sub.focus();
    await page.keyboard.press('ArrowRight');
    await row(page.getByRole('menuitem', { name: 'Codex', exact: true }));
    await page.locator('[data-slot="dropdown-menu-sub-content"]').screenshot({ path: info.outputPath('continue.png') });
    await page.keyboard.press('Escape');
    await expect(sub).toBeFocused();
    await page.getByRole('menuitem', { name: 'Déplacer vers…', exact: true }).click();
    await row(page.getByRole('menuitem', { name: 'manuscrit-ch1', exact: true }));
    await page.keyboard.press('Escape');

    const project = page.getByRole('button', { name: 'Actions du projet', exact: true });
    await project.click();
    await row(page.getByRole('menuitem', { name: 'Réglages du projet…', exact: true }));
    await page.getByRole('menu', { name: 'Actions du projet', exact: true }).screenshot({ path: info.outputPath('project.png') });
    await page.getByRole('menuitem', { name: 'Couleur et icône…', exact: true }).click();
    const panel = page.locator('.project-context-panel');
    await expect(panel).toBeVisible();
    await row(panel.getByRole('button', { name: 'Réglages du projet…', exact: true }));
    await panel.screenshot({ path: info.outputPath('project-panel.png') });
    await panel.getByRole('button', { name: 'Personnaliser', exact: true }).click();
    const back = panel.getByRole('button', { name: 'Actions du projet', exact: true });
    await row(back);
    await expect(back).toBeFocused();
    await expect(panel.locator('#project-icon-letters')).toBeVisible();
    await panel.screenshot({ path: info.outputPath('appearance.png') });
    await back.click();
    await expect(panel.getByRole('button', { name: 'Personnaliser', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
}
