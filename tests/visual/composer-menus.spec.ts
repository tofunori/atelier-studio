import { expect, test, type Locator } from '@playwright/test';

// Real composer, isolated data: check computed styles across portal boundaries,
// and exercise the controls without sending messages or changing user settings.
for (const theme of ['dark', 'light']) {
  for (const width of [700, 1280]) {
    test(`composer menu consistency — ${theme}, ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/#chatbench-menus${theme === 'light' ? '-light' : ''}`);
      await expect(page.locator('.composer')).toBeVisible();
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('kb-sources', { detail: {
          sources: [
            { id: 'menu-file', kind: 'file', title: 'Manuscrit.md', chars: 12000, origin: '/fixture/Manuscrit.md', addedAt: '', updatedAt: '', collections: ['these'] },
            { id: 'menu-note', kind: 'note', title: 'Notes de lecture', chars: 1200, origin: null, addedAt: '', updatedAt: '', collections: [] },
          ], collections: [{ slug: 'these', title: 'Thèse' }],
        } }));
      });
      const font = await page.locator('.composer').evaluate(el => getComputedStyle(el).fontFamily);
      const main = async (el: Locator) => {
        await expect(el).toHaveCSS('font-size', '12px');
        await expect(el).toHaveCSS('font-family', font);
      };
      const panel = async (selector: string, name: string) => {
        const el = page.locator(selector);
        await expect(el).toBeVisible();
        await main(el);
        const box = (await el.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(901);
        if (width === 1280) await el.screenshot({ path: info.outputPath(`${name}.png`) });
        return el;
      };
      const close = async () => { await page.keyboard.press('Escape'); };
      const plus = page.getByRole('button', { name: 'Ajouter une image / un fichier', exact: true });
      await plus.click();
      await panel('.composer-add-menu', 'add');
      const addRow = page.getByRole('menuitem', { name: 'Ajouter une image / un fichier', exact: true });
      await main(addRow);
      expect((await addRow.boundingBox())!.height).toBe(32);
      await close();
      await expect(plus).toBeFocused();

      await page.getByRole('button', { name: 'Base de connaissances', exact: true }).click();
      const kb = await panel('.kb-pop', 'knowledge');
      await main(kb.locator('.kb-name').first());
      await expect(kb.locator('.kb-meta').first()).toHaveCSS('font-size', '11px');
      await kb.getByRole('textbox', { name: 'Rechercher…' }).fill('Manuscrit');
      await expect(kb.getByText('Notes de lecture', { exact: true })).toHaveCount(0);
      await kb.getByRole('textbox', { name: 'Rechercher…' }).fill('');
      const sourceRow = kb.locator('.kb-row').filter({ hasText: 'Manuscrit.md' });
      await sourceRow.hover();
      await sourceRow.getByRole('button', { name: 'Collections…', exact: true }).click();
      await panel('.composer-menu[data-slot="dropdown-menu-content"]', 'collections');
      await expect(page.getByRole('menuitemcheckbox', { name: 'Thèse' })).toHaveAttribute('aria-checked', 'true');
      await close();
      await expect(kb).toBeVisible();
      await kb.getByRole('button', { name: 'Ajouter une source' }).click();
      await expect(kb.getByRole('button', { name: 'Fichier / PDF…' })).toBeVisible();
      await main(kb.getByRole('button', { name: 'Fichier / PDF…' }));
      await kb.getByRole('button', { name: 'Note', exact: true }).click();
      await expect(kb.getByPlaceholder('Titre de la note')).toBeVisible();
      await main(kb.getByPlaceholder('Contenu…'));
      await close();

      const style = page.getByRole('button', { name: 'Consigne du fil', exact: true });
      await style.click();
      await panel('.composer-style-menu', 'style');
      await main(page.locator('.consigne-nom').first());
      await expect(page.locator('.consigne-desc').first()).toHaveCSS('font-size', '11px');
      await page.getByRole('menuitemcheckbox', { name: /^Concis / }).click();
      await page.getByRole('menuitemcheckbox', { name: /^Rigueur scientifique / }).click();
      await expect(page.getByRole('menuitemcheckbox', { name: /^Concis / })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('menuitemcheckbox', { name: /^Rigueur scientifique / })).toHaveAttribute('aria-checked', 'true');
      await close();
      await expect(style).toBeFocused();

      const permission = page.locator('.permission-select [role="combobox"]');
      await permission.click();
      await panel('.composer-permission-menu', 'permissions');
      await main(page.getByRole('option').first());
      expect((await page.getByRole('option').first().boundingBox())!.height).toBeCloseTo(32, 2);
      await close();
      await expect(permission).toBeFocused();

      await page.locator('.mp-btn.mp-model').click();
      await panel('.effort-menu', 'effort');
      await expect(page.locator('.ef-title b')).toHaveCSS('font-size', '13px');
      const slider = page.getByRole('slider');
      await slider.focus();
      await slider.press('ArrowLeft');
      const value = Number(await slider.getAttribute('aria-valuenow'));
      await slider.press('ArrowRight');
      await expect(slider).toHaveAttribute('aria-valuenow', String(value + 1));
      await slider.press('ArrowLeft');
      await expect(slider).toHaveAttribute('aria-valuenow', String(value));
      await page.locator('.ef-model-link').click();
      const models = await panel('.model-menu', 'models');
      // The transparent inner list relies on the popup's opaque surface.
      // A legacy wrapper rule must not let the transcript show through it.
      await expect(models).toHaveCSS('background-color', /^rgb\([\d, ]+\)$/);
      await expect(models).toHaveCSS('opacity', '1');
      await main(page.locator('.mp-row-main').first());
      await close();
      await expect(page.locator('.mp-btn.mp-model')).toBeFocused();

      await page.getByRole('button', { name: 'Fenêtre de contexte', exact: true }).click();
      const context = await panel('.ctx-pop', 'context');
      await expect(context.getByRole('heading')).toHaveCSS('font-size', '13px');
      await expect(context).toHaveCSS('opacity', '1');
      await close();
    });
  }
}

test('Codex effort, Fast and goal editor remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/#chatbench-menus-codex');
  await page.locator('.mp-btn.mp-model').click();
  await expect(page.locator('.effort-menu')).toBeVisible();
  const fast = page.locator('.ef-fast');
  await expect(fast).toHaveCSS('font-size', '11px');
  await fast.click();
  await expect(fast).toHaveAttribute('aria-pressed', 'true');
  const fastBox = (await fast.boundingBox())!;
  const headingBox = (await page.locator('.ef-heading').boundingBox())!;
  expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(fastBox.x);
  await page.locator('.ef-reset').click();
  await expect(fast).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajouter une image / un fichier', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Objectif (goal)…' }).click();
  const goal = page.getByPlaceholder('Objectif à poursuivre (goal Codex)');
  await expect(goal).toBeVisible();
  await expect(goal).toHaveCSS('font-size', '12px');
  await expect(page.locator('.goal-editor-title')).toHaveCSS('font-size', '13px');
  await goal.fill('Brouillon de test, sans lancement');
  await goal.press('Escape');
  await expect(goal).toHaveCount(0);
});
