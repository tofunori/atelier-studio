import {test as base, expect} from '@playwright/test';
import {copyFile, mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {freePort, spawnGalleryServer, stopGalleryServer, waitForServer} from '../gallery_server.mts';
import {removeTempRoot} from './temp-root.ts';

// Galerie : un .docx montre le haut de sa première page (titre lisible)
// au lieu de « pas d'aperçu », sans que le fichier soit touché.
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'christophe.docx');

const test = base.extend<{project: {root: string; url: string}}>({
  project: async ({}, use) => {
    const root = await mkdtemp(path.join(tmpdir(), 'atelier-docx-thumb-'));
    await copyFile(FIXTURE, path.join(root, 'revCK.docx'));
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

test('docx card shows the top of its first page, read-only', async ({page, project}) => {
  const before = await readFile(path.join(project.root, 'revCK.docx'));
  await page.goto(`${project.url}/figures_index.html`);
  // Les .docx ne sont pas dans le filtre par défaut : on les montre.
  await page.evaluate('exts.docx = true; render()');
  const box = page.locator('.card[data-card="revCK.docx"] .docx-page');
  await expect(box).toHaveClass(/ready/);
  await expect(box.locator('.dp')).toContainText('2.2 Fraction de glace');
  await expect(page.locator('.card[data-card="revCK.docx"] .ph')).toHaveCount(0);
  // La page remplit la largeur de la vignette (haut de page, coupé en bas).
  const [boxRect, pageRect] = await Promise.all([box.boundingBox(), box.locator('.dp').boundingBox()]);
  expect(Math.abs(pageRect!.width - (boxRect!.width - 24))).toBeLessThan(2);
  expect(pageRect!.height).toBeGreaterThan(boxRect!.height);
  // Les images du document passent par la route du panneau Word.
  await expect(box.locator('img[src^="/docx/media?"]')).toHaveCount(1);
  expect((await readFile(path.join(project.root, 'revCK.docx'))).equals(before)).toBe(true);
});
