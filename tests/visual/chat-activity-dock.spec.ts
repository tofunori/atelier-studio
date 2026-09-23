import { expect, test } from '@playwright/test';

// Chat v2 : la ligne d'activité vivante vit dans le fil (grappe active,
// `.active-turn-tail`), plus dans un dock séparé au-dessus du composer
// (turnAnatomy.test.tsx). Quand la réponse finale commence, le fil s'ancre sur
// son début et cesse de suivre (scrollPolicy « anchor-final ») : la ligne peut
// passer sous le pli pendant la rédaction, et reparaît au-dessus du composer
// dès qu'on revient au bas du fil.
test('live activity stays in the transcript tail and shows above the composer at the end', async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 700, height: 560 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#chatbench-livestream');
  const status = page.locator('.messages .active-turn-tail [role=status]');
  await expect(status).toBeVisible();
  await expect(page.locator('.chat-activity-dock')).toHaveCount(0);
  await expect(page.locator('.active-turn-tail .stop-hint')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Interrompre', exact: true })).toHaveCount(1);
  await expect(page.locator('.turn-activity-glyph')).toBeVisible();
  await expect(page.locator('.messages .active-turn-header')).toHaveCount(0);
  const elapsed = page.locator('.active-turn-tail .turn-activity-elapsed');
  await expect(elapsed).toBeVisible();
  const initialTime = await elapsed.innerText();
  await expect(page.locator('.turn-activity-glyph')).toHaveCSS('animation-duration', '3s');
  await expect(page.locator('.turn-activity-glyph')).toHaveCSS('animation-timing-function', 'linear');
  await expect(status).toHaveCSS('font-size', '13px');
  await expect(status).toHaveCSS('font-weight', '400');
  await expect(status).toHaveCSS('animation-duration', '1.6s');

  const messages = page.locator('.messages');
  const distanceToEnd = () => messages.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
  const checkAboveComposer = async () => {
    await expect(status).toBeVisible();
    const box = (await status.boundingBox())!;
    const composer = (await page.locator('.composer').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(composer.y);
    expect(box.y).toBeGreaterThan(0);
    await expect(status).toHaveCSS('animation-name', 'turn-working-sweep');
    await expect(status).toHaveCSS('animation-play-state', 'running');
  };
  await expect(status).toContainText('Exécute', { timeout: 10000 });
  await checkAboveComposer();
  await expect(status).toContainText('Rédaction', { timeout: 10000 });
  await checkAboveComposer();
  await expect(elapsed).not.toHaveText(initialTime);
  const before = await messages.innerText();
  await expect(messages).toContainText('Rien de structurel', { timeout: 15000 });
  expect((await messages.innerText()).length).toBeGreaterThan(before.length);

  await messages.hover();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => messages.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(distanceToEnd).toBeLessThanOrEqual(2);
  await checkAboveComposer();
  const previousTop = await messages.evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, -1500);
  await expect.poll(() => messages.evaluate(el => el.scrollTop)).toBeLessThan(previousTop);
  await page.setViewportSize({ width: 420, height: 560 });
  await messages.hover();
  await page.mouse.wheel(0, 3000);
  await expect.poll(distanceToEnd).toBeLessThanOrEqual(2);
  await checkAboveComposer();
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
