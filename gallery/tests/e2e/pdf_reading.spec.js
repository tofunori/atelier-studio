// Mode lecture du lecteur PDF : colonne, découpe, typographie, recherche,
// annotation aller-retour. Rejoué en WebKit (moteur du WKWebView).
import {test, expect} from '@playwright/test';
import { spawnGalleryServer } from '../gallery_server.mjs';
import {mkdtempSync, writeFileSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {removeTempRoot} from './temp-root.js';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(GALLERY, '..');
const FIXTURE = path.join(REPO, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');
const SHOT = process.env.PDF_READING_SHOT || '';

function freePort(){
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref(); socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => { const {port} = socket.address(); socket.close(() => resolve(port)); });
  });
}

async function stop(server){
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
}

let root, server, port;

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-reading-'));
  copyFileSync(FIXTURE, path.join(root, 'twocol.pdf'));
  writeFileSync(path.join(root, 'figures_data.json'), '{"files":[]}');
  writeFileSync(path.join(root, 'figures_index.html'), '<html></html>');
  port = await freePort();
  server = spawnGalleryServer({ root, port, env: { ATELIER_STUDIO: '1' }, watch: false });
  // Le premier /reflow spawne pdftohtml : on attend d'abord que le serveur écoute.
  await expect.poll(() => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false),
    {timeout: 10_000}).toBe(true);
});

test.afterAll(async () => { await stop(server); await removeTempRoot(root); });

test('un lien PDF avec page seule défile jusqu’à cette page', async ({page}) => {
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf&page=2`);
  await expect.poll(() => page.locator('.pg[data-page="2"] canvas').evaluate(c => c.width).catch(() => 0),
    {timeout: 15_000}).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page.locator('#status')).toHaveText('Page 2');
});

test('la page cible est stricte et bornée au document', async ({page}) => {
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf&page=999`);
  await expect.poll(() => page.evaluate(() => window.scrollY), {timeout: 15_000}).toBeGreaterThan(0);
  await expect(page.locator('#status')).toHaveText('Page 2');

  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf&page=2abc`);
  await expect.poll(() => page.locator('.pg[data-page="1"] canvas').evaluate(c => c.width).catch(() => 0),
    {timeout: 15_000}).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('#status')).not.toHaveText('Page 2');
});

test('mode lecture : colonne, découpe, taille, recherche, annotation aller-retour', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // WebKit ne nomme PAS l'URL dans « Failed to load resource » : on filtre ce
  // message générique côté console et on vérifie séparément la liste des
  // requêtes en échec — seule la sonde /statfile (findTexSource cherche la
  // source LaTeX du PDF, absente ici) a le droit d'échouer.
  const failed = [];
  page.on('response', r => { if (r.status() >= 400) failed.push(new URL(r.url()).pathname); });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/statfile|Failed to load resource/.test(m.text())) return;
    errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf`);
  await expect.poll(() => page.locator('.pg canvas').first().evaluate(c => c.width).catch(() => 0),
    {timeout: 15_000}).toBeGreaterThan(0);

  // --- entrée en mode lecture : colonne, titres, prose --------------------
  await page.click('#readBtn');
  await expect(page.locator('body')).toHaveClass(/read-mode/);
  await expect(page.locator('#readBar')).toBeVisible();
  await expect(page.locator('#readBody h1, #readBody h2').first()).toBeVisible({timeout: 10_000});
  await expect(page.locator('#readBody p').first()).toContainText(/albedo/i, {timeout: 10_000});
  // les pages sont masquées : la colonne remplace vraiment la vue paginée
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('pages')).display)).toBe('none');

  // --- découpe de figure peinte à l'approche (IntersectionObserver) -------
  const fig = page.locator('#readBody figure canvas').first();
  await fig.scrollIntoViewIfNeeded();
  await expect.poll(() => fig.evaluate(c => c.width), {timeout: 10_000}).toBeGreaterThan(0);

  // --- typographie : taille persistée dans localStorage ------------------
  await page.click('#readBar .fsp');
  expect(await page.evaluate(() => localStorage.getItem('pdfRead.fs'))).toBe('16');
  // `font-size` transitionne en 150 ms (système de design) : la valeur calculée
  // est interpolée juste après le clic — on attend la fin de la transition.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('reading')).fontSize))
    .toBe('16px');
  expect(await page.textContent('#readBar .fsv')).toBe('16');
  await page.click('#readBar .grp[data-set="font"] button[data-v="serif"]');
  expect(await page.evaluate(() => localStorage.getItem('pdfRead.font'))).toBe('serif');
  await expect(page.locator('#reading')).toHaveClass(/serif/);

  // --- recherche dans la colonne -----------------------------------------
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  await expect(page.locator('#findBar input')).toBeVisible();
  await page.fill('#findBar input', 'glaciers');
  await expect(page.locator('#findBar .cnt')).toHaveText(/\d+\/\d+/, {timeout: 10_000});
  await expect(page.locator('#readBody .find-hit, #readBody .find-cur').first()).toBeAttached();
  await page.keyboard.press('Escape');

  if (SHOT) await page.screenshot({path: SHOT, fullPage: false});

  // --- annotation depuis la colonne --------------------------------------
  const paragraph = page.locator('#readBody p:not(.caption):not(.footnote)').first();
  await paragraph.scrollIntoViewIfNeeded();
  const picked = await paragraph.evaluate(el => {
    const node = el.firstChild;
    const range = document.createRange();
    range.setStart(node, 0); range.setEnd(node, Math.min(30, node.textContent.length));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    return range.toString();
  });
  expect(picked.length).toBeGreaterThan(20);
  await page.evaluate(() => window.addHighlightFromReadingSel('comment'));
  await expect(page.locator('#readBody mark.pdfhl')).toHaveCount(1);
  await expect(page.locator('#readBody mark.pdfhl')).toHaveText(picked);

  // Une annotation `comment` toute fraîche ouvre l'éditeur de note et serait
  // ABANDONNÉE si elle se fermait sans note (annotMenu, branche `a.fresh`) :
  // on la valide comme le ferait l'utilisateur.
  await expect(page.locator('#annotPop textarea')).toBeVisible();
  await page.fill('#annotPop textarea', 'note e2e');
  await page.keyboard.press('Enter');
  // Hors de l'app, l'ajout au chat échoue toujours (window.self === window.top,
  // pas de parent Tauri) : la note est enregistrée mais le menu reste ouvert.
  await expect(page.locator('#annotPop .annotation-status')).toHaveText(/enregistrée/, {timeout: 10_000});
  await page.evaluate(() => { document.getElementById('annotPop').style.display = 'none'; });

  // --- retour en vue pages : le surlignage est au bon endroit ------------
  await page.click('#readBtn');
  await expect(page.locator('body')).not.toHaveClass(/read-mode/);
  await expect(page.locator('.pg[data-page="1"] .pdfcomment')).toHaveCount(1);
  await expect(page.locator('.pg[data-page="1"] .pdfcomment-line').first()).toBeAttached();
  // et il a bien été persisté côté serveur
  const saved = await page.evaluate(async () => (await fetch('/pdfannot?rel=twocol.pdf').then(r => r.json())));
  expect(JSON.stringify(saved)).toContain('note e2e');

  expect(errors).toEqual([]);
  expect([...new Set(failed)]).toEqual(['/statfile']);
});
