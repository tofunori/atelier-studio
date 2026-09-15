// Barre compacte du lecteur PDF lorsqu'il est réellement imbriqué dans Atelier.
// Le lecteur autonome ne prend pas ce chemin (`window.self === window.top`).
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { removeTempRoot } from './temp-root.js';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(GALLERY, '..');
const FIXTURE = path.join(REPO, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

async function stop(server) {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
}

let root;
let server;
let port;

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-pdf-toolbar-'));
  copyFileSync(FIXTURE, path.join(root, 'twocol.pdf'));
  writeFileSync(path.join(root, 'figures_data.json'), '{"files":[]}');
  writeFileSync(path.join(root, 'figures_index.html'), '<html></html>');
  port = await freePort();
  server = spawn(path.join(REPO, 'rust/target/debug/atelier-gallery-server'),
    ['--root', root, '--port', String(port), '--no-watch'],
    { env: { ...process.env, ATELIER_ASSETS_DIR: path.join(GALLERY, 'assets'), ATELIER_STUDIO: '1' }, stdio: 'ignore' });
  await expect.poll(() => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false),
    { timeout: 10_000 }).toBe(true);
});

test.afterAll(async () => {
  await stop(server);
  await removeTempRoot(root);
});

test('barre PDF imbriquée : 36 px, palette, menu et contrôles fonctionnels', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (/statfile|Failed to load resource/.test(message.text())) return;
    errors.push(message.text());
  });

  await page.setViewportSize({ width: 1000, height: 760 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>
    <iframe title="Lecteur PDF" src="http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf"></iframe>`);
  const reader = page.frameLocator('iframe[title="Lecteur PDF"]');
  await expect.poll(() => reader.locator('.pg canvas').first().evaluate(canvas => canvas.width).catch(() => 0),
    { timeout: 15_000 }).toBeGreaterThan(0);

  const header = reader.locator('header.pdf-compact-toolbar');
  await expect(header).toBeVisible();
  expect(await header.evaluate(element => element.getBoundingClientRect().height)).toBe(36);
  expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  const colorToggle = reader.getByRole('button', { name: 'Couleur du surlignage' });
  const palette = reader.locator('#pdf-color-palette');
  await expect(colorToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(palette).toBeHidden();
  await colorToggle.click();
  await expect(colorToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(palette).toBeVisible();
  const blue = reader.locator('.pdf-mark-color[aria-label="Bleu"]');
  await blue.click();
  await expect(blue).toHaveAttribute('aria-pressed', 'true');
  await expect(colorToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(palette).toBeHidden();

  const more = reader.locator('.pdf-toolbar-more');
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  await reader.locator('#readBtn').click();
  await expect(reader.locator('body')).toHaveClass(/read-mode/);
  await expect(reader.locator('#readBar')).toBeVisible();
  await reader.locator('#readBtn').click();
  await expect(reader.locator('body')).not.toHaveClass(/read-mode/);

  const note = reader.getByRole('button', { name: 'Ajouter une note sur la page' });
  await note.click();
  await expect(note).toHaveClass(/ton/);
  await note.click();
  await expect(note).not.toHaveClass(/ton/);

  await page.setViewportSize({ width: 360, height: 760 });
  await expect.poll(() => header.evaluate(element => element.getBoundingClientRect().width)).toBe(360);
  expect(await header.evaluate(element => element.getBoundingClientRect().height)).toBe(36);
  expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1000, height: 760 });
  await expect.poll(() => header.evaluate(element => element.getBoundingClientRect().width)).toBe(1000);
  expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('sélection PDF : le surlignage partagé conserve le texte et persiste après rechargement', async ({ page }) => {
  await page.request.post(`http://127.0.0.1:${port}/pdfannot`, { data: { rel: 'twocol.pdf', annots: [] } });
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>
    <iframe title="Lecteur PDF sélection" src="http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf"></iframe>`);
  const reader = page.frameLocator('iframe[title="Lecteur PDF sélection"]');
  await expect.poll(() => reader.locator('.pg canvas').first().evaluate(canvas => canvas.width).catch(() => 0),
    { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => reader.locator('.textLayer span').count(), { timeout: 15_000 }).toBeGreaterThan(0);

  const span = reader.locator('.textLayer span').filter({ hasText: /\S/ }).first();
  const box = await span.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + Math.min(2, Math.max(0, box.width - 1));
  const endX = box.x + Math.max(1, box.width - 2);
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 4 });
  await page.mouse.up();

  const actions = reader.locator('#selPill .atelier-highlight-actions');
  await expect(actions).toBeVisible({ timeout: 5_000 });
  await actions.getByRole('button', { name: 'Choisir la couleur du surlignage' }).click();
  await actions.getByRole('button', { name: 'Surligner en bleu' }).click();
  await expect(actions).toBeHidden();
  await expect.poll(() => reader.locator('.pdfhl').count(), { timeout: 5_000 }).toBeGreaterThan(0);
  await expect.poll(() => reader.locator('.pdfhl').first().evaluate(element => getComputedStyle(element).backgroundColor).catch(() => ''),
    { timeout: 5_000 }).toMatch(/rgba\(120,\s*170,\s*255,\s*0\.4\)/);

  // The outer page is `about:blank` after setContent; reload the iframe with a
  // cache-busting query so the viewer runs its annotation GET again.
  await page.locator('iframe[title="Lecteur PDF sélection"]').evaluate(frame => {
    const url = new URL(frame.src);
    url.searchParams.set('v', String(Date.now()));
    frame.src = url.toString();
  });
  const reloaded = page.frameLocator('iframe[title="Lecteur PDF sélection"]');
  await expect.poll(() => reloaded.locator('.pg canvas').first().evaluate(canvas => canvas.width).catch(() => 0),
    { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => reloaded.locator('.pdfhl').count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(() => reloaded.locator('.pdfhl').first().evaluate(element => getComputedStyle(element).backgroundColor).catch(() => ''),
    { timeout: 5_000 }).toMatch(/rgba\(120,\s*170,\s*255,\s*0\.4\)/);
});

test('sélection PDF : le bouton Surligner applique directement la couleur ambre', async ({ page }) => {
  await page.request.post(`http://127.0.0.1:${port}/pdfannot`, { data: { rel: 'twocol.pdf', annots: [] } });
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>
    <iframe title="Lecteur PDF ambre" src="http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf"></iframe>`);
  const reader = page.frameLocator('iframe[title="Lecteur PDF ambre"]');
  await expect.poll(() => reader.locator('.pg canvas').first().evaluate(canvas => canvas.width).catch(() => 0),
    { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => reader.locator('.textLayer span').count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const span = reader.locator('.textLayer span').filter({ hasText: /\S/ }).first();
  const box = await span.boundingBox();
  expect(box).not.toBeNull();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.max(1, box.width - 1), y, { steps: 4 });
  await page.mouse.up();
  const actions = reader.locator('#selPill .atelier-highlight-actions');
  await expect(actions).toBeVisible({ timeout: 5_000 });
  await actions.getByRole('button', { name: 'Surligner' }).click();
  await expect.poll(() => reader.locator('.pdfhl').count(), { timeout: 5_000 }).toBeGreaterThan(0);
  await expect.poll(() => reader.locator('.pdfhl').first().evaluate(element => getComputedStyle(element).backgroundColor).catch(() => ''),
    { timeout: 5_000 }).toMatch(/rgba\(255,\s*213,\s*74,\s*0\.4\)/);
});
