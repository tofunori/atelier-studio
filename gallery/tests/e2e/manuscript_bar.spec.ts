import {test, expect} from '@playwright/test';
import { spawnGalleryServer, freePort, stopGalleryServer as stop } from '../gallery_server.mts';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { removeTempRoot } from './temp-root.ts';

// Barre du bas de l'éditeur LaTeX : compte de mots du manuscrit (racine + ses
// \input), sélection comptée, panneau « À faire ». Le comptage vient du
// serveur Rust (/tex/manuscript, /tex/wordcount).

const MAIN = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Introduction}',
  'Glaciers darken when wildfire smoke deposits soot.',
  '% TODO ajouter la référence du seuil',
  'Albedo drops in late summer.',
  '\\input{sections/discussion}',
  '\\section{Conclusion}',
  'Done.',
  '\\end{document}',
  '',
].join('\n');
const DISCUSSION = [
  '\\section{Discussion}',
  'Fire years stand out \\todo{Comparer avec Aubry-Wake} clearly.',
  '',
].join('\n');

async function withManuscript(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-manuscript-'));
  let server;
  try {
    mkdirSync(path.join(root, 'sections'));
    writeFileSync(path.join(root, 'main.tex'), MAIN);
    writeFileSync(path.join(root, 'sections', 'discussion.tex'), DISCUSSION);
    const port = await freePort();
    server = spawnGalleryServer({ root, port });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, url: (name: string) =>
      `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(path.join(root, name))}`});
  } finally { await stop(server); await removeTempRoot(root); }
}

test('manuscript bar counts words, lists todos and marks one done', async ({page}) => {
  await withManuscript(async ({url}) => {
    await page.setViewportSize({width: 1200, height: 760});
    await page.goto(url('main.tex'));
    const bar = page.locator('#msBar');
    await expect(bar).toBeVisible();
    // l'ancienne barre d'état reste masquée (EDIT-09)
    await expect(page.locator('#statusbar')).toBeHidden();
    // 7 + 5 + 1 (main) + 5 (discussion, sans le \todo ni les titres)
    await expect(page.locator('#msWords')).toHaveText('18 mots');
    await expect(page.locator('#msTodo')).toHaveText('2 à faire');
    const barBox = await bar.boundingBox();
    const leftBox = await page.locator('#left').boundingBox();
    expect(Math.round(barBox!.height)).toBe(28);
    expect(Math.abs((barBox!.y + barBox!.height) - (leftBox!.y + leftBox!.height))).toBeLessThan(1);

    await page.locator('#msTodo').click();
    const panel = page.locator('#msTodoPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.ms-group')).toHaveText(['main.tex1', 'sections/discussion.tex1']);
    await expect(panel.locator('.ms-item .ms-meta')).toHaveText(['TODO · Introduction · l. 5', '\\todo · Discussion · l. 2']);
    // l'autre fichier n'offre pas « marquer fait » (il n'est pas ouvert ici)
    await expect(panel.locator('.ms-item').nth(1).locator('[data-act="done"]')).toHaveCount(0);

    // aller à la ligne : le curseur saute et l'élément devient courant
    await panel.locator('.ms-item').first().click();
    await expect(page.locator('#msPos')).toHaveText('Ln 5, Col 1');
    await expect(panel.locator('.ms-item').first()).toHaveClass(/\bon\b/);
    await expect(page.locator('#msTicks i.on')).toHaveCount(1);

    await panel.locator('.ms-item').first().hover();
    await panel.locator('.ms-item').first().locator('[data-act="done"]').click();
    await expect(panel.locator('.ms-item')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).cm.getValue())).not.toContain('% TODO');
    await expect(page.locator('#msTodo')).toHaveText('1 à faire');
    // ⌘Z ramène la marque
    await page.locator('.cm-content').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect(await page.evaluate(() => (window as any).cm.getValue())).toContain('% TODO ajouter');
    await expect(page.locator('#msTodo')).toHaveText('2 à faire', {timeout: 6000});
  });
});

test('manuscript bar shows the selected words and the per-section detail', async ({page}) => {
  await withManuscript(async ({url}) => {
    await page.setViewportSize({width: 1200, height: 760});
    await page.goto(url('main.tex'));
    await expect(page.locator('#msWords')).toHaveText('18 mots');
    await page.evaluate(() => {
      const cm = (window as any).cm;
      cm.setSelection({line: 3, ch: 0}, {line: 3, ch: cm.getLine(3).length});
    });
    await expect(page.locator('#msWords')).toHaveText('7 sur 18 mots');
    await expect(page.locator('#msWords b')).toHaveText('7');
    await page.evaluate(() => (window as any).cm.setCursor({line: 5, ch: 2}));
    await expect(page.locator('#msWords')).toHaveText('18 mots');

    await page.locator('#msWords').click();
    const card = page.locator('#msWordsCard');
    await expect(card).toBeVisible();
    await expect(card.locator('.ms-total')).toHaveText('18 mots');
    await expect(card.locator('.ms-sub')).toHaveText('main.tex et 1 fichier inclus');
    await expect(card.locator('.ms-sec .ms-name')).toHaveText(['1 Introduction', '2 Discussion', '3 Conclusion']);
    await expect(card.locator('.ms-sec.on .ms-name')).toHaveText('1 Introduction');
    // la racine reprend après son \\input : la section courante suit
    await page.evaluate(() => (window as any).cm.setCursor({line: 8, ch: 1}));
    await expect(card.locator('.ms-sec.on .ms-name')).toHaveText('3 Conclusion');
    // l'ouverture s'ancre au-dessus de la barre, sans la recouvrir
    const cardBox = await card.boundingBox();
    const barBox = await page.locator('#msBar').boundingBox();
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(barBox!.y);

    // une limite par section survit au rechargement (réglage serveur)
    await card.locator('[data-pref="limits"]').click();
    await card.locator('input.ms-limit').first().fill('250');
    await card.locator('input.ms-limit').first().press('Enter');
    await expect(card.locator('.ms-sec .ms-count').first()).toHaveText('12 / 250');
    await page.reload();
    await page.locator('#msWords').click();
    await expect(page.locator('#msWordsCard .ms-sec .ms-count').first()).toHaveText('12 / 250');
    await page.keyboard.press('Escape');
    await expect(page.locator('#msWordsCard')).toBeHidden();
  });
});
