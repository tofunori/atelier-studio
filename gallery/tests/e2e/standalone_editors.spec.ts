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
