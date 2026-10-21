import {test as base, expect} from '@playwright/test';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {freePort, spawnGalleryServer, stopGalleryServer, waitForServer} from '../gallery_server.mts';
import {removeTempRoot} from './temp-root.ts';

const test = base.extend<{project: {root: string; url: string}}>({
  project: async ({}, use) => {
    const root = await mkdtemp(path.join(tmpdir(), 'atelier-typescript-editors-'));
    const port = await freePort();
    const server = spawnGalleryServer({root, port, watch: false});
    try {
      await waitForServer(port, {child: server});
      await use({root, url: `http://127.0.0.1:${port}`});
    } finally {
      await stopGalleryServer(server);
      await removeTempRoot(root);
    }
  },
});

test('built Notes loads Markdown, saves source edits and restores rich text', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await writeFile(path.join(project.root, 'notes.md'), '# Notes TypeScript\n\nTexte initial.\n');
  await page.goto(`${project.url}/.fig_thumbs/notes/index.html`);
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Texte initial.');
  await page.locator('[data-mode="source"]').click();
  await page.locator('#source').fill('# Notes TypeScript\n\nModification conservée.\n');
  await expect.poll(() => readFile(path.join(project.root, 'notes.md'), 'utf8')).toContain('Modification conservée.');
  await page.locator('[data-mode="rich"]').click();
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Modification conservée.');
  await page.reload();
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Modification conservée.');
  expect(errors).toEqual([]);
});

test('built whiteboard applies a command and restores the saved shape', async ({page, request, project}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${project.url}/.fig_thumbs/whiteboard/index.html`);
  await expect(page.locator('.tl-container')).toBeVisible();
  const response = await request.post(`${project.url}/board/command`, {
    data: {type: 'create_rectangle', x: 0, y: 0, w: 200, h: 120, label: 'Forme TypeScript'},
  });
  expect(response.ok()).toBe(true);
  await expect(page.locator('.tl-shape')).toContainText('Forme TypeScript');
  await expect.poll(async () => {
    const response = await request.get(`${project.url}/board/load`);
    return JSON.stringify((await response.json()).snapshot);
  }).toContain('Forme TypeScript');
  // WebKit signale comme erreur de page la requête /board/poll en cours que
  // le rechargement annule (« … due to access control checks »).
  const beforeReload = errors.length;
  await page.reload();
  await expect(page.locator('.tl-shape')).toContainText('Forme TypeScript');
  const cancelledPoll = /\/board\/poll due to access control checks/;
  expect([
    ...errors.slice(0, beforeReload),
    ...errors.slice(beforeReload).filter(message => !cancelledPoll.test(message)),
  ]).toEqual([]);
});

// Audit du 2026-10-18, problème 6 : Notes et tableau blanc n'écrasent plus
// la version du disque après un chargement raté ou un écrivain concurrent.
test('Notes: a failed load never mounts an empty document over notes.md', async ({page, project}) => {
  const notes = path.join(project.root, 'notes.md');
  await writeFile(notes, '# Notes\n\nTexte du disque.\n');
  let failures = 0;
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/notes/save')) posts.push(request.url()); });
  await page.route(url => url.pathname === '/notes/load', route => {
    if (failures < 1) { failures++; return route.fulfill({status: 500, body: '{"error":"lecture impossible"}'}); }
    return route.continue();
  });
  await page.goto(`${project.url}/.fig_thumbs/notes/index.html`);
  await expect(page.locator('#save-indicator')).toBeVisible();
  await expect(page.locator('#save-indicator')).toContainText('non chargées');
  // nouvel essai seul : le vrai contenu arrive, jamais un document vide
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Texte du disque.', {timeout: 10_000});
  await expect(page.locator('#save-indicator')).toBeHidden();
  expect(posts).toEqual([]);
  expect(await readFile(notes, 'utf8')).toBe('# Notes\n\nTexte du disque.\n');
});

test('Notes: a paragraph written by an agent is kept when the tab saves on a stale base', async ({page, project}) => {
  const notes = path.join(project.root, 'notes.md');
  await writeFile(notes, '# Notes\n\nDébut.\n');
  await page.goto(`${project.url}/.fig_thumbs/notes/index.html`);
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Début.');
  // un agent ajoute un paragraphe pendant que l'onglet est ouvert
  await writeFile(notes, '# Notes\n\nDébut.\n\nParagraphe de l’agent.\n');
  await page.locator('[data-mode="source"]').click();
  await page.locator('#source').fill('# Notes\n\nDébut.\n\nLigne tapée.\n');
  const indicator = page.locator('#save-indicator');
  await expect(indicator).toContainText('a changé ailleurs', {timeout: 5_000});
  expect(await readFile(notes, 'utf8')).toContain('Paragraphe de l’agent.');
  await expect(page.locator('#source')).toHaveValue(/Ligne tapée/);
  // choix explicite : garder la version de l'onglet ; l'autre va dans .bak
  await indicator.getByRole('button', {name: 'Garder cette version'}).click();
  await expect.poll(() => readFile(notes, 'utf8')).toContain('Ligne tapée.');
  expect(await readFile(notes + '.bak', 'utf8')).toContain('Paragraphe de l’agent.');
  await expect(indicator).toBeHidden();
});

test('whiteboard: nothing is saved before a successful load', async ({page, project}) => {
  let failures = 0;
  let saves = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/board/save')) saves++; });
  await page.route(url => url.pathname === '/board/load', route => {
    if (failures < 1) { failures++; return route.fulfill({status: 500, body: '{"error":"lecture impossible"}'}); }
    return route.continue();
  });
  await page.goto(`${project.url}/.fig_thumbs/whiteboard/index.html`);
  await expect(page.getByText('Tableau non chargé')).toBeVisible();
  expect(saves).toBe(0);
  // nouvel essai seul : le message disparaît une fois le tableau chargé
  await expect(page.getByText('Tableau non chargé')).toBeHidden({timeout: 10_000});
});

// Relecture du 2026-10-19 : une sauvegarde partie par sendBeacon (fenêtre
// cachée pendant la seconde d'attente) écrit le fichier sans que l'éditeur
// lise la nouvelle version. La frappe suivante ne doit pas tomber en conflit.
const hideOnce = (page: import('@playwright/test').Page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true});
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true});
});

test('Notes: typing after a save sent while hidden is saved, not a conflict', async ({page, project}) => {
  const notes = path.join(project.root, 'notes.md');
  await writeFile(notes, '# Notes\n\nDébut.\n');
  await page.goto(`${project.url}/.fig_thumbs/notes/index.html`);
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Début.');
  await page.locator('[data-mode="source"]').click();
  await page.locator('#source').fill('# Notes\n\nDébut.\n\nPremier.\n');
  await hideOnce(page);
  await expect.poll(() => readFile(notes, 'utf8')).toContain('Premier.');
  await page.locator('#source').fill('# Notes\n\nDébut.\n\nPremier.\n\nSecond.\n');
  await expect.poll(() => readFile(notes, 'utf8')).toContain('Second.');
  await expect(page.locator('#save-indicator')).not.toContainText('a changé ailleurs');
});

test('Notes: text typed during a conflict survives the tab being hidden', async ({page, project}) => {
  const notes = path.join(project.root, 'notes.md');
  await writeFile(notes, '# Notes\n\nDébut.\n');
  await page.goto(`${project.url}/.fig_thumbs/notes/index.html`);
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Début.');
  await writeFile(notes, '# Notes\n\nVersion de l’agent.\n');
  await page.locator('[data-mode="source"]').click();
  await page.locator('#source').fill('# Notes\n\nDébut.\n\nAvant le choix.\n');
  await expect(page.locator('#save-indicator')).toContainText('a changé ailleurs', {timeout: 5_000});
  // l'utilisateur continue sans choisir, puis la fenêtre se ferme
  await page.locator('#source').fill('# Notes\n\nDébut.\n\nAvant le choix.\n\nTapé après.\n');
  await hideOnce(page);
  await expect.poll(() => readFile(notes + '.conflit', 'utf8').catch(() => '')).toContain('Tapé après.');
  expect(await readFile(notes, 'utf8')).toBe('# Notes\n\nVersion de l’agent.\n');
});

test('whiteboard: edits after a save sent while hidden are saved, not a conflict', async ({page, request, project}) => {
  await page.goto(`${project.url}/.fig_thumbs/whiteboard/index.html`);
  await expect(page.locator('.tl-container')).toBeVisible();
  const snapshot = async () => JSON.stringify((await (await request.get(`${project.url}/board/load`)).json()).snapshot);
  await request.post(`${project.url}/board/command`, {data: {type: 'create_rectangle', x: 0, y: 0, w: 200, h: 120, label: 'Un'}});
  await expect(page.locator('.tl-shape')).toContainText('Un');
  await hideOnce(page);
  await expect.poll(snapshot).toContain('Un');
  await request.post(`${project.url}/board/command`, {data: {type: 'create_rectangle', x: 300, y: 0, w: 200, h: 120, label: 'Deux'}});
  await expect(page.locator('.tl-shape').nth(1)).toBeVisible();
  await expect.poll(snapshot).toContain('Deux');
  await expect(page.getByText('changé dans une autre fenêtre')).toHaveCount(0);
});

test('whiteboard: a conflict offers to keep this board instead of a reload', async ({page, request, project}) => {
  await page.goto(`${project.url}/.fig_thumbs/whiteboard/index.html`);
  await expect(page.locator('.tl-container')).toBeVisible();
  await expect.poll(async () => (await request.get(`${project.url}/board/load`)).ok()).toBe(true);
  await page.waitForTimeout(500);
  // une autre fenêtre (sans writer de cette page) écrit le tableau
  const other = await request.post(`${project.url}/board/save`, {data: {snapshot: {autre: 'fenêtre'}}});
  expect(other.ok()).toBe(true);
  await request.post(`${project.url}/board/command`, {data: {type: 'create_rectangle', x: 0, y: 0, w: 200, h: 120, label: 'Mien'}});
  const notice = page.getByText('changé dans une autre fenêtre');
  await expect(notice).toBeVisible({timeout: 5_000});
  const disk = async () => JSON.stringify((await (await request.get(`${project.url}/board/load`)).json()).snapshot);
  expect(await disk()).toContain('fenêtre');
  await page.getByRole('button', {name: 'Garder ce tableau'}).click();
  await expect.poll(disk).toContain('Mien');
  await expect(notice).toHaveCount(0);
  expect(await readFile(path.join(project.root, '.fig_thumbs', 'board.tldr.json.bak'), 'utf8')).toContain('fenêtre');
});
