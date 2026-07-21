import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, renameSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {removeTempRoot} from './temp-root.js';

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

async function withLongLatex(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-editor-scroll-'));
  const target = path.join(root, 'main.tex');
  const lines = Array.from({length: 700}, (_, index) =>
    `Line ${index + 1}: alpha beta gamma delta epsilon`).join('\n') + '\n';
  let server;
  try {
    writeFileSync(target, lines);
    const port = await freePort();
    server = spawn(process.execPath, [path.join(GALLERY, 'server', 'main.mjs')], {
      cwd: root, env: {...process.env, FIG_PORT: String(port), GALLERY_ROOT: root}, stdio: 'ignore',
    });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({
      root, target, lines,
      url: `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(target)}&engine=cm6`,
    });
  } finally { await stop(server); await removeTempRoot(root); }
}

async function waitForEditor(page) {
  await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe('cm6');
  await expect(page.locator('.cm-editor')).toBeVisible();
}

async function firstPointerSelection(page, line = 450) {
  await page.evaluate((targetLine) => cm.scrollIntoView({line: targetLine, ch: 0}, 80), line);
  await expect.poll(() => page.evaluate(() => cm.getScrollInfo().top)).toBeGreaterThan(4000);
  await page.locator('#moreBtn').focus();
  const points = await page.evaluate((targetLine) => ({
    from: cm.charCoords({line: targetLine, ch: 10}, 'window'),
    to: cm.charCoords({line: targetLine, ch: 28}, 'window'),
  }), line);
  const before = await page.evaluate(() => cm.getScrollInfo().top);
  await page.mouse.move(points.from.left, (points.from.top + points.from.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move(points.to.left, (points.to.top + points.to.bottom) / 2, {steps: 8});
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => cm.getSelection().length)).toBeGreaterThan(5);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => cm.getScrollInfo().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  return {before, after};
}

test('first pointer selection in a long unfocused LaTeX document keeps the viewport', async ({page}) => {
  await withLongLatex(async ({url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await firstPointerSelection(page);
    await expect(page.locator('.cm-clsel')).toBeVisible();
  });
});

test('CM5 range-shaped scrollIntoView targets the range instead of line zero', async ({page}) => {
  await withLongLatex(async ({url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await page.evaluate(() => cm.scrollIntoView({
      from: {line: 520, ch: 5}, to: {line: 520, ch: 28},
    }, 80));
    await expect.poll(() => page.evaluate(() => cm.getScrollInfo().top)).toBeGreaterThan(8000);
    const coords = await page.evaluate(() => cm.charCoords({line: 520, ch: 12}, 'window'));
    expect(coords.top).toBeGreaterThan(70);
    expect(coords.bottom).toBeLessThan(760);
  });
});

test('external full-document reload preserves selection and never emits a top reset', async ({page}) => {
  await withLongLatex(async ({target, lines, url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await firstPointerSelection(page, 480);
    await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller');
      window.__scrollTrace = [];
      scroller.addEventListener('scroll', () => window.__scrollTrace.push(scroller.scrollTop));
    });
    const replacement = lines.replace('Line 20:', 'Line 20 externally updated:');
    const temp = `${target}.external`;
    writeFileSync(temp, replacement);
    const future = new Date(Date.now() + 1600); utimesSync(temp, future, future); renameSync(temp, target);
    await expect.poll(() => page.evaluate(() => cm.getValue().includes('externally updated')), {timeout: 7000}).toBe(true);
    const state = await page.evaluate(() => ({
      top: cm.getScrollInfo().top,
      from: cm.getCursor('from'),
      selection: cm.getSelection(),
      trace: window.__scrollTrace,
    }));
    expect(state.top).toBeGreaterThan(8000);
    expect(state.from.line).toBe(480);
    expect(state.selection.length).toBeGreaterThan(5);
    expect(state.trace.every(value => value > 8000)).toBe(true);
  });
});
