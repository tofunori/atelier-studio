// Audit du 2026-10-18, problème 7 : le panneau Bibliothèque garde un
// instantané (LIB) chargé une fois. Corriger depuis lui la note d'un AUTRE
// article ne doit pas ramener en arrière ce qui a changé ailleurs depuis
// (onglet de l'article, MCP, iPhone), ni recréer ce qui a été retiré.
import {test, expect} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mts';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(GALLERY, '..');
const FIXTURE = path.join(REPO, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');
const REL = 'zotero/ABCD1234/paper.pdf';
const OTHER = 'zotero/WXYZ9876/autre.pdf';

let root: string, appDir: string, server: import('node:child_process').ChildProcess, port: number;
const storePath = () => path.join(appDir, 'pdf_annots.json');
const readStore = () => JSON.parse(readFileSync(storePath(), 'utf8'));
const writeStore = (store: Record<string, unknown>) => {
  writeFileSync(storePath() + '.tmp', JSON.stringify(store));
  renameSync(storePath() + '.tmp', storePath());
};
const hl = (id: string, extra: Record<string, unknown> = {}) => ({id, page: 1, kind: 'hl', color: 'rgba(255,213,74,.40)',
  note: '', text: 'passage ' + id, rects: [[0.1, 0.3, 0.3, 0.012]], ...extra});

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-lib-stale-'));
  appDir = path.join(root, 'app');
  const zoteroDir = path.join(root, 'zotero');
  mkdirSync(appDir);
  for (const key of ['ABCD1234', 'WXYZ9876']) mkdirSync(path.join(zoteroDir, 'storage', key), {recursive: true});
  copyFileSync(FIXTURE, path.join(zoteroDir, 'storage/ABCD1234/paper.pdf'));
  copyFileSync(FIXTURE, path.join(zoteroDir, 'storage/WXYZ9876/autre.pdf'));
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

test('corriger une note d’un autre article ne réécrit pas son instantané périmé', async ({page}) => {
  writeStore({[REL]: [hl('mine')], [OTHER]: [
    hl('o1', {memo: 'note à corriger'}), hl('o2', {memo: 'ancienne note'}), hl('o3', {memo: 'à retirer ailleurs'})]});
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(REL)}`);
  await expect.poll(() => page.evaluate(() => ANNOTS_LOADED), {timeout: 15_000}).toBe(true);
  await page.evaluate(() => annPane.toggle());
  const pane = page.locator('#annPane');
  await pane.locator('.scope button[data-s="lib"]').click();
  await pane.locator('.art', {hasText: 'autre'}).click();
  await expect(pane.locator('.memo', {hasText: 'note à corriger'})).toBeVisible();

  // pendant que le panneau est ouvert : l'iPhone change o2, le MCP retire o3
  // et pose o4
  const store = readStore();
  store[OTHER] = [hl('o1', {memo: 'note à corriger'}), hl('o2', {memo: 'note de l’iPhone'}), hl('o4', {by: 'claude'})];
  writeStore(store);

  await pane.locator('.memo', {hasText: 'note à corriger'}).click();
  const editor = pane.locator('textarea.memo-edit');
  await editor.fill('note corrigée');
  await editor.press('Enter');

  await expect.poll(() => readStore()[OTHER].find((a: {id: string}) => a.id === 'o1')?.memo).toBe('note corrigée');
  const other = readStore()[OTHER];
  expect(other.map((a: {id: string}) => a.id).sort()).toEqual(['o1', 'o2', 'o4']);
  expect(other.find((a: {id: string}) => a.id === 'o2').memo).toBe('note de l’iPhone');
  // l'instantané du panneau suit la relecture
  await expect(pane.locator('.memo', {hasText: 'à retirer ailleurs'})).toHaveCount(0);
});

test('une suppression ratée depuis la Bibliothèque remet la ligne et se signale', async ({page}) => {
  writeStore({[REL]: [hl('mine')], [OTHER]: [hl('o1', {memo: 'à garder'})]});
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(REL)}`);
  await expect.poll(() => page.evaluate(() => ANNOTS_LOADED), {timeout: 15_000}).toBe(true);
  await page.evaluate(() => annPane.toggle());
  const pane = page.locator('#annPane');
  await pane.locator('.scope button[data-s="lib"]').click();
  await pane.locator('.art', {hasText: 'autre'}).click();
  await expect(pane.locator('.memo', {hasText: 'à garder'})).toBeVisible();
  await page.route(url => url.pathname === '/pdfannot', route =>
    route.request().method() === 'POST' ? route.fulfill({status: 500, body: '{"error":"disque"}'}) : route.continue());
  const row = pane.locator('.it', {hasText: 'à garder'});
  await row.locator('.act.danger').click();
  await expect(pane.locator('.memo', {hasText: 'à garder'})).toBeVisible();
  await expect(page.locator('#status')).toContainText('Suppression non enregistrée');
  expect(readStore()[OTHER].map((a: {id: string}) => a.id)).toEqual(['o1']);
});
