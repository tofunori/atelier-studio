import { expect, test, type Page } from '@playwright/test';

// Composeur étroit (2026-11-12) : chat réduit à 30 % de la fenêtre, les
// contrôles de la barre se chevauchaient (effort, chrono, micro). La barre
// replie désormais les contrôles secondaires dans un plateau « … ».
// Contrat : à toute largeur, aucun contrôle de la barre n'en chevauche un
// autre ni ne déborde, et tout ce qui quitte la barre reste joignable.

/** Micro visible comme dans l'app : la dictée n'existe que sous Tauri/macOS. */
async function withDictation(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    (window as any).__TAURI_INTERNALS__ = {
      invoke: () => Promise.reject(new Error('bench')),
      transformCallback: () => 0,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    };
  });
}

async function barLayout(page: Page) {
  return page.locator('.composer-bar').evaluate((bar) => {
    const box = bar.getBoundingClientRect();
    // feuilles visibles de la barre, groupes dépliés
    const leaves = [...bar.children].flatMap((child) =>
      child.matches('.composer-tool-group, .composer-context-rail, .model-pick') ? [...child.children] : [child])
      .filter((el) => !el.matches('.flex'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: (el.getAttribute('aria-label') ?? el.className.toString()).slice(0, 40), left: r.left, right: r.right, width: r.width };
      })
      .filter((leaf) => leaf.width > 0);
    const overlaps: string[] = [];
    for (let i = 1; i < leaves.length; i++) {
      if (leaves[i].left < leaves[i - 1].right - 0.5) overlaps.push(`${leaves[i - 1].name} / ${leaves[i].name}`);
    }
    const outside = leaves.filter((leaf) => leaf.left < box.left - 0.5 || leaf.right > box.right + 0.5).map((leaf) => leaf.name);
    // le libellé du modèle reste lisible : au moins quelques caractères
    const name = bar.querySelector<HTMLElement>('.mp-name');
    return { width: box.width, overlaps, outside, modelName: name ? name.getBoundingClientRect().width : 0 };
  });
}

for (const dictation of [false, true]) {
  test(`composer bar never overlaps when narrow${dictation ? ' — with dictation' : ''}`, async ({ page }) => {
    if (dictation) await withDictation(page);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/#chatbench-menus-running-specialiste');
    await expect(page.locator('.composer-bar')).toBeVisible();
    for (const width of [900, 640, 560, 480, 440, 400, 360, 320, 280, 250]) {
      await page.setViewportSize({ width, height: 700 });
      await page.waitForTimeout(80);
      const layout = await barLayout(page);
      expect(layout.overlaps, `chevauchement à ${width}px`).toEqual([]);
      expect(layout.outside, `débordement à ${width}px`).toEqual([]);
      expect(layout.modelName, `nom du modèle illisible à ${width}px`).toBeGreaterThan(24);
      // le micro reste dans la barre ; sous 300 px il rejoint le plateau
      if (dictation) await expect(page.locator('.composer-bar .composer-dictation')).toHaveCount(layout.width >= 300 ? 1 : 0);
    }
  });
}

test('folded composer keeps every control reachable in the « … » tray', async ({ page }) => {
  await page.setViewportSize({ width: 470, height: 700 });
  await page.goto('/#chatbench-menus-running-specialiste');
  const more = page.getByRole('button', { name: 'Autres réglages du message', exact: true });
  await expect(more).toBeVisible();
  // repliés : base, permission, contexte et chrono ont quitté la barre
  await expect(page.locator('.composer-bar .kb-trigger')).toHaveCount(0);
  await expect(page.locator('.composer-bar .permission-select')).toHaveCount(0);
  await expect(page.locator('.composer-bar .composer-turn-clock')).toHaveCount(0);
  // le spécialiste reste dans la barre, réduit à son glyphe
  await expect(page.getByRole('button', { name: 'Spécialiste du fil', exact: true })).toBeVisible();
  await more.click();
  const tray = page.locator('.composer-tray');
  await expect(tray).toBeVisible();
  await expect(tray.locator('.kb-trigger')).toBeVisible();
  await expect(tray.locator('.permission-select')).toBeVisible();
  await expect(tray.locator('.ctx-ring-wrap')).toBeVisible();
  await expect(tray.locator('.composer-turn-clock')).toBeVisible();
  const box = (await tray.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(471);
  // un menu ouvert depuis le plateau fonctionne, Échap referme d'abord lui
  const permission = tray.locator('.permission-select .custom-select-trigger');
  await permission.click();
  await expect(page.locator('.composer-permission-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(permission).toHaveAttribute('aria-expanded', 'false');
  await expect(permission).toBeFocused();
  await expect(tray).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tray).toHaveCount(0);
  await expect(more).toBeFocused();
  // la barre s'élargit : tout revient en place, plus de plateau
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(more).toHaveCount(0);
  await expect(page.locator('.composer-bar .permission-select')).toBeVisible();
});

test('tiny composer moves the specialist into the tray', async ({ page }) => {
  await page.setViewportSize({ width: 270, height: 700 });
  await page.goto('/#chatbench-menus-running-specialiste');
  await expect(page.locator('.composer-bar .specialiste-pilule')).toHaveCount(0);
  await page.getByRole('button', { name: 'Autres réglages du message', exact: true }).click();
  await expect(page.locator('.composer-tray').getByRole('button', { name: 'Spécialiste du fil', exact: true })).toBeVisible();
});
