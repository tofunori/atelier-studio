import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await webkit.launch();
try {
  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({viewport: {width, height: 844}});
    await page.goto(new URL('../Sources/AtelierUI/Resources/ChatRenderer/index.html', import.meta.url).href);
    await page.evaluate(() => {
      window.copied = [];
      window.webkit = {messageHandlers: {chat: {postMessage: event => {
        if (event.kind === 'copy') window.copied.push(event.text);
      }}}};
    });
    for (const language of ['latex', 'markdown', 'python']) {
      const source = 'Individual summers $14.31$~W~m$^{-2}$ ' + 'x'.repeat(200) + '\n    indented line 🌲\n';
      await page.evaluate(text => window.updateMessage(text), '```' + language + '\n' + source + '```');
      await page.waitForFunction(() => !!document.querySelector('.codebar button'));
      const dimensions = await page.evaluate(() => {
        const code = document.querySelector('pre code');
        return {page: document.documentElement.scrollWidth, width: innerWidth, code: code.clientWidth, scroll: code.scrollWidth};
      });
      assert(dimensions.page <= dimensions.width, JSON.stringify(dimensions));
      assert(dimensions.scroll <= dimensions.code, JSON.stringify(dimensions));
      await page.locator('.codebar button').click();
      assert.equal(await page.evaluate(() => window.copied.at(-1)), source);
    }
    await page.close();
  }
  console.log('WebKit: 320/390/430px, LaTeX/Markdown/Python wrap without overflow; copy preserves source.');
} finally { await browser.close(); }
