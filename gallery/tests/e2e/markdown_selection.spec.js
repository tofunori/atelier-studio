import {expect, test} from '@playwright/test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const gallery = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Markdown WYSIWYG exposes the shared selection capsules', async ({page}) => {
  await page.route('http://localhost/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><style>html,body{margin:0;height:100%}#editor{height:100vh}.markdown-selection-actions{position:fixed;z-index:9999}.markdown-annotation-editor{position:fixed;z-index:10000}</style></head><body><div id="editor"></div></body></html>',
  }));
  await page.goto('http://localhost/');
  await page.addStyleTag({path: path.join(gallery, 'assets/toastui/toastui-editor.min.css')});
  await page.addStyleTag({path: path.join(gallery, 'assets/annotation_ui.css')});
  await page.addScriptTag({path: path.join(gallery, 'assets/toastui/toastui-editor-all.min.js')});
  await page.addScriptTag({path: path.join(gallery, 'assets/markdown_features.bundle.js')});
  await page.evaluate(() => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => String(url).startsWith('/pdfannot') ? {annots: []} : {message: 'citation'},
    });
    window.sentToAtelier = [];
    window.__atelierPost = (payload) => window.sentToAtelier.push(payload);
    window.editor = new window.toastui.Editor({
      el: document.querySelector('#editor'),
      initialValue: '# Variables\n\nSeasonal pixel values are weighted by glacier ice fraction.',
      initialEditType: 'wysiwyg',
      height: '100%',
      usageStatistics: false,
    });
    window.AtelierStudioMarkdown.createMarkdownWysiwygSelection({
      path: 'notes/variables.md',
      getMarkdown: () => window.editor.getMarkdown(),
    });
  });
  await page.waitForTimeout(100);
  const passage = page.locator('.toastui-editor-ww-container .ProseMirror p');
  // Double-cliquer crée une sélection native dans le vrai ProseMirror, sans
  // fabriquer artificiellement le Range que le contrôleur doit observer.
  const passageBox = await passage.boundingBox();
  expect(passageBox).not.toBeNull();
  await page.mouse.dblclick(passageBox.x + 95, passageBox.y + 8, {delay: 80});
  const actions = page.locator('.markdown-selection-actions');
  await expect(actions).toBeVisible();
  const actionsBox = await actions.boundingBox();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox.y).toBeGreaterThan(passageBox.y);
  expect(actionsBox.y).toBeLessThan(passageBox.y + 100);
  await expect(actions.getByRole('button')).toHaveCount(5);
  await expect(actions.getByRole('button', {name: 'Annoter'})).toBeVisible();
  await expect(actions.getByRole('button', {name: 'Question rapide'})).toBeVisible();
  await expect(actions.getByRole('button', {name: 'Surligner'})).toBeVisible();
  await actions.getByRole('button', {name: 'Annoter'}).click();
  await expect(page.getByRole('textbox', {name: 'Commentaire sur le passage'})).toBeVisible();
});
