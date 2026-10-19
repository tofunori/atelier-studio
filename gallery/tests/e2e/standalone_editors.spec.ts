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
  await page.reload();
  await expect(page.locator('.tl-shape')).toContainText('Forme TypeScript');
  expect(errors).toEqual([]);
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
  await indicator.click();
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
