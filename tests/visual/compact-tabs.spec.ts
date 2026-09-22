import { test, expect } from "@playwright/test";

for (const theme of ["dark", "light"]) {
  test(`compact tabs share shape and selection in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto(`/#wsbench-compact-tabs${theme === "light" ? "-light" : ""}`);
    await expect(page.locator('.biblio-tabs')).toBeVisible();
    const title = 'Radiative forcing by light-absorbing particles in snow — a very long title';
    await page.evaluate(title => window.dispatchEvent(new CustomEvent('zotero-items', { detail: { items: [{
      key: 'ARTICLE1', title, creators: 'Skiles', year: '2018', publication: '', tags: [],
      dateAdded: '2026-01-01', hasPdf: true, pdfKey: 'PDF00001', pdfFile: 'paper.pdf', fav: false,
    }] } })), title);
    await page.locator('.biblio-main-button').dblclick();
    const active = page.locator('.document-tab-shell[data-active="true"]');
    await expect(active).toHaveCount(3);
    // Theme transitions can briefly serialize the same border in oklab vs sRGB.
    await expect.poll(() => active.evaluateAll(tabs =>
      new Set(tabs.map(tab => getComputedStyle(tab).borderColor)).size)).toBe(1);
    const styles = await active.evaluateAll(tabs => tabs.map(tab => {
      const s = getComputedStyle(tab);
      return { width: tab.getBoundingClientRect().width, height: s.height,
        radius: s.borderRadius, background: s.backgroundColor, border: s.borderColor };
    }));
    for (const style of styles) {
      expect(style.width).toBeLessThanOrEqual(168);
      expect(style.height).toBe('30px');
      expect(style.radius).toBe('10px');
      expect(style.background).toBe(styles[0].background);
      expect(style.border).toBe(styles[0].border);
    }
    // Short titles hug their content rather than occupying a fixed-width slot.
    const short = page.locator('.project-chat-tab-wrap').filter({ hasText: 'Bref' });
    expect((await short.boundingBox())!.width).toBeLessThan(100);
    await expect(page.locator('#biblio-library-tab')).toHaveCSS('color', await short.evaluate(el => getComputedStyle(el).color));
    const file = page.locator('.topbar-tab').first();
    const width = (await file.boundingBox())!.width;
    await page.locator('.topbar-tab-main[title="a.pdf"]').click();
    expect((await file.boundingBox())!.width).toBeCloseTo(width, 1);
    await expect(page.locator('.topbar-tab-ext').first()).toHaveText('.tex');
    // Actual ellipsis, not only a capped outer box with overflowing contents.
    for (const selector of ['.project-chat-tab-label', '.topbar-tab-stem', '.biblio-document-tab .biblio-tab span']) {
      const label = page.locator(selector).first();
      expect(await label.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await expect(label).toHaveCSS('text-overflow', 'ellipsis');
    }
    await page.getByRole('tab', { name: title }).focus();
    await page.keyboard.press('Home');
    await expect(page.locator('#biblio-library-tab')).toBeFocused();
    await expect(page.locator('#biblio-library-tab')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: title })).toBeFocused();
    await expect(page.locator('.biblio-document-tab .document-tab-close')).toHaveCSS('opacity', '1');
    await page.setViewportSize({ width: 400, height: 700 });
    expect((await page.locator('.biblio-document-tab').boundingBox())!.width).toBeLessThanOrEqual(144);
    await page.locator('.biblio-document-tab .document-tab-close').click();
    await expect(page.locator('#biblio-library-tab')).toHaveAttribute('aria-selected', 'true');
  });
}
