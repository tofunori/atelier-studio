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
  await withProject({'note.md': '# Alpha\n\nInitial\n'}, async ({root, url}) => {
    await page.goto(url('md_viewer.html', 'note.md'));
    await expect(page.locator('#prevPane')).toContainText('Initial');
    await page.locator('#mSplit').click(); await expectEngine(page, 'cm6');
    await page.evaluate(() => cm.setValue('# Alpha\n\nEdited\n'));
    await expect(page.locator('#prevPane')).toContainText('Edited');
    await page.locator('#mEdit').click(); await expect(page.locator('#prevPane')).not.toBeVisible();
    await saveShortcut(page);
    expect(readFileSync(path.join(root, 'note.md'), 'utf8')).toContain('Edited');
    await page.locator('#mPrev').click(); await expect(page.locator('#prevPane')).toBeVisible();
    await page.goto(url('md_viewer.html', 'note.md', '&engine=cm5'));
    await page.locator('#mEdit').click(); await expectEngine(page, 'cm5');
  });
});

test('engine resolution precedence', async ({page}) => {
  await withProject({'sample.py': 'print(1)\n'}, async ({url}) => {
    await page.goto(url('code_editor.html', 'sample.py'));
    await page.evaluate(() => localStorage.setItem('studioEngine', 'cm5'));
    await page.goto(url('code_editor.html', 'sample.py', '&engine=cm6')); await expectEngine(page, 'cm6');
    await page.goto(url('code_editor.html', 'sample.py')); await expectEngine(page, 'cm5');
    await page.evaluate(() => localStorage.removeItem('studioEngine'));
    await page.goto(url('code_editor.html', 'sample.py')); await expectEngine(page, 'cm6');
  });
});

test('latex deterministic parity', async ({page}) => {
  await withProject({'main.tex': '\\section{Alpha}\nText\n'}, async ({root, url}) => {
    await page.goto(url('latex_studio.html', 'main.tex'));
    await expectEngine(page, 'cm6');
    await page.evaluate(() => { cm.setValue('\\section{Beta}\nText\n'); cm.focus(); });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Alpha');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Beta');
    await saveShortcut(page);
    expect(readFileSync(path.join(root, 'main.tex'), 'utf8')).toContain('Beta');
    await page.goto(url('latex_studio.html', 'main.tex', '&engine=cm5')); await expectEngine(page, 'cm5');
  });
});
