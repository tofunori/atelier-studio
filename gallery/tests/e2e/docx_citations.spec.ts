import {test as base, expect, type Page} from '@playwright/test';
import {copyFile, mkdir, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {freePort, spawnGalleryServer, stopGalleryServer, waitForServer} from '../gallery_server.mts';
import {removeTempRoot} from './temp-root.ts';
import {makeZotero} from './zotero_fixture.ts';

// Citations Zotero vivantes dans la surface Word (Thierry, 2026-11-14) :
// palette au curseur, citation modifiée d'un clic, bibliographie et style.
// Bibliothèque Zotero factice (trois notices synthétiques).
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'christophe.docx');

const test = base.extend<{project: {root: string; url: string; doc: string}}>({
  project: async ({}, use) => {
    const root = await mkdtemp(path.join(tmpdir(), 'atelier-cite-'));
    const project = path.join(root, 'projet');
    await mkdir(project);
    const doc = path.join(project, 'Chapitre 2.docx');
    await copyFile(FIXTURE, doc);
    const zotero = makeZotero(path.join(root, 'Zotero'));
    const port = await freePort();
    // HOME : la copie de lecture de Zotero reste dans le dossier du test.
    const server = spawnGalleryServer({root: project, port, watch: false, env: {HOME: root, ATELIER_APP_DIR: path.join(root, 'app'), ATELIER_ZOTERO_DIR: zotero}});
    try {
      await waitForServer(port, {child: server});
      await use({root: project, url: `http://127.0.0.1:${port}`, doc});
    } finally {
      await stopGalleryServer(server);
      await removeTempRoot(root);
    }
  },
});

type Para = {text: string; segments: {text: string; cite?: string; label?: string}[]};
const disk = async (page: Page, p: {url: string; doc: string}): Promise<{paragraphs: Para[]}> =>
  (await page.request.get(`${p.url}/docx/model?path=${encodeURIComponent(p.doc)}`)).json();

async function caretAfter(page: Page, idx: number, after: string) {
  await page.evaluate(([i, needle]) => {
    const p = document.querySelector(`.d-p[data-idx="${i}"]`)!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      const k = t.data.indexOf(needle as string);
      if (k >= 0) {
        const r = document.createRange();
        r.setStart(t, k + (needle as string).length);
        r.collapse(true);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
        return;
      }
    }
    throw new Error(`introuvable : ${needle}`);
  }, [idx, after] as const);
}

test('docx: citer depuis Zotero au curseur, modifier la citation, poser la bibliographie', async ({page, project}) => {
  await page.request.post(`${project.url}/docx/prefs`, {data: {author: 'Thierry'}});
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(project.doc)}`);
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  const k = (await disk(page, project)).paragraphs.findIndex((p) => p.text.includes('réflectances de surface'));
  expect(k).toBeGreaterThan(0);

  // ⇧⌘C au curseur : la palette cherche dans Zotero.
  await page.locator(`.d-p[data-idx="${k}"]`).click();
  await caretAfter(page, k, 'réflectances de surface');
  await page.keyboard.press('ControlOrMeta+Shift+KeyC');
  const pal = page.locator('#citepal');
  await expect(pal).toHaveClass(/show/);
  await expect(pal.locator('.cmi')).toHaveCount(3);
  await page.keyboard.type('aubry');
  await expect(pal.locator('.cmi')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(pal.locator('.cpill')).toHaveText(['Aubry-Wake et al., 2022']);
  await page.keyboard.type('williamson 2021');
  await expect(pal.locator('.cmi')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(pal.locator('.cpill')).toHaveText(['Aubry-Wake et al., 2022', 'Williamson & Menounos, 2021']);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(pal).not.toHaveClass(/show/);

  let para = (await disk(page, project)).paragraphs[k];
  await expect.poll(async () => (await disk(page, project)).paragraphs[k].text).toContain('réflectances de surface (Aubry-Wake et al., 2022; Williamson & Menounos, 2021)');
  para = (await disk(page, project)).paragraphs[k];
  expect(para.segments.some((s) => s.cite && s.label === 'zotero')).toBe(true);
  const chip = page.locator(`.d-p[data-idx="${k}"] .chip.cite`).first();
  await expect(chip).toBeVisible();

  // Clic sur la citation : ses références en pilules ; page sur la première.
  await chip.click();
  await expect(pal).toHaveClass(/show/);
  await expect(pal.locator('.cpill')).toHaveText(['Aubry-Wake et al., 2022', 'Williamson & Menounos, 2021']);
  await expect(pal.locator('#citeOk')).toHaveText('Mettre à jour');
  await pal.locator('.cpill').first().click();
  await pal.locator('#citeLoc').fill('4');
  await expect(pal.locator('.cpill').first()).toContainText('p. 4');
  await pal.locator('#citeOk').click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[k].text).toContain('(Aubry-Wake et al., 2022, p. 4; Williamson & Menounos, 2021)');

  // Insérer > Bibliographie Zotero, à la fin du document.
  const n = (await disk(page, project)).paragraphs.length;
  await page.locator(`.d-p[data-idx="${n - 1}"]`).click();
  await page.locator('#btnInsert').click();
  await page.locator('.menu .mi', {hasText: 'Bibliographie Zotero'}).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs.map((p) => p.text).join('\n')).toContain('Aubry-Wake, C., Bertoncini, A., & Pomeroy, J. W. (2022). Fire and ice');
  const bib = page.locator('.chip.bibl').first();
  await expect(bib).toBeVisible();

  // Style IEEE depuis la bibliographie : tout passe en numéros.
  await bib.click();
  await page.locator('.menu .mi', {hasText: 'Changer de style'}).click();
  await page.locator('.menu .mi', {hasText: 'IEEE'}).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[k].text).toContain('réflectances de surface [1, p. 4], [2]');
});
