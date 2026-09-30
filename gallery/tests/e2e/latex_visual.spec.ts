// Éditeur visuel LaTeX (cm6/latex_visual.ts) : balisage caché hors du
// curseur, source intacte. Rejoué aussi en WebKit (moteur du WKWebView).
import {test, expect, type Page} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mts';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';

const TEX = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Tendance de l\'albédo}\\label{sec:trend}',
  'We estimate the trend \\emph{over the zone} with a model~\\citep{ren2021,smith2020}.',
  'The decline of $\\Delta\\alpha = -0.02$ per decade --- see Figure~\\ref{fig:trend} and \\citep[p.~3]{ren2021}.',
  '',
  '\\subsection{Données}',
  'As shown by \\citet{smith2020}, 50\\% of glaciers darken; see \\eqref{eq:main} and \\ref{fig:none}.',
  '\\bibliography{refs}',
  '\\end{document}',
  '',
].join('\n');
const BIB = '@article{ren2021, author={Ren, Shaoting and Miles, Evan and Jia, Li}, title={Anisotropy}, year={2021}}\n'
  + '@article{smith2020, author={Smith, John}, title={Glacier albedo}, year={2020}}\n';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAEUlEQVR4nGOwqTiBFTFQTwIANmsvge7E1PgAAAAASUVORK5CYII=';
const BLOCKS = [
  '\\documentclass{article}',
  '\\graphicspath{{figs/}}',
  '\\begin{document}',
  'The trend is modelled as',
  '\\begin{equation}\\label{eq:main}',
  '  \\alpha_t = \\beta_0 + \\beta_1 t',
  '\\end{equation}',
  'and the pooled system reads',
  '\\begin{align*}',
  '  a &= b \\\\',
  '  c &= d',
  '\\end{align*}',
  'Key steps:',
  '\\begin{itemize}',
  '  \\item filter cloudy pixels;',
  '  \\item aggregate by zone;',
  '\\end{itemize}',
  '\\begin{enumerate}',
  '  \\item first',
  '  \\item second',
  '\\end{enumerate}',
  '\\begin{figure}[t]',
  '  \\centering',
  '  \\includegraphics[width=\\linewidth]{trend}',
  '  \\caption{Albedo trend of the \\emph{accumulation zone}.}\\label{fig:trend}',
  '\\end{figure}',
  'See Figure~\\ref{fig:trend}.',
  '\\end{document}',
  '',
].join('\n');
const AUX = '\\relax\n\\bibdata{refs}\n\\newlabel{sec:trend}{{1}{1}}\n\\newlabel{fig:trend}{{3}{2}}\n\\newlabel{eq:main}{{1}{2}}\n';

async function withProject(run: (ctx: {root: string; target: string; url: string}) => Promise<void>, tex = TEX) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-visual-'));
  const target = path.join(root, 'main.tex');
  let server;
  try {
    writeFileSync(target, tex);
    mkdirSync(path.join(root, 'figs'));
    writeFileSync(path.join(root, 'figs', 'trend.png'), Buffer.from(PNG, 'base64'));
    writeFileSync(path.join(root, 'refs.bib'), BIB);
    writeFileSync(path.join(root, 'main.aux'), AUX);
    const port = await freePort();
    server = spawnGalleryServer({root, port});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, target, url: `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(target)}`});
  } finally { await stop(server); await removeTempRoot(root); }
}

async function openVisual(page: Page, url: string) {
  await page.setViewportSize({width: 1200, height: 800});
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe('cm6');
  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect(page.locator('#toolbarVisual')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#toolbarVisual').click();
  await expect(page.locator('#toolbarVisual')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cm-editor.cm-latex-visual')).toBeVisible();
  // Curseur hors de toute construction (avant-dernière ligne) : tout est rendu.
  await page.evaluate(() => cm.setCursor({line: cm.lineCount() - 2, ch: 0}));
}

const chips = (page: Page) => page.locator('.cm-vis-chip').allTextContents();
const lineOf = (needle: string) => TEX.split('\n').findIndex(line => line.includes(needle));

test('LaTeX visuel : rendu des titres, citations, renvois et maths, source intacte', async ({page}) => {
  await withProject(async ({target, url}) => {
    await openVisual(page, url);
    await expect.poll(() => chips(page)).toEqual([
      '(Ren et al., 2021; Smith, 2020)', '3', '(Ren et al., 2021, p. 3)', 'Smith, 2020', '(1)', 'fig:none',
    ]);
    await expect(page.locator('.cm-vis-heading')).toHaveCount(2);
    await expect(page.locator('.cm-vis-math .katex')).toHaveCount(1);
    await expect(page.locator('.cm-vis-em')).toHaveText('over the zone');
    // Le balisage n'est plus affiché, mais le document n'a pas changé.
    const headingText = await page.locator('.cm-vis-heading').first().innerText();
    expect(headingText).not.toContain('\\section');
    expect(await page.evaluate(() => cm.getValue())).toBe(TEX);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
    await expect.poll(() => readFileSync(target, 'utf8')).toBe(TEX);
    // Le réglage suit la page : rechargée, elle revient en visuel.
    await page.reload();
    await expect(page.locator('#toolbarVisual')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cm-vis-cite').first()).toBeVisible();
    // Retour au code : plus aucune décoration.
    await page.locator('#toolbarVisual').click();
    await expect(page.locator('.cm-vis-chip')).toHaveCount(0);
    await expect(page.locator('.cm-vis-heading')).toHaveCount(0);
  });
});

test('LaTeX visuel : la source revient sous le curseur, la frappe va dans le fichier', async ({page}) => {
  await withProject(async ({url}) => {
    await openVisual(page, url);
    const line = lineOf('\\emph');
    const cite = TEX.split('\n')[line].indexOf('\\citep');
    // Curseur dans la citation : elle s'ouvre en source, les autres restent rendues.
    await page.evaluate(([l, ch]) => cm.setCursor({line: l, ch}), [line, cite + 3]);
    await expect.poll(() => chips(page)).not.toContain('(Ren et al., 2021; Smith, 2020)');
    await expect(page.locator('.cm-line', {hasText: '\\citep{ren2021,smith2020}'})).toHaveCount(1);
    // Flèches : le curseur avance caractère par caractère dans la source.
    await page.evaluate(() => cm.focus());
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => cm.getCursor())).toEqual({line, ch: cite + 4});
    // Frappe dans l'italique : le texte tape dans l'argument de \emph.
    const inside = TEX.split('\n')[line].indexOf('over the zone') + 'over'.length;
    await page.evaluate(([l, ch]) => cm.setCursor({line: l, ch}), [line, inside]);
    await page.keyboard.type(' all of');
    await expect.poll(() => page.evaluate((l) => cm.getLine(l), line)).toContain('\\emph{over all of the zone}');
    await expect(page.locator('.cm-vis-em')).toHaveText('over all of the zone');
    // Clic sur une pastille : le curseur s'y pose et la source apparaît.
    await page.evaluate(() => cm.setCursor({line: 9, ch: 0}));
    await expect.poll(() => chips(page)).toContain('Smith, 2020');
    await page.locator('.cm-vis-chip', {hasText: /^Smith, 2020$/}).click();
    await expect.poll(() => chips(page)).not.toContain('Smith, 2020');
    await expect(page.locator('.cm-line', {hasText: '\\citet{smith2020}'})).toHaveCount(1);
  });
});

test('LaTeX visuel : un glisser à la souris ne déplace rien sous le pointeur', async ({page}) => {
  await withProject(async ({url}) => {
    await openVisual(page, url);
    const line = lineOf('\\emph');
    const box = await page.locator('.cm-vis-cite').first().boundingBox();
    const start = await page.evaluate((l) => cm.charCoords({line: l, ch: 3}, 'window'), line);
    const chipCount = (await chips(page)).length;
    await page.mouse.move(start.left + 1, (start.top + start.bottom) / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width + 20, box!.y + box!.height / 2, {steps: 12});
    // Pendant le geste, rien ne s'ouvre : la pastille reste où elle était.
    expect((await chips(page)).length).toBe(chipCount);
    const during = await page.locator('.cm-vis-cite').first().boundingBox();
    expect(Math.abs(during!.x - box!.x)).toBeLessThan(1);
    await page.mouse.up();
    // La sélection porte sur la source, citation comprise.
    await expect.poll(() => page.evaluate(() => cm.getSelection())).toContain('\\citep{ren2021,smith2020}');
  });
});

test('LaTeX visuel : la revue des modifications montre la source brute', async ({page}) => {
  await withProject(async ({url}) => {
    await openVisual(page, url);
    await page.evaluate((text) => cm.showMergeDiff(text.replace('darken', 'brighten'), {individual: true}), TEX);
    await expect(page.locator('.cm-vis-chip')).toHaveCount(0);
    await expect(page.locator('.cm-line', {hasText: '\\citep{ren2021,smith2020}'}).first()).toBeVisible();
    await page.evaluate(() => cm.hideMergeDiff());
    await page.evaluate(() => cm.setCursor({line: 9, ch: 0}));
    await expect(page.locator('.cm-vis-cite').first()).toBeVisible();
  });
});

test('LaTeX visuel : équations centrées, listes et figures en bloc, source sous le curseur', async ({page}) => {
  await withProject(async ({url}) => {
    await openVisual(page, url);
    const lines = BLOCKS.split('\n');
    const last = lines.length - 2;
    await page.evaluate((l) => cm.setCursor({line: l, ch: 0}), last);
    await expect(page.locator('.cm-vis-display')).toHaveCount(2);
    await expect(page.locator('.cm-vis-display-number')).toHaveText(['(1)']);
    await expect.poll(() => page.locator('.cm-vis-item').allTextContents()).toEqual(['\u2022', '\u2022', '1.', '2.']);
    await expect(page.locator('.cm-line', {hasText: '\\begin{itemize}'})).toHaveCount(0);
    await expect(page.locator('.cm-vis-figure-caption')).toHaveText('Figure 3 : Albedo trend of the accumulation zone.');
    await expect.poll(() => page.locator('.cm-vis-figure img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    // Clic sur l'équation : sa source s'ouvre, les autres blocs restent rendus.
    await page.locator('.cm-vis-display').first().click();
    await expect(page.locator('.cm-vis-display')).toHaveCount(1);
    await expect(page.locator('.cm-line', {hasText: '\\alpha_t = \\beta_0'})).toHaveCount(1);
    // Frappe dans un \item : la liste reste en place (ses lignes \begin restent cachées).
    const item = lines.findIndex(line => line.includes('filter cloudy'));
    await page.evaluate(([l, ch]) => { cm.setCursor({line: l, ch}); cm.focus(); }, [item, lines[item].length - 1]);
    await page.keyboard.type(' first');
    await expect.poll(() => page.evaluate((l) => cm.getLine(l), item)).toBe('  \\item filter cloudy pixels first;');
    await expect(page.locator('.cm-line', {hasText: '\\begin{itemize}'})).toHaveCount(0);
    await expect(page.locator('.cm-vis-display')).toHaveCount(2);
    // Le document entier n'a changé que de la frappe.
    expect(await page.evaluate(() => cm.getValue())).toBe(BLOCKS.replace('pixels;', 'pixels first;'));
  }, BLOCKS);
});
