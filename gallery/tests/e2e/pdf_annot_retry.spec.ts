// Audit 2026-10-18, problème 10 : dans Atelier (lecteur dans une iframe), le
// retour d'état #status était masqué par « header .muted{display:none} », et
// un enregistrement d'annotation raté n'était jamais retenté.
import {test, expect, type Frame, type Page} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mts';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(GALLERY, '..');
const FIXTURE = path.join(REPO, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');
const REL = 'zotero/ABCD1234/paper.pdf';

let root: string, appDir: string, server: import('node:child_process').ChildProcess, port: number;

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-annot-retry-'));
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

const storedIds = () => {
  try {
    const store = JSON.parse(readFileSync(path.join(appDir, 'pdf_annots.json'), 'utf8'));
    return (store[REL] || []).map((a: {id: string}) => a.id);
  } catch { return []; }
};

// Hôte de même origine que le serveur, comme l'app (sinon la WebView refuse
// localStorage à l'iframe d'un document about:blank).
async function hostPage(page: Page, iframeStyle: string) {
  await page.goto(`http://127.0.0.1:${port}/ping`);
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;${iframeStyle}}</style>
    <iframe title="Lecteur PDF" src="http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent(REL)}"></iframe>`);
}

async function openInIframe(page: Page): Promise<Frame> {
  await hostPage(page, 'width:100%;height:100%');
  await expect.poll(() => page.frames().some(f => f.url().includes('pdf_viewer.html'))).toBe(true);
  const frame = page.frames().find(f => f.url().includes('pdf_viewer.html'))!;
  await expect.poll(() => frame.evaluate(() => ANNOTS_LOADED).catch(() => false), {timeout: 15_000}).toBe(true);
  return frame;
}

test('dans l’iframe, un enregistrement raté se voit dans #status et part seul quand le serveur répond', async ({page}) => {
  const frame = await openInIframe(page);
  const status = page.frameLocator('iframe[title="Lecteur PDF"]').locator('#status');
  // au repos, le span vide ne prend aucune place
  await expect(status).toBeHidden();

  let failing = true;
  await page.route(url => url.pathname === '/pdfannot', route => {
    if (failing && route.request().method() === 'POST') return route.fulfill({status: 500, body: '{"error":"disque plein"}'});
    return route.continue();
  });
  const saved = await frame.evaluate(() => {
    PDF_ANNOTS.push({id: 'retry-1', page: 1, kind: 'hl', color: 'rgba(255,213,74,.40)', note: '',
      text: 'passage', rects: [[0.1, 0.3, 0.3, 0.012]]});
    return saveAnnots();
  });
  expect(saved).toBe(false);
  await expect(status).toBeVisible();
  await expect(status).toContainText('Annotation non enregistrée');
  expect(storedIds()).not.toContain('retry-1');

  // le serveur répond de nouveau : nouvel essai automatique, sans geste
  failing = false;
  await expect.poll(storedIds, {timeout: 15_000}).toContain('retry-1');
  await expect(status).toContainText('Annotations enregistrées');
  await expect(status).toBeHidden({timeout: 6_000});
});

test('un chargement raté se signale et le lecteur retente sans abandonner', async ({page}) => {
  writeFileSync(path.join(appDir, 'pdf_annots.json'), JSON.stringify({[REL]: [{id: 'disk-1', page: 1, kind: 'hl',
    color: 'rgba(255,213,74,.40)', note: '', text: 'disque', rects: [[0.1, 0.2, 0.3, 0.012]]}]}));
  let failures = 0;
  await page.route(url => url.pathname === '/pdfannot', route => {
    if (failures < 3) { failures++; return route.fulfill({status: 500, body: '{}'}); }
    return route.continue();
  });
  await hostPage(page, 'width:900px;height:700px');
  const status = page.frameLocator('iframe[title="Lecteur PDF"]').locator('#status');
  await expect(status).toBeVisible({timeout: 10_000});
  await expect(status).toContainText('Annotations non chargées');
  const frame = page.frames().find(f => f.url().includes('pdf_viewer.html'))!;
  await expect.poll(() => frame.evaluate(() => ANNOTS_LOADED).catch(() => false), {timeout: 20_000}).toBe(true);
  expect(await frame.evaluate(() => PDF_ANNOTS.map(a => a.id))).toEqual(['disk-1']);
  await expect(status).toBeHidden();
});
