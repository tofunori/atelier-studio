// Retour Word d'un relecteur (Thierry 2026-11-12) : « Importer un retour Word
// (.docx)… » pose ses commentaires dans le .tex, signés de son prénom, avec le
// bilan d'import, le filtre du panneau, les états et l'ordre du jour. Le .docx
// est la fixture synthétique de rust/crates/atelier-docx (zippée ici, sans
// compression), le même cas que tests/retour_du_relecteur.rs.
import {test, expect} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mts';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {crc32} from 'node:zlib';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(GALLERY, '..', 'rust/crates/atelier-docx/tests/fixtures/retour');

const MAIN = '\\documentclass{article}\n\\begin{document}\n\\section{Methods}\n\\input{sections/methods}\n'
  + '\\begin{figure}\n\\includegraphics{fig1}\n\\caption{Observed and modelled albedo.}\n\\end{figure}\n\\end{document}\n';
const METHODS = 'Values below 0.05 or above 0.99 are removed.\n'
  + 'Following \\citet{stroeve2006}, we remove images with a solar zenith angle greater than $70^\\circ$.\n\n'
  + 'Summer albedo is the mean over June to August, by elevation zone.\n\n'
  + 'The model is $x = a + b$ fitted to all zones.\n';

/** Zip « stored » minimal : assez pour un .docx de test. */
function zipDir(dir: string): Buffer {
  const files: Array<[string, Buffer]> = [];
  const walk = (d: string) => readdirSync(d).forEach(name => {
    const p = path.join(d, name);
    if (statSync(p).isDirectory()) walk(p); else files.push([path.relative(dir, p).split(path.sep).join('/'), readFileSync(p)]);
  });
  walk(dir);
  files.sort(([a], [b]) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : a.localeCompare(b)));
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dirSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

test('reviewer .docx: comments land in the .tex, signed, with report, filter, states and agenda', async ({page}) => {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-reviewer-'));
  const appDir = path.join(root, '.app');
  mkdirSync(appDir);
  mkdirSync(path.join(root, 'sections'));
  const main = path.join(root, 'main.tex');
  writeFileSync(main, MAIN);
  writeFileSync(path.join(root, 'sections', 'methods.tex'), METHODS);
  const docx = path.join(root, 'retour.docx');
  writeFileSync(docx, zipDir(FIXTURE));
  let server;
  try {
    const port = await freePort();
    server = spawnGalleryServer({root, port, watch: false, env: {ATELIER_APP_DIR: appDir}});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    const methods = path.join(root, 'sections', 'methods.tex');
    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(methods)}`);
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Entrée du menu « … » : seulement pour un .tex.
    await page.locator('#moreBtn').click();
    const entry = page.locator('#moreReviewImport');
    await expect(entry).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await entry.click();
    const imported = page.waitForResponse(r => r.url().includes('/review/import'));
    await (await chooser).setFiles(docx);
    expect((await imported).ok()).toBe(true);

    // Bilan : 5 commentaires, tous placés, la réponse de Thierry gardée.
    const report = page.locator('.texv-report-card');
    await expect(report).toContainText('Retour de Christophe importé');
    await expect(report).toContainText('5 reçus, tous placés');
    await expect(report).toContainText('1 réponse déjà écrite dans Word');
    await expect(report).toContainText('main.tex · 1');

    // Le store : notes signées du relecteur, une copie du .docx gardée.
    const store = JSON.parse(readFileSync(path.join(root, '.fig_thumbs', 'pdf_annots.json'), 'utf8'));
    const notes = store[`tex-comments:${methods}`];
    expect(notes).toHaveLength(4);
    expect(notes.every((n: any) => n.by === 'reviewer' && n.author === 'Christophe Kinnard' && n.review.state === 'todo')).toBe(true);
    expect(readdirSync(path.join(root, '.fig_thumbs', 'retours'))).toHaveLength(1);

    // Panneau : filtre au prénom, états, l'autre fichier signalé.
    await report.locator('.texv-report-close').first().click();
    const panel = page.locator('#texcPanel');
    await expect(panel.locator('.tp-filter').getByRole('button')).toHaveText(['Toutes', 'Les miennes', 'Christophe']);
    await expect(panel.locator('.tp-chip[data-rstate="todo"]')).toHaveText('À faire · 4');
    await expect(panel.locator('.tp-review-file')).toHaveText(/main\.tex · 1 à faire/);
    await expect(page.locator('.texv-head')).toHaveCount(4);
    await expect(page.locator('.texv-head').first()).toContainText('Christophe');

    // Ouvrir le commentaire exact : la réponse Word de Thierry, puis à l'ordre du jour.
    await page.locator('.texv-head').first().click();
    const block = page.locator('.texv-block');
    await expect(block).toHaveCount(1);
    await expect(block.locator('.texv-word')).toContainText('Thierry');
    await block.locator('.texv-agenda').click();
    await expect(panel.locator('.tp-chip[data-rstate="agenda"]')).toHaveText('À discuter · 1');
    await panel.locator('.tp-agenda-open').click();
    await expect(panel.locator('.tp-agenda li')).toHaveCount(1);

    // Réimporter le même fichier n'ajoute rien.
    await panel.locator('.tp-agenda-close').click();
    await page.locator('#moreBtn').click();
    const again = page.waitForEvent('filechooser');
    await page.locator('#moreReviewImport').click();
    const second = page.waitForResponse(r => r.url().includes('/review/import'));
    await (await again).setFiles(docx);
    expect((await second).ok()).toBe(true);
    await expect(page.locator('.texv-report-card')).toContainText('rien n’a été ajouté');
    await expect(page.locator('.texv-head')).toHaveCount(4);
  } finally { await stop(server); await removeTempRoot(root); }
});
