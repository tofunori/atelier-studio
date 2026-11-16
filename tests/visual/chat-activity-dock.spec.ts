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
  // Le temps du TOUR vit à côté du bouton Arrêter (refonte 2026-10-18) ; les
  // rangées du fil ne portent que la durée de leur propre action.
  await expect(page.locator('.active-turn-tail .turn-activity-elapsed')).toHaveCount(0);
  const elapsed = page.locator('.composer .composer-turn-clock');
  await expect(elapsed).toBeVisible();
  const initialTime = await elapsed.innerText();
  // Trois grains en enchaînement (2026-11-16) : le signe bat au rythme du
  // reflet du libellé (recette unique label-sweep, 1,6 s), chaque geste tient
  // deux battements, cinq gestes = 16 s.
  const glyph = page.locator('.active-turn-tail .turn-activity-glyph');
  await expect(glyph).toHaveCSS('animation-name', 'none');
  await expect(glyph.locator('.tg-layer').first()).toHaveCSS('animation-name', 'tg-turn');
  await expect(glyph.locator('.tg-layer').first()).toHaveCSS('animation-duration', '16s');
  await expect(glyph.locator('.tg-wave .tg-dot').first()).toHaveCSS('animation-duration', '1.6s');
  await expect(glyph.locator('.tg-still')).toBeHidden();
  await expect(status).toHaveCSS('font-size', '13px');
  await expect(status).toHaveCSS('font-weight', '400');
  await expect(status).toHaveCSS('animation-name', 'label-sweep');
  await expect(status).toHaveCSS('animation-duration', '1.6s');

  const messages = page.locator('.messages');
  const distanceToEnd = () => messages.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
  const checkAboveComposer = async () => {
    await expect(status).toBeVisible();
    const box = (await status.boundingBox())!;
    const composer = (await page.locator('.composer').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(composer.y);
    expect(box.y).toBeGreaterThan(0);
  };
  await expect(status).toContainText('Exécute', { timeout: 10000 });
  await checkAboveComposer();
  // Une commande en cours (variante B, 2026-11-01) : la phrase vivante tient
  // seule le libellé de la grappe et c'est ce libellé qui balaie ; pas
  // d'anneau dans la colonne d'état, une seule boucle par rangée.
  const sweep = page.locator('.activity-cluster.is-active .ui-activity-label.is-shimmering');
  await expect(sweep).toBeVisible();
  await expect(sweep).toHaveCSS('animation-name', 'label-sweep');
  await expect(sweep).toHaveCSS('animation-duration', '1.6s');
  await expect(page.locator('.activity-cluster.is-active .ui-activity-state .tool-run-ring')).toHaveCount(0);
  await expect(status).toHaveCSS('animation-name', 'none');
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
  await expect(page.locator('.turn-activity-glyph .tg-moving').first()).toBeHidden();
  await expect(page.locator('.turn-activity-glyph .tg-still').first()).toBeVisible();
  await expect(status).toHaveCSS('animation-name', 'none');
  await expect(status).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)');
});

test('tool disclosures keep readable sizing, a chevron in place of the icon on hover, and keyboard access', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto('/#chatbench-slottransition');
  const trigger = page.locator('.ui-activity-trigger').first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveCSS('font-size', '13px');
  await expect(trigger).toHaveCSS('min-height', '36px');
  await expect(trigger.locator('.ui-activity-icon svg')).toHaveCSS('width', '14px');
  // Variante A « rangées calmes » (2026-11-14) : le chevron n'a plus de
  // colonne. Caché au repos, il prend la place de l'icône de tête au survol,
  // au focus et à l'ouverture ; la durée, elle, se cale au bord droit.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(2, 2);
  const icon = trigger.locator('.ui-activity-icon');
  const chevron = trigger.locator('.tool-tick');
  await expect(chevron).toHaveCSS('opacity', '0');
  await expect(icon).toHaveCSS('opacity', '1');
  const iconBox = (await icon.boundingBox())!;
  const chevronBox = (await chevron.boundingBox())!;
  expect(Math.abs(iconBox.x + iconBox.width / 2 - (chevronBox.x + chevronBox.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(iconBox.y + iconBox.height / 2 - (chevronBox.y + chevronBox.height / 2))).toBeLessThanOrEqual(1);
  const row = (await trigger.boundingBox())!;
  const meta = trigger.locator('.ui-activity-meta');
  if (await meta.isVisible()) {
    const metaBox = (await meta.boundingBox())!;
    expect(Math.abs(row.x + row.width - 8 - (metaBox.x + metaBox.width))).toBeLessThanOrEqual(1);
    const label = (await trigger.locator('.ui-activity-label').boundingBox())!;
    expect(label.x + label.width).toBeLessThanOrEqual(metaBox.x + 1);
  }
  await trigger.hover();
  await expect(chevron).toHaveCSS('opacity', '1');
  await expect(icon).toHaveCSS('opacity', '0');
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
        // Une durée vide ne réserve plus de colonne : le bord droit du contenu la remplace.
        const meta = el.parentElement!.querySelector('.ui-activity-meta')!.getBoundingClientRect();
        const edge = el.parentElement!.getBoundingClientRect().right - 8;
        return { textEnd: content.right, fadeStart: box.right - 16, metaStart: meta.width ? meta.left : edge };
      }, text);
      expect(geometry.textEnd).toBeLessThanOrEqual(geometry.fadeStart + 1);
      expect(geometry.metaStart - geometry.textEnd).toBeGreaterThanOrEqual(8);
    }
  }
});
