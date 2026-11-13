// Copies de TP commentées comme dans Word (variante A, Thierry 2026-11-13) :
// un PDF du projet garde ses commentaires dans une colonne de cartes signées
// de l'utilisateur ; un commentaire écrit DANS le fichier (texte caché dans
// /Contents) devient une carte une seule fois ; « Copie corrigée » écrit
// `<nom>_corrigé.pdf` à côté, l'original ne changeant pas.
import {test, expect} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mts';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';

/** PDF d'une page : une ligne de texte et un surlignage commenté (Acrobat). */
function pdfWithHiddenComment(){
  const text = 'BT /F1 18 Tf 72 700 Td (Conductivite hydraulique K) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Annot /Subtype /Highlight /Rect [70 694 360 722] /QuadPoints [70 722 360 722 70 694 360 694] /C [1 0.84 0.29] /F 4'
      + ' /Contents (Unite manquante : 794 mm w.e.) /T (Thierry Laurent) /M (D:20261113120000Z) >>',
  ];
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

test('copie de TP : commentaire du fichier repris en carte, modifié, copie corrigée, supprimé sans revenir', async ({page}) => {
  test.setTimeout(90_000);
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-pdf-comments-'));
  let server;
  try {
    writeFileSync(path.join(root, 'tp.pdf'), pdfWithHiddenComment());
    mkdirSync(path.join(root, '.fig_thumbs'));
    writeFileSync(path.join(root, '.fig_thumbs', 'docx_prefs.json'), JSON.stringify({author: 'Thierry Laurent'}));
    const before = readFileSync(path.join(root, 'tp.pdf'));
    const port = await freePort();
    server = spawnGalleryServer({root, port, watch: false});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    const store = () => fetch(`http://127.0.0.1:${port}/pdfannot?rel=tp.pdf`).then(r => r.json()).then(j => j.annots || []);
    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=tp.pdf`);

    // le commentaire caché devient une carte numérotée, signée, avec son passage
    const cards = page.locator('#annPane .pc-list .cc');
    await expect(cards).toHaveCount(1, {timeout: 15_000});
    await expect(cards.first().locator('.tx')).toHaveText('Unite manquante : 794 mm w.e.');
    await expect(cards.first().locator('.nm')).toHaveText('Thierry');
    await expect(cards.first().locator('.pc-n')).toHaveText('1');
    await expect.poll(async () => (await store()).length).toBe(1);
    const seen = await fetch(`http://127.0.0.1:${port}/pdfannot?rel=${encodeURIComponent('pdf-embedded:tp.pdf')}`).then(r => r.json());
    expect(seen.annots.map(a => a.id)).toEqual([(await store())[0].id]);

    // modifier comme dans Word : clic sur le texte, Entrée enregistre
    await cards.first().click();
    await expect(page.locator('#annPane .cc.on .qt')).toContainText('Conductivite');
    await page.locator('#annPane .cc.on .tx.mine').click();
    await page.locator('#annPane .cc.on textarea.c-edit').fill('Unité manquante : 794 mm w.e. par an.');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await store())[0].memo).toBe('Unité manquante : 794 mm w.e. par an.');
    expect((await store())[0].author).toBe('Thierry Laurent');

    // rechargé : pas de doublon, le commentaire du fichier reste masqué
    await page.reload();
    await expect(cards).toHaveCount(1, {timeout: 15_000});
    await expect(cards.first().locator('.tx')).toHaveText('Unité manquante : 794 mm w.e. par an.');

    // copie corrigée à côté, original intact
    await page.locator('#annPane [data-act=copy]').click();
    await expect(page.locator('#annPane .pc-msg')).toContainText('tp_corrigé.pdf', {timeout: 30_000});
    const copy = path.join(root, 'tp_corrigé.pdf');
    expect(existsSync(copy)).toBe(true);
    expect(statSync(copy).size).toBeGreaterThan(before.length);
    expect(readFileSync(path.join(root, 'tp.pdf')).equals(before)).toBe(true);

    // la copie elle-même : marquée corrigée, rien d'importé
    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=${encodeURIComponent('tp_corrigé.pdf')}`);
    await expect.poll(() => page.evaluate(() => Boolean(window.__pdfComments))).toBe(true);
    await page.evaluate(() => window.postMessage({type: 'atelier-annots-pane', view: 'ann'}, '*'));
    await expect(page.locator('#annPane .pc-note')).toContainText('Copie corrigée');
    await expect(cards).toHaveCount(0);

    // supprimé : la carte et son surlignage partent, et ne reviennent pas
    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=tp.pdf`);
    await expect(cards).toHaveCount(1, {timeout: 15_000});
    await cards.first().click();
    await page.locator('#annPane .cc.on [data-act=delete]').click();
    await expect.poll(async () => (await store()).length).toBe(0);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.__pdfComments))).toBe(true);
    await page.waitForTimeout(1500);
    await expect(page.locator('.pg[data-page="1"] .pdfhl')).toHaveCount(0);
    expect((await store()).length).toBe(0);
  } finally { await stop(server); await removeTempRoot(root); }
});
