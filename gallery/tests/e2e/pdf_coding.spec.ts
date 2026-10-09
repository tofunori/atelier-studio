// Codage qualitatif (façon NVivo) dans le lecteur PDF : « Coder » dans la
// capsule de sélection, menu des codes (créer, poser), bandes de codage dans
// la marge, propositions de Claude (champ `suggested`) gardées depuis la fiche.
import {test, expect, type Page} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop, serveHostPage} from '../gallery_server.mts';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import type {ChildProcess} from 'node:child_process';
import {removeTempRoot} from './temp-root.ts';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(GALLERY, '..', 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');
const REL = 'zotero/ABCD1234/paper.pdf';

let root: string, appDir: string, server: ChildProcess, port: number;

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-pdf-coding-'));
  appDir = path.join(root, 'app');
  const zoteroDir = path.join(root, 'zotero');
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

const stored = () => {
  try { return JSON.parse(readFileSync(path.join(appDir, 'pdf_annots.json'), 'utf8'))[REL] || []; }
  catch { return []; }
};

async function openPdf(page: Page) {
  const host = await serveHostPage(page, port, `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
    <iframe src="/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(REL)}#atelier_nonce=test-nonce"></iframe>`);
  await page.goto(host);
  const reader = page.frameLocator('iframe');
  await expect.poll(() => reader.locator('.pg[data-page="1"] .textLayer span').count(), {timeout: 15_000}).toBeGreaterThan(0);
  await expect.poll(() => reader.locator('body').evaluate(() => ANNOTS_LOADED)).toBe(true);
  return reader;
}

async function selectSpan(page: Page, reader: ReturnType<Page['frameLocator']>, index: number) {
  const box = await reader.locator('.pg[data-page="1"] .textLayer span').nth(index).boundingBox();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, {steps: 8});
  await page.mouse.up();
  await expect(reader.locator('#selPill .atelier-capsule[aria-label="Coder"]')).toBeVisible();
}

test('coder une sélection, voir sa bande, garder la proposition de Claude', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  const reader = await openPdf(page);

  // 1. Coder → menu des codes ; Entrée sur un nom absent crée et pose le code
  await selectSpan(page, reader, 0);
  await reader.locator('#selPill .atelier-capsule[aria-label="Coder"]').click();
  const menu = reader.locator('#codeMenu');
  await expect(menu).toBeVisible();
  await expect(reader.locator('.pg[data-page="1"] .pdfhl.pdfcode')).not.toHaveCount(0);
  await menu.locator('.cm-search').fill('Albédo de neige');
  await expect(menu.locator('.mi').first()).toContainText('Créer le code « Albédo de neige »');
  await menu.locator('.cm-search').press('Enter');
  await expect.poll(() => stored().length).toBe(1);
  const [passage] = stored();
  expect(passage.kind).toBe('code');
  expect(passage.color).toBeUndefined();
  const book = await (await fetch(`http://127.0.0.1:${port}/codebook`)).json();
  expect(book.codes.map((c: {name: string}) => c.name)).toEqual(['Albédo de neige']);
  expect(passage.codes).toEqual([book.codes[0].id]);
  // le code posé est coché ; la recherche sans accents le retrouve
  await menu.locator('.cm-search').fill('albedo');
  await expect(menu.locator('.mi[aria-checked="true"]')).toHaveText('Albédo de neige');
  await menu.locator('.cm-search').press('Escape');
  await expect(menu).toBeHidden();
  await expect(reader.locator(`.pg[data-page="1"] .pdfstripe[data-aid="${passage.id}"]`)).toHaveCount(1);

  // 2. Claude propose un second code (MCP code_passages) : pointillé
  const created = await (await fetch(`http://127.0.0.1:${port}/codebook`, {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op: 'create', name: 'Méthode'})})).json();
  const methode = created.code.id;
  const store = JSON.parse(readFileSync(path.join(appDir, 'pdf_annots.json'), 'utf8'));
  store[REL][0].suggested = [methode];
  writeFileSync(path.join(appDir, 'pdf_annots.json.tmp'), JSON.stringify(store));
  renameSync(path.join(appDir, 'pdf_annots.json.tmp'), path.join(appDir, 'pdf_annots.json'));
  const pending = reader.locator(`.pg[data-page="1"] .pdfstripe.is-suggested[data-aid="${passage.id}"]`);
  await expect(pending).toHaveCount(1, {timeout: 8_000});

  // 3. la fiche montre les deux ; « Garder » range la proposition dans les codes
  await pending.click();
  const chips = reader.locator('#annotPop .atelier-codes');
  await expect(reader.locator('#annotPop .atelier-note-title')).toHaveText('Passage codé');
  await expect(chips.locator('.code-chip:not(.is-suggested)')).toContainText('Albédo de neige');
  await chips.locator('.code-chip.is-suggested button[aria-label="Garder « Méthode »"]').click();
  await expect.poll(() => stored()[0]?.codes).toEqual([book.codes[0].id, methode]);
  expect(stored()[0].suggested).toBeUndefined();

  // 4. retirer un code garde le passage tant qu'il lui en reste un
  await chips.locator('button[aria-label="Retirer « Albédo de neige »"]').click();
  await expect.poll(() => stored()[0]?.codes).toEqual([methode]);

  // 5. Coder puis fermer sans choisir : rien n'est écrit, le voile disparaît
  await page.keyboard.press('Escape');
  await selectSpan(page, reader, 3);
  await reader.locator('#selPill .atelier-capsule[aria-label="Coder"]').click();
  await expect(menu).toBeVisible();
  await menu.locator('.cm-search').press('Escape');
  await expect(reader.locator('.pg[data-page="1"] .pdfhl.pdfcode')).toHaveCount(
    await reader.locator(`.pg[data-page="1"] .pdfhl.pdfcode[data-aid="${passage.id}"]`).count());
  expect(stored().length).toBe(1);
  expect(errors).toEqual([]);
});

test('onglet Codes du panneau : arbre, vue d’un code, propositions, suppression', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  const post = async (body: unknown) => (await fetch(`http://127.0.0.1:${port}/codebook`, {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})).json();
  const terrain = (await post({op: 'create', name: 'Terrain'})).code.id;
  const mesures = (await post({op: 'create', name: 'Mesures', parent: terrain})).code.id;
  const OTHER = 'zotero/WXYZ9876/autre.pdf';
  let store: Record<string, unknown[]> = {};
  try { store = JSON.parse(readFileSync(path.join(appDir, 'pdf_annots.json'), 'utf8')); } catch { /* premier test sauté */ }
  store[OTHER] = [
    {id: 'x1', page: 2, kind: 'hl', text: 'Mesures au pyranomètre', color: 'rgba(255,213,74,.40)', codes: [mesures]},
    {id: 'x2', page: 5, kind: 'hl', text: 'Site de Saskatchewan', color: 'rgba(255,213,74,.40)', suggested: [terrain]},
  ];
  writeFileSync(path.join(appDir, 'pdf_annots.json.tmp'), JSON.stringify(store));
  renameSync(path.join(appDir, 'pdf_annots.json.tmp'), path.join(appDir, 'pdf_annots.json'));
  const other = () => JSON.parse(readFileSync(path.join(appDir, 'pdf_annots.json'), 'utf8'))[OTHER];

  const reader = await openPdf(page);
  // le bouton « Annotations » de l'app ouvre CE panneau, sur l'onglet demandé
  await page.evaluate(() => document.querySelector('iframe').contentWindow
    .postMessage({type: 'atelier-annots-pane', view: 'codes'}, '*'));
  const pane = reader.locator('#annPane');
  await expect(pane).toBeVisible();
  await expect(pane.locator('.tab[data-v="codes"]')).toHaveAttribute('aria-selected', 'true');
  const row = (name: string) => pane.locator('.cv-row', {has: reader.locator('.cv-name', {hasText: name})});
  // Terrain compte son sous-code ; la proposition de Claude est à part
  await expect(row('Terrain').locator('.cv-count')).toHaveText('1 · 1');
  await expect(row('Terrain').locator('.cv-pending')).toHaveText('1');
  await expect(row('Mesures').locator('.cv-count')).toHaveText('1 · 1');

  // vue d'un code : passages par article, Garder une proposition
  await row('Terrain').locator('.cv-open').click();
  await expect(pane.locator('.cv-title')).toContainText('Terrain');
  await expect(pane.locator('.cv-it:not(.is-pending) .q')).toContainText('Mesures au pyranomètre');
  await expect(pane.locator('.cv-it:not(.is-pending) .code-tag')).toHaveText('Mesures');
  await pane.locator('.cv-it.is-pending .cv-tbtn', {hasText: 'Garder'}).click();
  await expect.poll(() => other().find((a: {id: string}) => a.id === 'x2').codes).toEqual([terrain]);
  await expect(pane.locator('.cv-it.is-pending')).toHaveCount(0);
  await expect(pane.locator('.cv-meta')).toHaveText('2 passages dans 1 article, sous-codes compris');

  // mémo du code, enregistré en quittant le champ
  await pane.locator('.cv-memo').fill('Lieux et instruments de mesure');
  await pane.locator('.cv-title').click();
  await expect.poll(async () => (await (await fetch(`http://127.0.0.1:${port}/codebook`)).json())
    .codes.find((c: {id: string}) => c.id === terrain).memo).toBe('Lieux et instruments de mesure');

  // retour à l'arbre ; supprimer un sous-code depuis son menu ⋯
  await pane.locator('.cv-head .cv-btn[aria-label="Retour aux codes"]').click();
  await row('Mesures').hover();
  await row('Mesures').locator('.cv-more').click();
  const menu = reader.locator('#codeMenu');
  await expect(menu.locator('.mi')).toHaveText(['Renommer', 'Nouveau sous-code', 'Supprimer']);
  await menu.locator('.mi.danger').click();
  await pane.locator('.cv-confirm .cv-tbtn.danger').click();
  await expect(row('Mesures')).toHaveCount(0);
  await expect.poll(() => other().find((a: {id: string}) => a.id === 'x1').codes).toBeUndefined();

  // l'onglet Annotations filtre par code (portée Bibliothèque)
  await pane.locator('.tab[data-v="ann"]').click();
  await pane.locator('.scope button[data-s="lib"]').click();
  await pane.locator('.fcode', {hasText: 'Terrain'}).click();
  await pane.locator('.art', {hasText: 'autre'}).click();
  await expect(pane.locator('.list .it .q')).toContainText(['Site de Saskatchewan']);
  expect(errors).toEqual([]);
});
