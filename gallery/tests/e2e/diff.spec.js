import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INITIAL_TEXT = [
  '\\section{Observations}',
  'The glacier surface stayed bright after fresh snow covered the dark ice.',
  'Summer temperatures remained moderate across the upper basin.',
  'Measured albedo declined near the exposed terminus late in the season.',
  '',
].join('\n');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForPing(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ping`);
      if (response.ok) return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`server on ${port} did not answer /ping`);
}

async function withLatexStudio(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-diff-e2e-'));
  const texPath = path.join(root, 'contract.tex');
  let server;
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'diff-e2e@atelier.test'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Atelier Diff E2E'], { cwd: root });
    writeFileSync(texPath, INITIAL_TEXT);
    execFileSync('git', ['add', 'contract.tex'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'initial latex fixture'], { cwd: root });

    const port = await freePort();
    server = spawn(process.execPath, [path.join(GALLERY, 'server', 'main.mjs')], {
      cwd: root,
      env: { ...process.env, FIG_PORT: String(port), GALLERY_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForPing(port);
    const url = `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(texPath)}&engine=cm5`;
    await run({ root, texPath, port, url });
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
    rmSync(root, { recursive: true, force: true });
  }
}

async function openEditor(page, url) {
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe('cm5');
  await expect.poll(() => page.evaluate(() => Boolean(window.cm))).toBe(true);
  await expect(page.locator('.CodeMirror')).toBeVisible();
}

async function saveOnce(page) {
  const saved = page.waitForResponse(response =>
    response.url().endsWith('/codesave') && response.request().method() === 'POST');
  await page.locator('#saveBtn').evaluate(button => button.click());
  expect((await saved).ok()).toBe(true);
  await expect(page.locator('#sbSaved')).toContainText('sauvegardé');
}

async function replaceTextAndSave(page, text) {
  await page.evaluate(nextText => {
    const cm = window.cm;
    const lastLine = cm.lastLine();
    cm.replaceRange(
      nextText,
      { line: 0, ch: 0 },
      { line: lastLine, ch: cm.getLine(lastLine).length },
      '+input',
    );
  }, text);
  await saveOnce(page);
}

async function replaceLineAndSave(page, line, text) {
  await page.evaluate(({ lineNumber, nextText }) => {
    const cm = window.cm;
    cm.replaceRange(
      nextText,
      { line: lineNumber, ch: 0 },
      { line: lineNumber, ch: cm.getLine(lineNumber).length },
      '+input',
    );
  }, { lineNumber: line, nextText: text });
  await saveOnce(page);
}

test('CM5: one multi-word save is one intervention', async ({ page }) => {
  await withLatexStudio(async ({ url }) => {
    await openEditor(page, url);
    const changed = INITIAL_TEXT.replace(
      'stayed bright after fresh snow covered the dark ice',
      'became visibly darker after wind removed most fresh snow',
    );

    await replaceTextAndSave(page, changed);
    await page.locator('#diffTag').click();

    const nav = page.locator('#dvNav');
    await expect(nav).toContainText('tout · 1');
    await nav.locator('[data-d="-1"]').click();
    await expect(nav).toContainText('1 / 1');

    await page.locator('#diffTag').click();
    await expect(nav).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.cm.getOption('readOnly'))).toBe(false);
  });
});

test('CM5: three spatially separated saves are three interventions', async ({ page }) => {
  await withLatexStudio(async ({ url }) => {
    await openEditor(page, url);

    await replaceLineAndSave(page, 1,
      'The glacier surface darkened after wind exposed the underlying ice.');
    await replaceLineAndSave(page, 2,
      'Summer temperatures increased sharply across the upper basin.');
    await replaceLineAndSave(page, 3,
      'Measured albedo recovered near the exposed terminus late in the season.');

    await page.locator('#diffTag').click();
    const nav = page.locator('#dvNav');
    const previous = nav.locator('[data-d="-1"]');
    await expect(nav).toContainText('tout · 3');

    await previous.click();
    await expect(nav).toContainText('3 / 3');
    await previous.click();
    await expect(nav).toContainText('2 / 3');
    await previous.click();
    await expect(nav).toContainText('1 / 3');

    await nav.locator('.dvNavC').click();
    await expect(nav).toContainText('tout · 3');
  });
});
