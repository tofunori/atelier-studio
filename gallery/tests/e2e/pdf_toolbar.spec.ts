// Barre compacte du lecteur PDF lorsqu'il est réellement imbriqué dans Atelier.
// Le lecteur autonome ne prend pas ce chemin (`window.self === window.top`).
import { test, expect } from '@playwright/test';
import { ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { build } from 'esbuild';
import { removeTempRoot } from './temp-root.ts';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(GALLERY, '..');
const FIXTURE = path.join(REPO, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');
const coreBundle = (await build({entryPoints: [path.join(GALLERY, 'src/studio/core/index.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'AtelierStudioCore'})).outputFiles[0].text;

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const socket = net.createServer();
    socket.unref();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = (socket.address() as import("node:net").AddressInfo);
      socket.close(() => resolve(port));
    });
  });
}

async function stop(server: ChildProcess) {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
}

let root: string;
let server: ChildProcess;
let port: number;

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

test.beforeEach(async ({ page }) => {
  await page.route('**/studio_core.bundle.js', route => route.fulfill({contentType: 'text/javascript', body: coreBundle}));
  // Give the host a real origin: an opaque about:blank parent can deny the
  // reader's localStorage in browsers that block third-party storage.
  await page.goto(`http://127.0.0.1:${port}/figures_index.html`);
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
  await expect.poll(() => reader.locator('.pg canvas').first().evaluate(canvas => (canvas as HTMLCanvasElement).width).catch(() => 0),
    { timeout: 15_000 }).toBeGreaterThan(0);

  const header = reader.locator('header.pdf-compact-toolbar');
  await expect(header).toBeVisible();
  expect(await header.evaluate(element => element.getBoundingClientRect().height)).toBe(36);
  expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  // Barres de défilement « toujours affichées » (macOS) : la gouttière native
  // claire recouvrait le ⋯ et la page glissait dessous. Le document imbriqué
  // n'en dessine aucune, et le ⋯ tient dans la zone visible.
  const fit = await header.evaluate(() => ({
    scrollbar: getComputedStyle(document.documentElement).scrollbarWidth,
    overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
    gutter: window.innerWidth - document.documentElement.clientWidth,
    moreRight: document.querySelector('.pdf-toolbar-more summary').getBoundingClientRect().right,
    visibleRight: document.documentElement.clientWidth,
  }));
  expect(fit.scrollbar).toBe('none');
  // Rebond élastique de macOS en bout de document : il détachait la barre.
  expect(fit.overscroll).toBe('none');
  expect(fit.gutter).toBe(0);
  expect(fit.moreRight).toBeLessThanOrEqual(fit.visibleRight);

  // navigation de page : ‹ 1 / N › suit le défilement, saut par champ
  const pageNav = reader.locator('.pdf-page-nav');
  await expect(pageNav).toBeVisible();
  const total = await reader.locator('.pg').count();
  expect(total).toBeGreaterThan(1);
  await expect(reader.locator('#pgTotalN')).toHaveText(String(total));
  await expect(reader.locator('#pgCurN')).toHaveText('1');
  await reader.locator('#pgNext').click();
  await expect(reader.locator('#pgCurN')).toHaveText('2');
  await reader.locator('#pgPrev').click();
  await expect(reader.locator('#pgCurN')).toHaveText('1');
  await reader.locator('#pgCur').click();
  const pgInput = reader.locator('#pgInput');
  await expect(pgInput).toBeVisible();
  await pgInput.fill(String(total));
  await pgInput.press('Enter');
  await expect(pgInput).toBeHidden();
  await expect(reader.locator('#pgCurN')).toHaveText(String(total));
  await reader.locator('#pgCur').click();
  await pgInput.fill('1');
  await pgInput.press('Enter');
  await expect(reader.locator('#pgCurN')).toHaveText('1');
  // les flèches d'annotations vivent désormais dans le menu ⋯
  expect(await reader.locator('.pdf-toolbar-nav #annPrev').count()).toBe(0);
  expect(await reader.locator('.pdf-toolbar-menu #annPrev').count()).toBe(1);

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
  // Chaque rangée du menu tient sur une ligne, icône à gauche : #invBtn et
  // #readBtn gardaient leur gabarit 26 px de la barre autonome (libellé coupé).
  const menuRows = await reader.locator('.pdf-toolbar-menu button').evaluateAll(buttons => buttons
    .filter(button => (button as HTMLElement).offsetParent)
    .map(button => {
      const rect = button.getBoundingClientRect();
      const label = button.querySelector('span');
      const icon = button.querySelector('svg');
      return { id: button.id, width: rect.width, height: rect.height,
        labelLines: label.getClientRects().length, labelHeight: label.getBoundingClientRect().height,
        iconOffset: icon.getBoundingClientRect().left - rect.left };
    }));
  expect(menuRows.map(row => row.id)).toEqual(expect.arrayContaining(['invBtn', 'readBtn']));
  const rowWidth = menuRows[0].width;
  for (const row of menuRows) {
    // toBeCloseTo : le zoom de la page donne des hauteurs à 31.999996 px.
    expect(row.width, row.id).toBeCloseTo(rowWidth, 1);
    expect(row.height, row.id).toBeCloseTo(32, 1);
    expect(row.labelLines, row.id).toBe(1);
    expect(row.labelHeight, row.id).toBeLessThan(20);
    expect(row.iconOffset, row.id).toBeCloseTo(menuRows[0].iconOffset, 1);
  }
  await reader.locator('#readBtn').click();
  await expect(reader.locator('body')).toHaveClass(/read-mode/);
  await expect(reader.locator('#readBar')).toBeVisible();
  await reader.locator('#readBtn').click();
  await expect(reader.locator('body')).not.toHaveClass(/read-mode/);

  // « Joindre le PDF au chat » : un seul message à l'hôte, avec le chemin du lecteur.
  await reader.locator('body').evaluate(() => { window.__atelierNonce = 'toolbar-test'; });
  await page.evaluate(() => {
    window.__attachMessages = [];
    window.addEventListener('message', event => {
      if (event.data?.type === 'atelier-attach-pdf') {
        window.__attachMessages.push(event.data);
        (event.source as Window).postMessage({type: 'atelier-add-to-chat-ack', requestId: event.data.requestId,
          nonce: event.data.nonce, ok: true}, '*');
      }
    });
  });
  const chatButton = reader.getByRole('button', { name: 'Joindre le PDF au chat' });
  await expect(chatButton).toBeVisible();
  await chatButton.click();
  await expect.poll(() => page.evaluate(() => window.__attachMessages.map((m) => m.rel))).toEqual(['twocol.pdf']);
  // Aucun texte : une coche remplace brièvement l'icône, puis tout revient.
  await expect(chatButton).toHaveClass(/done/);
  await expect(chatButton.locator('.ci-done')).toBeVisible();
  await expect(chatButton).toHaveText('');
  await expect(reader.locator('#status')).toHaveText('');
  await expect(chatButton).not.toHaveClass(/done/, { timeout: 3_000 });
  await expect(chatButton.locator('.ci-idle')).toBeVisible();

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

test('recherche PDF : loupe, navigation, réouverture et raccourcis', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>
    <iframe title="Recherche PDF" src="http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf"></iframe>`);
  const reader = page.frameLocator('iframe');
  await expect.poll(() => reader.locator('.textLayer span').count()).toBeGreaterThan(0);
  const button = reader.getByRole('button', { name: 'Rechercher dans l’article' });
  const input = reader.getByRole('textbox', { name: 'Rechercher dans l’article' });
  const count = reader.locator('#findBar .cnt');
  await expect(button).toBeVisible();
  await button.click();
  await expect(input).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await input.fill('glaciers');
  await expect(count).toHaveText(/^1\/\d+$/);
  const total = Number((await count.textContent()).split('/')[1]);
  expect(total).toBeGreaterThan(1);
  await reader.getByRole('button', { name: 'Résultat suivant' }).click();
  await expect(count).toHaveText(`2/${total}`);
  await reader.getByRole('button', { name: 'Résultat précédent' }).click();
  await expect(count).toHaveText(`1/${total}`);
  await input.press('Shift+Enter');
  await expect(count).toHaveText(`${total}/${total}`);
  await input.press('Enter');
  await expect(count).toHaveText(`1/${total}`);
  await expect(reader.locator('.find-cur').first()).toBeInViewport();
  await input.press('Escape');
  await expect(input).toBeHidden();
  await expect(button).toBeFocused();
  await expect(reader.locator('.find-hit, .find-cur')).toHaveCount(0);
  await button.click();
  await expect(input).toHaveValue('glaciers');
  await expect(count).toHaveText(`1/${total}`);
  await input.fill('zzzzintrouvable');
  await expect(count).toHaveText('aucun');
  await expect(reader.getByRole('button', { name: 'Résultat suivant' })).toBeDisabled();
  // Closing during the debounce must not paint hidden search results.
  await input.fill('glaciers');
  await input.press('Escape');
  await expect(count).toHaveText('');
  await button.press('Meta+f');
  await expect(input).toBeFocused();
  await expect(count).toHaveText(`1/${total}`);
  await page.setViewportSize({ width: 360, height: 760 });
  await expect(reader.locator('#findBar')).toBeInViewport();
  expect(await reader.locator('#findBar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await reader.getByRole('button', { name: 'Fermer la recherche' }).click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.press('Control+f');
  await expect(input).toBeFocused();
});

test('zoom PDF : les deux bords restent accessibles et la barre reste visible', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 650 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>
    <iframe title="PDF zoom" src="http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf"></iframe>`);
  const reader = page.frameLocator('iframe');
  const pg = reader.locator('.pg').first();
  await expect.poll(() => reader.locator('.pg canvas').first().evaluate(canvas => (canvas as HTMLCanvasElement).width).catch(() => 0)).toBeGreaterThan(0);
  await reader.locator('#zIn').click();
  await reader.locator('#zIn').click();
  await expect(reader.locator('#zPct')).toHaveText('144%');
  await expect.poll(() => pg.evaluate(el => (el as HTMLElement).offsetWidth)).toBeGreaterThan(1000);
  await expect.poll(() => reader.locator('#pages').evaluate(el => el.style.transform)).toBe('');
  expect(await pg.evaluate(el => el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
  // A horizontal trackpad gesture must reach the right column without
  // moving the toolbar off screen; vertical reading still works afterwards.
  await page.mouse.move(400, 400);
  await page.mouse.wheel(1400, 0);
  await expect.poll(() => pg.evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(800);
  const header = reader.locator('header');
  expect(await header.evaluate(el => Math.abs(el.getBoundingClientRect().left))).toBeLessThan(1);
  await expect(reader.locator('#zIn')).toBeInViewport();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => pg.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(0);
  await page.mouse.wheel(-1400, 0);
  await expect.poll(() => pg.evaluate(el => el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
  await reader.locator('#zPct').click();
  await expect(reader.locator('#zPct')).toHaveText('100%');
  await expect.poll(() => pg.evaluate(el => (el as HTMLElement).offsetWidth)).toBeLessThan(800);
});

test('sélection PDF : le surlignage partagé conserve le texte et persiste après rechargement', async ({ page }) => {
  await page.request.post(`http://127.0.0.1:${port}/pdfannot`, { data: { rel: 'twocol.pdf', annots: [] } });
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>
    <iframe title="Lecteur PDF sélection" src="http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf"></iframe>`);
  const reader = page.frameLocator('iframe[title="Lecteur PDF sélection"]');
  await expect.poll(() => reader.locator('.pg canvas').first().evaluate(canvas => (canvas as HTMLCanvasElement).width).catch(() => 0),
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

  // Reload the iframe with a cache-busting query so the viewer runs its
  // annotation GET again.
  await page.locator('iframe[title="Lecteur PDF sélection"]').evaluate(frame => {
    const url = new URL((frame as HTMLImageElement).src);
    url.searchParams.set('v', String(Date.now()));
    (frame as HTMLImageElement).src = url.toString();
  });
  const reloaded = page.frameLocator('iframe[title="Lecteur PDF sélection"]');
  await expect.poll(() => reloaded.locator('.pg canvas').first().evaluate(canvas => (canvas as HTMLCanvasElement).width).catch(() => 0),
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
  await expect.poll(() => reader.locator('.pg canvas').first().evaluate(canvas => (canvas as HTMLCanvasElement).width).catch(() => 0),
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
