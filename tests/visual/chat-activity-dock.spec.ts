import { expect, test } from '@playwright/test';

test('live activity follows short content and stays visible when the transcript fills the window', async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 700, height: 560 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#chatbench-livestream');
  const status = page.locator('.chat-activity-dock [role=status]');
  await expect(status).toBeVisible();
  await expect(page.locator('.chat-activity-dock .stop-hint')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Interrompre', exact: true })).toHaveCount(1);
  await expect(page.locator('.turn-activity-glyph')).toBeVisible();
  await expect(page.locator('.messages .active-turn-header')).toHaveCount(0);
  const elapsed = page.locator('.chat-activity-dock .turn-activity-elapsed');
  await expect(elapsed).toBeVisible();
  const initialTime = await elapsed.innerText();
  await expect(page.locator('.turn-activity-glyph')).toHaveCSS('animation-duration', '3s');
  await expect(page.locator('.turn-activity-glyph')).toHaveCSS('animation-timing-function', 'linear');
  await expect(status).toHaveCSS('font-size', '13px');
  await expect(status).toHaveCSS('font-weight', '400');
  await expect(status).toHaveCSS('animation-duration', '1.6s');
  await expect(page.locator('.messages .active-turn-tail')).toHaveCount(0);

  const checkPosition = async () => {
    await expect(status).toBeVisible();
    const box = (await status.boundingBox())!;
    const composer = (await page.locator('.composer').boundingBox())!;
    await expect.poll(() => page.evaluate(() => {
      const dock = document.querySelector<HTMLElement>(".chat-activity-dock")!;
      const anchor = document.querySelector(".activity-flow-anchor")!;
      const status = dock.querySelector("[role=status]")!;
      const messages = document.querySelector(".messages")!;
      const transform = new DOMMatrixReadOnly(getComputedStyle(dock).transform);
      const base = dock.getBoundingClientRect().top - transform.m42;
      const expected = messages.scrollHeight <= messages.clientHeight + 1
        ? Math.min(base, anchor.getBoundingClientRect().bottom + 8) + 6 : base + 6;
      return Math.abs(status.getBoundingClientRect().top - expected);
    })).toBeLessThanOrEqual(4);
    expect(box.y + box.height).toBeLessThanOrEqual(composer.y);
    expect(box.y).toBeGreaterThan(0);
    await expect(status).toHaveCSS('animation-name', 'turn-working-sweep');
    await expect(status).toHaveCSS('animation-play-state', 'running');
  };
  await expect(status).toContainText('Exécute', { timeout: 10000 });
  await checkPosition();
  await expect(status).toContainText('Rédaction', { timeout: 10000 });
  await checkPosition();
  await expect(elapsed).not.toHaveText(initialTime);
  const before = await page.locator('.messages').innerText();
  await expect(page.locator('.messages')).toContainText('Rien de structurel', { timeout: 15000 });
  expect((await page.locator('.messages').innerText()).length).toBeGreaterThan(before.length);
  await checkPosition();
  const messages = page.locator('.messages');
  await messages.hover();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => messages.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const previousTop = await messages.evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, -1500);
  await expect.poll(() => messages.evaluate(el => el.scrollTop)).toBeLessThan(previousTop);
  await checkPosition();
  await page.setViewportSize({ width: 420, height: 560 });
  await checkPosition();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.turn-activity-glyph')).toHaveCSS('animation-name', 'none');
  await expect(status).toHaveCSS('animation-name', 'none');
  await expect(status).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)');
});

test('tool disclosures keep readable sizing, a nearby chevron and keyboard access', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto('/#chatbench-slottransition');
  const trigger = page.locator('.ui-activity-trigger').first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveCSS('font-size', '13px');
  await expect(trigger).toHaveCSS('min-height', '36px');
  await expect(trigger.locator('.ui-activity-icon svg')).toHaveCSS('width', '15px');
  const label = (await trigger.locator('.ui-activity-label').boundingBox())!;
  const chevron = (await trigger.locator('.tool-tick').boundingBox())!;
  expect(chevron.x - label.x - label.width).toBeLessThanOrEqual(12);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.ui-activity-detail').first()).toBeVisible();
  await expect(page.locator('.ui-activity-detail').first()).toHaveCSS('font-size', '13px');
  await page.keyboard.press('Space');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 420, height: 760 });
  await expect(trigger).toHaveCSS('min-height', '44px');
  const bounds = (await trigger.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(420);
});


test('short action labels end before the fade, including accented final letters', async ({ page }) => {
  await page.goto('/#chatbench-slottransition');
  const label = page.locator('.ui-activity-label').first();
  await expect(label).toBeVisible();
  for (const width of [900, 420]) {
    await page.setViewportSize({ width, height: 760 });
    for (const text of ['Results_en.tex consulté', 'Outil chargé', '2 outils chargés']) {
      // Exercise the production disclosure CSS with the exact reported labels.
      const geometry = await label.evaluate((el, text) => {
        el.textContent = text;
        const range = document.createRange();
        range.selectNodeContents(el);
        const content = range.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const tick = el.parentElement!.querySelector('.tool-tick')!.getBoundingClientRect();
        return { textEnd: content.right, fadeStart: box.right - 16, tickStart: tick.left };
      }, text);
      expect(geometry.textEnd).toBeLessThanOrEqual(geometry.fadeStart + 1);
      expect(geometry.tickStart - geometry.textEnd).toBeGreaterThanOrEqual(8);
      expect(geometry.tickStart - geometry.textEnd).toBeLessThanOrEqual(12);
    }
  }
});
