import { expect, test } from '@playwright/test';

// Check the browser's computed cascade, including the textarea's native defaults
// and the mention backdrop. Source-string checks cannot catch these differences.
for (const size of [13.5, 18]) {
  test(`chat text and prompt retain identical metrics at ${size}px`, async ({ page }) => {
    await page.goto('/#chatbench');
    const prompt = page.locator('.composer textarea');
    await expect(prompt).toBeVisible();
    await page.evaluate((value) => {
      const root = document.documentElement.style;
      root.setProperty('--chat-fs', `${value}px`);
      root.setProperty('--chat-lh', '1.8');
      root.setProperty('--ui-font', 'Arial, sans-serif');
      window.dispatchEvent(new Event('app-theme-changed'));
    }, size);
    const metrics = await page.evaluate(() => {
      const selectors = ['.composer textarea', '.ta-backdrop', '.chat-md', '.user-bubble'];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const style = getComputedStyle(element);
        return { font: style.fontFamily, size: style.fontSize, line: style.lineHeight };
      });
    });
    for (const metric of metrics) {
      expect(metric).toEqual(metrics[0]);
      expect(parseFloat(metric.size)).toBe(size);
      expect(parseFloat(metric.line)).toBeCloseTo(size * 1.8, 1);
    }
    await prompt.fill('Texte de vérification sur plusieurs lignes. '.repeat(20));
    const before = await prompt.inputValue();
    await page.setViewportSize({ width: 680, height: 850 });
    await expect(prompt).toHaveValue(before);
    const box = await prompt.boundingBox();
    expect(box?.height).toBeGreaterThan(size * 1.8);
    expect(box?.height).toBeLessThanOrEqual(221);
    await prompt.fill('');
    await expect.poll(async () => (await prompt.boundingBox())?.height).toBeGreaterThanOrEqual(size * 1.8 - 1);
  });
}
