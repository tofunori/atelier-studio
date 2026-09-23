import { test, expect, type Page } from "@playwright/test";

async function expectAligned(page: Page, split = true) {
  await expect(page.locator(".topbar-center")).toBeVisible();
  await expect.poll(() => page.evaluate((split) => {
    const bar = document.querySelector('.topbar')!.getBoundingClientRect();
    const tools = document.querySelector('.topbar-center')!.getBoundingClientRect();
    const divider = document.querySelector('[data-panel-resize-handle-id="chat-atelier-divider"]')?.getBoundingClientRect();
    const axis = split && divider ? divider.x + divider.width / 2 : bar.x + bar.width / 2;
    return Math.abs(tools.x + tools.width / 2 - axis);
  }, split)).toBeLessThan(1);
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
  await page.locator('.project-chat-tabs > button').last().click();
  await page.getByRole('menuitem', { name: 'Données Copernicus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Données Copernicus', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 1000, height: 850 });
  await expectAligned(page);
  await page.locator('.topbar-window-overflow button').click();
  // Language-independent lookup via translated menu order: surfaces, search, chat, split, atelier, quick ask.
  await page.getByRole('menuitem').nth(2).click();
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
  await page.locator('.project-chat-tabs > button').last().click();
  await page.getByRole('menuitem',{name:'Données Copernicus',exact:true}).click();
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
  await page.locator('.project-chat-tabs > button').last().click();
  await page.getByRole('menuitem',{name:'Données Copernicus',exact:true}).click();
  await expect(second).toHaveAttribute('aria-current','page');
});
