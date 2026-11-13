import { test, expect, type Page } from "@playwright/test";

async function expectAligned(page: Page, split = true) {
  // onglets posés (2026-11-09) : la moitié atelier commence sur l'axe du
  // séparateur ; en chat seul, elle garde une largeur fixe au bord droit.
  await expect(page.locator(".topbar-right")).toBeVisible();
  if (split) await expect.poll(() => page.evaluate(() => {
    const right = document.querySelector('.topbar-right')!.getBoundingClientRect();
    const divider = document.querySelector('[data-panel-resize-handle-id="chat-atelier-divider"]')!.getBoundingClientRect();
    return Math.abs(right.x - (divider.x + divider.width / 2));
  })).toBeLessThan(1);
  await expect(page.locator('.topbar')).toHaveCSS('height', '38px');
  await expect(page.locator('.topbar-layout-controls [role=radio]')).toHaveCount(3);
  for (const control of await page.locator('.topbar-layout-controls [role=radio]').all()) await expect(control).toBeVisible();
  await expect(page.locator('.chat-header-in-topbar .titles')).toBeHidden();
}

test('toolbar follows divider, sidebar and layout changes without an extra chat header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.goto('/#wsbench-topbar');
  await expectAligned(page);
  const divider = page.locator('[data-panel-resize-handle-id="chat-atelier-divider"]');
  const rect = (await divider.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(1150, 300, { steps: 12 });
  await page.mouse.up();
  await expectAligned(page);
  await page.getByRole('button', { name: 'Sidebar', exact: true }).click();
  await expectAligned(page);
  await page.locator('.project-chat-menu').click();
  await page.getByRole('menuitemcheckbox', { name: 'Données Copernicus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Données Copernicus', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 1000, height: 850 });
  await expectAligned(page);
  await page.locator('.topbar-window-overflow button').click();
  const windowMenu = page.getByRole('menu');
  await expect(windowMenu.getByRole('menuitem')).toHaveCount(6);
  // DIAG-CI (temporaire) : ce que voit la CI macOS au moment du clic.
  console.log('DIAG menu', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role^=menuitem]')].map(e => `${e.getAttribute('role')}:${e.textContent}:${e.closest('[role=menu]')?.getAttribute('data-open') ?? ''}`))));
  // Same label in both languages (layout.chat), scoped to the open menu.
  await windowMenu.getByRole('menuitem', { name: 'Chat', exact: true }).click();
  console.log('DIAG radios', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.topbar-layout-controls [role=radio]')].map(e => `${e.getAttribute('aria-label')}=${e.getAttribute('aria-checked')}`))));
  await expect(page.locator('.topbar-layout-controls').getByRole('radio', { name: 'Chat', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expectAligned(page, false);
  await expect(divider).toHaveCount(0);
  const split = page.getByRole('radio').nth(1);
  if (await split.isVisible()) await split.click();
  else {
    await page.locator('.topbar-window-overflow button').click();
    await page.getByRole('menuitem').nth(3).click();
  }
  await expectAligned(page);
  await page.setViewportSize({ width: 600, height: 850 });
  await expectAligned(page);
  await page.locator('.topbar-tab-more').click();
  await expect(page.getByRole('menuitem', { name: 'main_ngeo.pdf', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'discussion_en.tex', exact: true })).toBeVisible();
});

test('chat tabs can be pinned, closed and reopened without native title labels', async ({ page }) => {
  await page.setViewportSize({width:1440,height:850});
  await page.goto('/#wsbench-topbar');
  const first=page.getByRole('button',{name:'Analyse albédo',exact:true});
  await expect(first).toBeVisible();
  await expect(first).not.toHaveAttribute('title');
  await first.click({button:'right'});
  await page.getByRole('menuitem',{name:/^(Pin tab|Épingler l’onglet)$/}).click();
  await expect(page.locator('.project-chat-tab-wrap.is-pinned')).toHaveCount(1);
  await page.locator('.project-chat-menu').click();
  await page.getByRole('menuitemcheckbox',{name:'Données Copernicus',exact:true}).click();
  const second=page.getByRole('button',{name:'Données Copernicus',exact:true});
  await expect(second).toBeVisible();
  await second.hover();
  await page.locator('.project-chat-tab-wrap').filter({has:second}).locator('.project-chat-tab-close').click();
  await expect(second).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-current','page');
  await page.reload();
  await expect(page.locator('.project-chat-tab-wrap.is-pinned')).toHaveCount(1);
  await first.click({button:'right'});
  await page.getByRole('menuitem',{name:/^(Unpin tab|Désépingler l’onglet)$/}).click();
  await first.hover();
  await page.locator('.project-chat-tab-close').click();
  await expect(page.locator('.project-chat-tab')).toHaveCount(0);
  await page.locator('.project-chat-menu').click();
  await page.getByRole('menuitemcheckbox',{name:'Données Copernicus',exact:true}).click();
  await expect(second).toHaveAttribute('aria-current','page');
});

test('document tabs shrink together, then overflow into a counter instead of being cut', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.goto('/#wsbench-topbar-many');
  const tabs = page.locator('.topbar-tabs .topbar-tab');
  await expect(tabs.first()).toBeVisible();
  const check = async () => {
    const strip = (await page.locator('.topbar-tabs').boundingBox())!;
    const boxes = await tabs.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    // même largeur pour tous, entre 112 et 168 px
    for (const box of boxes) {
      expect(Math.abs(box.width - boxes[0].width)).toBeLessThan(1);
      expect(box.width).toBeGreaterThanOrEqual(111.5);
      expect(box.width).toBeLessThanOrEqual(168);
      // aucun onglet coupé au bord de la barre
      expect(box.right).toBeLessThanOrEqual(strip.x + strip.width + 1);
    }
    // l'onglet actif reste dans la barre ; le reste est derrière « +N »
    await expect(page.locator('.topbar-tab[data-active="true"]')).toHaveCount(1);
    const hidden = 7 - boxes.length;
    if (hidden > 0) await expect(page.locator('.topbar-tab-more')).toHaveText(`+${hidden}`);
    else await expect(page.locator('.topbar-tab-more')).toHaveCount(0);
    // nom abrégé au caractère près : pas de trou avant l'extension
    for (const name of await page.locator('.topbar-tab-name').all()) {
      expect(await name.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect(name).not.toContainText('— PDF');
    }
    return boxes.length;
  };
  // côte à côte : peu de place, des onglets passent dans le compteur. Même
  // ajustement en plusieurs rendus qu'en bas : on attend l'état final.
  let split = 0;
  await expect(async () => { split = await check(); }).toPass({ timeout: 5000 });
  expect(split).toBeLessThan(7);
  // atelier seul : la place revient, les onglets aussi
  await page.locator('.topbar-layout-controls [role=radio]').nth(2).click();
  await expect.poll(() => tabs.count()).toBeGreaterThan(split);
  // l'ajustement (nombre d'onglets, puis troncs abrégés) se fait en plusieurs
  // rendus : on vérifie l'état final, pas un rendu intermédiaire
  await expect(async () => { await check(); }).toPass({ timeout: 5000 });
});
