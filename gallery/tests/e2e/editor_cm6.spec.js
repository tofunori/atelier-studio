import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync, renameSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref(); socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const {port} = socket.address(); socket.close(() => resolve(port));
    });
  });
}

async function stop(server) {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 1000))]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function withProject(files, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-editor-cm6-'));
  let server;
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text);
    const port = await freePort();
    server = spawn(process.execPath, [path.join(GALLERY, 'server', 'main.mjs')], {
      cwd: root, env: {...process.env, FIG_PORT: String(port), GALLERY_ROOT: root}, stdio: 'ignore',
    });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, port, url: (asset, name, extra = '') =>
      `http://127.0.0.1:${port}/.fig_thumbs/${asset}?path=${encodeURIComponent(path.join(root, name))}${extra}`});
  } finally { await stop(server); rmSync(root, {recursive: true, force: true}); }
}

async function expectEngine(page, engine) {
  await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe(engine);
  await expect(page.locator(engine === 'cm6' ? '.cm-editor' : '.CodeMirror')).toBeVisible();
}

async function saveShortcut(page) {
  const response = page.waitForResponse(r => r.url().endsWith('/codesave') && r.request().method() === 'POST');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  expect((await response).ok()).toBe(true);
}

test('code editor save reload and diff', async ({page}) => {
  await withProject({'sample.py': 'value = 1\n'}, async ({root, url}) => {
    await page.goto(url('code_editor.html', 'sample.py'));
    await expectEngine(page, 'cm6');
    await page.evaluate(() => cm.setValue('value = 2\n'));
    await saveShortcut(page);
    expect(readFileSync(path.join(root, 'sample.py'), 'utf8')).toBe('value = 2\n');
    await expect(page.locator('#diffTag')).toBeEnabled();
    const target = path.join(root, 'sample.py');
    const temp = `${target}.external`;
    writeFileSync(temp, 'value = 3\n');
    const future = new Date(Date.now() + 1500); utimesSync(temp, future, future); renameSync(temp, target);
    await expect.poll(() => page.evaluate(() => cm.getValue())).toBe('value = 3\n');
    await page.goto(url('code_editor.html', 'sample.py', '&engine=cm5'));
    await expectEngine(page, 'cm5');
    await page.evaluate(() => cm.setValue('value = 4\n'));
    await saveShortcut(page);
    await expect(page.locator('#diffTag')).toBeEnabled();
  });
});

test('code editor preserves Python indentation', async ({page}) => {
  await withProject({'indent.py': 'def run():\n    value = 1'}, async ({url}) => {
    await page.goto(url('code_editor.html', 'indent.py'));
    await expectEngine(page, 'cm6');
    await page.locator('.cm-content').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('return value');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('\n    return value');
  });
});

test('markdown preview split edit roundtrip', async ({page}) => {
  for (const engine of ['cm5', 'cm6']) {
    await withProject({'note.md': '# Alpha\n\nInitial selection text\n'}, async ({root, url}) => {
      const target = path.join(root, 'note.md');
      await page.goto(url('md_viewer.html', 'note.md', `&engine=${engine}`));
      await expect(page.locator('#prevPane')).toContainText('Initial');
      await page.locator('#mSplit').click(); await expectEngine(page, engine);
      await page.evaluate(() => cm.setSelection({line: 2, ch: 0}, {line: 2, ch: 7}));
      await expect.poll(() => page.evaluate(() => cm.getSelection())).toBe('Initial');
      await page.locator('#mPrev').click(); await page.locator('#mEdit').click();
      await expect.poll(() => page.evaluate(() => cm.getSelection())).toBe('Initial');
      await page.evaluate(() => cm.setValue('# Alpha\n\nEdited\n'));
      await page.locator('#mSplit').click(); await expect(page.locator('#prevPane')).toContainText('Edited');
      await saveShortcut(page); expect(readFileSync(target, 'utf8')).toContain('Edited');

      const cleanExternal = '# Alpha\n\nClean external reload\n';
      const temp = `${target}.clean`; writeFileSync(temp, cleanExternal);
      const future = new Date(Date.now() + 1200); utimesSync(temp, future, future); renameSync(temp, target);
      await expect.poll(() => page.evaluate(() => cm.getValue()), {timeout: 7000}).toBe(cleanExternal);
      await expect(page.locator('#prevPane')).toContainText('Clean external reload');

      await page.evaluate(() => cm.setValue('# Alpha\n\nLocal dirty\n'));
      const conflictDisk = '# Alpha\n\nExternal conflict\n';
      const conflictTemp = `${target}.conflict`; writeFileSync(conflictTemp, conflictDisk);
      const later = new Date(Date.now() + 2400); utimesSync(conflictTemp, later, later); renameSync(conflictTemp, target);
      const conflict = page.waitForResponse(r => r.url().endsWith('/codesave') && r.request().method() === 'POST');
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
      await conflict;
      await expect(page.locator('#state')).toHaveClass(/conflict/);
      await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Local dirty');
      expect(readFileSync(target, 'utf8')).toContain('External conflict');
    });
  }
});

test('engine resolution precedence', async ({page}) => {
  await withProject({'sample.py': 'print(1)\n', 'note.md': '# note\n', 'main.tex': '\\section{One}\n'}, async ({url}) => {
    await page.goto(url('code_editor.html', 'sample.py'));
    await page.evaluate(() => localStorage.setItem('studioEngine', 'cm5'));
    await page.goto(url('code_editor.html', 'sample.py', '&engine=cm6')); await expectEngine(page, 'cm6');
    await page.goto(url('code_editor.html', 'sample.py')); await expectEngine(page, 'cm5');
    await page.evaluate(() => localStorage.removeItem('studioEngine'));
    await page.goto(url('code_editor.html', 'sample.py')); await expectEngine(page, 'cm6');
    await page.evaluate(() => localStorage.setItem('studioEngine', 'invalid'));
    await page.goto(url('code_editor.html', 'sample.py', '&engine=invalid')); await expectEngine(page, 'cm6');
    await page.goto(url('md_viewer.html', 'note.md', '&engine=invalid'));
    await page.locator('#mEdit').click(); await expectEngine(page, 'cm6');
    await page.goto(url('latex_studio.html', 'main.tex', '&engine=invalid')); await expectEngine(page, 'cm6');
  });
});

test('CM6 applique le thème Atelier et une vraie coloration LaTeX', async ({page}) => {
  await withProject({
    'theme.tex': '% commentaire scientifique\n\\section{Résultats}\n\\newcommand{\\glacier}{August}\n',
    'sample.py': 'def glacier(value):\n    return value * 2\n',
  }, async ({url}) => {
    await page.goto(url('latex_studio.html', 'theme.tex'));
    await expectEngine(page, 'cm6');
    const tokens = page.locator('.cm-content .cm-line span');
    await expect.poll(() => tokens.count()).toBeGreaterThan(3);
    const colors = await tokens.evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).color))]);
    expect(colors.length).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(30, 33, 38)');

    const themeTrigger = page.getByRole('button', {name: "Thème de l'éditeur"});
    await expect(themeTrigger).toBeVisible();
    await themeTrigger.click();
    const obsidian = page.getByRole('menuitemradio', {name: 'Obsidian'});
    await expect(obsidian).toBeVisible();
    await obsidian.click();
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(15, 17, 21)');
    expect(await page.evaluate(() => localStorage.getItem('atelier.editorTheme'))).toBe('obsidian');

    await page.reload();
    await expectEngine(page, 'cm6');
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(15, 17, 21)');

    await page.goto(url('code_editor.html', 'sample.py'));
    await expectEngine(page, 'cm6');
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(15, 17, 21)');
  });
});

test('latex deterministic parity', async ({page}) => {
  await withProject({'main.tex': '\\section{Alpha}\nTherefore\n\nA paragraph with enough words that deterministic rewrap can split it into multiple shorter source lines for editing.\n',
    'script.py': 'unused = 1\n'}, async ({root, url}) => {
    let quotePayload = null;
    await page.route('**/compile', route => route.fulfill({status: 200, contentType: 'application/json',
      body: JSON.stringify({ok: false, log: '! Controlled compile failure\nl.2 deterministic'})}));
    await page.route('**/quote', async route => {
      quotePayload = route.request().postDataJSON();
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, message: 'added'})});
    });
    await page.route('**/lint?**', route => route.fulfill({status: 200, contentType: 'application/json',
      body: JSON.stringify({available: true, diagnostics: [{row: 1, code: 'F841', message: 'unused'}]})}));
    await page.goto(url('latex_studio.html', 'main.tex'));
    await expectEngine(page, 'cm6');
    await page.evaluate(() => { cm.setValue('\\section{Alpha}\nTherefore'); cm.setCursor({line: 1, ch: 9}); cm.focus(); });
    await expect(page.locator('.cm-ghostText')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Therefore the');

    await page.locator('#outlineBtn').click();
    await expect(page.locator('#outline')).toHaveClass(/open/);
    await expect(page.locator('#outline')).toContainText('Alpha');

    await page.evaluate(() => cm.setSelection({line: 0, ch: 9}, {line: 0, ch: 14}));
    await expect(page.locator('#selPill')).toBeVisible();
    await page.locator('#selPill .go').click();
    await expect.poll(() => quotePayload?.text).toBe('Alpha');

    await page.evaluate(() => document.getElementById('readBtn').click());
    await expect(page.locator('#right')).toHaveClass(/reading/);
    await expect(page.locator('#texread')).toContainText('Therefore');

    await page.evaluate(() => cm.setValue('\\section{Alpha}\nA paragraph with enough words that deterministic rewrap can split it into multiple shorter source lines for editing.'));
    await page.evaluate(() => { wrapSel.value = '50'; window.__rewrapAll(); });
    await expect.poll(() => page.evaluate(() => cm.getValue().split('\n').length)).toBeGreaterThan(2);

    await page.locator('#build').click();
    await expect(page.locator('#texlog')).toHaveClass(/open/);
    await expect(page.locator('#tlBody')).toContainText('Controlled compile failure');

    await page.evaluate(() => document.getElementById('openFile').click());
    await expect(page.locator('#picker')).toHaveClass(/show/);
    await expect(page.locator('#pickerList')).toContainText('script.py');

    await page.evaluate(() => { cm.setValue('\\section{Beta}\nText\n'); cm.focus(); });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Alpha');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Beta');
    await saveShortcut(page);
    expect(readFileSync(path.join(root, 'main.tex'), 'utf8')).toContain('Beta');
    await page.goto(url('latex_studio.html', 'main.tex', '&engine=cm5')); await expectEngine(page, 'cm5');
    await page.goto(url('latex_studio.html', 'script.py'));
    await expectEngine(page, 'cm6');
    await expect(page.locator('#sbLint')).toContainText('1 ruff');
  });
});
