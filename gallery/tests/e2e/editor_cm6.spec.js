import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, renameSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { removeTempRoot } from './temp-root.js';

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
  } finally { await stop(server); await removeTempRoot(root); }
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

test('CM6 propose huit vrais thèmes sombres et les persiste entre éditeurs', async ({page}) => {
  await withProject({
    'theme.tex': '% commentaire scientifique\n\\section{Résultats}\n\\newcommand{\\glacier}{August}\n',
    'sample.py': 'import math\n# scientific comment\ndef glacier(value: float):\n    label = "August"\n    return math.sqrt(value) * 2\n',
  }, async ({url}) => {
    await page.goto(url('latex_studio.html', 'theme.tex'));
    await expectEngine(page, 'cm6');
    const tokens = page.locator('.cm-content .cm-line span');
    await expect.poll(() => tokens.count()).toBeGreaterThan(3);
    const colors = await tokens.evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).color))]);
    expect(colors.length).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(30, 33, 38)');

    const themeTrigger = page.getByRole('button', {name: "Thème de l'éditeur"});
    await expect(themeTrigger).toBeVisible();
    const themeCases = [
      ['Atelier', 'rgb(30, 33, 38)'],
      ['VS Code Dark+', 'rgb(30, 30, 30)'],
      ['Nord', 'rgb(46, 52, 64)'],
      ['Monokai', 'rgb(39, 40, 34)'],
      ['Gruvbox Dark', 'rgb(40, 40, 40)'],
      ['Material Ocean', 'rgb(46, 50, 53)'],
      ['Solarized Dark', 'rgb(0, 43, 54)'],
      ['Dracula', 'rgb(40, 42, 54)'],
    ];
    for (const [label, background] of themeCases) {
      await themeTrigger.click();
      await expect(page.getByRole('menuitemradio')).toHaveCount(8);
      await page.getByRole('menuitemradio', {name: label, exact: true}).click();
      await expect(page.locator('.cm-editor')).toHaveCSS('background-color', background);
    }
    expect(await page.evaluate(() => localStorage.getItem('atelier.editorTheme'))).toBe('dracula');

    await page.reload();
    await expectEngine(page, 'cm6');
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(40, 42, 54)');

    await page.goto(url('code_editor.html', 'sample.py'));
    await expectEngine(page, 'cm6');
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(40, 42, 54)');
    const codeColors = await page.locator('.cm-content .cm-line span').evaluateAll(nodes =>
      [...new Set(nodes.map(node => getComputedStyle(node).color))]);
    expect(codeColors.length).toBeGreaterThanOrEqual(5);
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

    await page.locator('#moreBtn').click();
    await page.locator('#morePop [data-act="outline"]').click();
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

test('latex auto rewrap saves numbered physical lines that fit the window', async ({page}) => {
  const paragraph = 'Wildfire carbon deposition is measured across many glacier pixels and compared with local climate controls so that a narrow editor still keeps every physical source line visible without a second visual continuation row.';
  await withProject({'wrap.tex': `\\section{Results}\n${paragraph}\n`}, async ({root, url}) => {
    await page.setViewportSize({width: 772, height: 926});
    await page.goto(url('latex_studio.html', 'wrap.tex'));
    await expectEngine(page, 'cm6');
    await expect(page.locator('#sbRewrap')).toHaveText('Rewrap: off');
    expect(await page.evaluate(() => localStorage.getItem('texAutoRewrap'))).toBeNull();
    await page.locator('#sbRewrap').click();
    await expect(page.locator('#sbRewrap')).toHaveText('Rewrap: auto');

    await page.evaluate(text => cm.setValue(`\\section{Results}\n${text}\n`), paragraph);
    await saveShortcut(page);
    const savedLines = readFileSync(path.join(root, 'wrap.tex'), 'utf8').trimEnd().split('\n');
    expect(savedLines.length).toBeGreaterThan(3);
    expect(Math.max(...savedLines.map(line => line.length))).toBeLessThanOrEqual(90);
    await expect.poll(() => page.evaluate(() => {
      const rows = [...document.querySelectorAll('.cm-line')];
      if (!rows.length) return -1;
      const base = rows.find(row => row.textContent)?.getBoundingClientRect().height || 0;
      return rows.filter(row => row.getBoundingClientRect().height > base * 1.5).length;
    })).toBe(0);
    const numbered = await page.evaluate(() => [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
      .filter(node => getComputedStyle(node).visibility !== 'hidden')
      .map(node => node.textContent?.trim() || '').filter(value => /^\d+$/.test(value)).length);
    expect(numbered).toBe(await page.evaluate(() => cm.lineCount()));

    await page.locator('#sbRewrap').click();
    await expect(page.locator('#sbRewrap')).toHaveText('Rewrap: off');
    expect(await page.evaluate(() => localStorage.getItem('texAutoRewrap'))).toBe('0');
  });
});

test('latex anchored comments persist through the typed controller in CM5 and CM6', async ({page}) => {
  for (const engine of ['cm5', 'cm6']) {
    await withProject({'comments.tex': '\\section{Review}\nAnchored comment text\n'}, async ({url}) => {
      await page.goto(url('latex_studio.html', 'comments.tex', `&engine=${engine}`));
      await expectEngine(page, engine);
      await page.evaluate(() => texcOpen({
        from: {line: 1, ch: 0}, to: {line: 1, ch: 8}, text: 'Anchored',
      }));
      await expect(page.locator('#texcPop')).toBeVisible();
      await page.locator('#texcPop textarea').fill('Vérifier ce passage');
      const saved = page.waitForResponse(response => response.url().includes('/pdfannot')
        && response.request().method() === 'POST');
      await page.locator('#texcPop .tc-save').click();
      expect((await saved).ok()).toBe(true);
      await expect(page.locator('.texc-hl')).toBeVisible();
      await page.locator('#texcBtn').click();
      await expect(page.locator('#texcPanel')).toContainText('Vérifier ce passage');
    });
  }
});
