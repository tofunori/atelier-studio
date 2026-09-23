// Surlignages posés hors du lecteur (outil highlight_passage du MCP
// atelier-annotations, autre fenêtre) : le lecteur ouvert les affiche sans
// rechargement, et sa propre sauvegarde ne les efface plus.
import {test, expect} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mjs';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {removeTempRoot} from './temp-root.js';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(GALLERY, '..');
const FIXTURE = path.join(REPO, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');
const REL = 'zotero/ABCD1234/paper.pdf';

let root, appDir, zoteroDir, server, port;

function writeStore(annots) {
  // même forme que l'écriture du MCP : le fichier entier remplacé d'un bloc
  const store = path.join(appDir, 'pdf_annots.json');
  let current = {};
  try { current = JSON.parse(readFileSync(store, 'utf8')); } catch {}
  current[REL] = [...(current[REL] || []), ...annots];
  writeFileSync(store + '.tmp', JSON.stringify(current));
  renameSync(store + '.tmp', store);
}

const claudeHl = (id, y) => ({id, page: 1, kind: 'hl', by: 'claude', color: 'rgba(120,220,140,.40)',
  note: '', text: 'passage ' + id, rects: [[0.1, y, 0.3, 0.012]]});

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-live-annots-'));
  appDir = path.join(root, 'app');
  zoteroDir = path.join(root, 'zotero');
  mkdirSync(appDir);
  mkdirSync(path.join(zoteroDir, 'storage/ABCD1234'), {recursive: true});
  copyFileSync(FIXTURE, path.join(zoteroDir, 'storage/ABCD1234/paper.pdf'));
  const project = path.join(root, 'project');
  mkdirSync(project);
  writeFileSync(path.join(project, 'figures_data.json'), '{"files":[]}');
  writeFileSync(path.join(project, 'figures_index.html'), '<html></html>');
  port = await freePort();
  server = spawnGalleryServer({root: project, port, watch: false,
    env: {ATELIER_STUDIO: '1', ATELIER_APP_DIR: appDir, ATELIER_ZOTERO_DIR: zoteroDir}});
  await expect.poll(() => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false),
    {timeout: 10_000}).toBe(true);
});

test.afterAll(async () => { await stop(server); await removeTempRoot(root); });

test('un surlignage écrit dans le store apparaît en direct et survit à la sauvegarde du lecteur', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(REL)}`);
  await expect.poll(() => page.locator('.pg[data-page="1"] canvas').evaluate(c => c.width).catch(() => 0),
    {timeout: 15_000}).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => ANNOTS_LOADED)).toBe(true);

  // 1. posé par Claude pendant la lecture : affiché sans recharger
  writeStore([claudeHl('claude-1', 0.3)]);
  await expect(page.locator('.pg[data-page="1"] .pdfhl[data-aid="claude-1"]').first())
    .toBeAttached({timeout: 8_000});

  // 2. un second, puis une sauvegarde du lecteur AVANT qu'il ne l'ait vu :
  //    le serveur le garde (le lecteur ne l'a jamais vu, `known`)
  writeStore([claudeHl('claude-2', 0.5)]);
  await page.evaluate(() => {
    PDF_ANNOTS.push({id: 'local-1', page: 1, kind: 'hl', color: 'rgba(255,213,74,.40)', note: '',
      text: 'local', rects: [[0.1, 0.7, 0.3, 0.012]]});
    return saveAnnots();
  });
  const saved = await page.evaluate(async rel =>
    (await fetch('/pdfannot?rel=' + encodeURIComponent(rel)).then(r => r.json())).annots.map(a => a.id), REL);
  expect(saved.sort()).toEqual(['claude-1', 'claude-2', 'local-1']);
  await expect(page.locator('.pg[data-page="1"] .pdfhl[data-aid="claude-2"]').first())
    .toBeAttached({timeout: 8_000});

  // 3. supprimé depuis le lecteur : il disparaît du store et ne revient pas
  await page.evaluate(() => removeAnnot(PDF_ANNOTS.find(a => a.id === 'claude-1')));
  await page.waitForTimeout(3_000);
  const after = await page.evaluate(async rel =>
    (await fetch('/pdfannot?rel=' + encodeURIComponent(rel)).then(r => r.json())).annots.map(a => a.id), REL);
  expect(after.sort()).toEqual(['claude-2', 'local-1']);
  await expect(page.locator('.pdfhl[data-aid="claude-1"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});
