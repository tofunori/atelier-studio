// Grammaire LaTeX Lezer (parseur Overleaf) dans l'éditeur cm6 : coloration
// par nœuds, pliage par environnement/section, plan par arbre, diagnostics de
// structure et de compilation. Rejoué aussi en WebKit (moteur du WKWebView).
import {test, expect} from '@playwright/test';
import { spawnGalleryServer, freePort, stopGalleryServer as stop } from '../gallery_server.mjs';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {removeTempRoot} from './temp-root.js';


const DOC = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Introduction',
  '  générale}',
  'Texte avec \\emph{accent} et $a+b$.',
  '\\begin{itemize}',
  '\\item un',
  '\\item deux',
  '\\end{itemize}',
  '\\subsection{Méthodes}',
  'Suite.',
  '\\end{document}',
  '',
].join('\n');

async function withTex(text, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-lezer-'));
  const target = path.join(root, 'main.tex');
  let server;
  try {
    writeFileSync(target, text);
    const port = await freePort();
    server = spawnGalleryServer({ root, port });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, target, url: `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(target)}`});
  } finally { await stop(server); await removeTempRoot(root); }
}

async function open(page, url) {
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe('cm6');
  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect.poll(() => page.evaluate(() => cm.hasSyntaxTree === true)).toBe(true);
}

test('LaTeX Lezer : coloration par nœuds, pliage, plan par arbre', async ({page}) => {
  await withTex(DOC, async ({url}) => {
    await open(page, url);
    // Coloration : la commande de sectionnement et le corps n'ont pas la même couleur.
    const colors = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.cm-line')];
      const section = lines[2].querySelector('span');
      const body = lines[10];
      return {section: section && getComputedStyle(section).color, body: getComputedStyle(body).color, spans: lines[4].querySelectorAll('span').length};
    });
    expect(colors.section).toBeTruthy();
    expect(colors.section).not.toBe(colors.body);
    expect(colors.spans).toBeGreaterThan(1);
    // Plan par arbre : titre multi-lignes reconstitué.
    const outline = await page.evaluate(() => cm.getOutline());
    expect(outline.map(item => [item.level, item.title, item.line])).toEqual([[1, 'Introduction générale', 2], [2, 'Méthodes', 9]]);
    // Pliage : l'environnement itemize a un marqueur, le pli cache « \item un ».
    const lineCountBefore = await page.locator('.cm-line').count();
    await page.locator('.cm-foldGutter .cm-gutterElement').nth(5).locator('span').click();
    await expect.poll(() => page.locator('.cm-line').count()).toBeLessThan(lineCountBefore);
    await expect(page.locator('.cm-foldPlaceholder')).toBeVisible();
  });
});

test('LaTeX Lezer : diagnostics de structure et de compilation', async ({page}) => {
  await withTex(DOC, async ({url}) => {
    await open(page, url);
    // Compilation : les erreurs `! … l.N` du log deviennent des diagnostics ancrés.
    await page.evaluate(() => cm.setDiagnostics([
      {line: 5, message: 'Undefined control sequence.', severity: 'error'},
      {line: 11, message: 'Overfull \\hbox', severity: 'warning'},
    ]));
    await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
    await expect(page.locator('.cm-lintRange-warning')).toHaveCount(1);
    await expect(page.locator('.cm-gutter-lint .cm-lint-marker-error')).toHaveCount(1);
    // Une frappe ailleurs ne les efface pas (champ dédié, relu par le linter).
    await page.evaluate(() => cm.replaceRange('x', {line: 0, ch: 0}));
    await page.waitForTimeout(900);
    await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
    // Nouvelle compilation propre : plus rien.
    await page.evaluate(() => cm.setDiagnostics([]));
    await expect(page.locator('.cm-lintRange-error')).toHaveCount(0);
    // Structure : une accolade laissée ouverte est signalée en avertissement.
    await page.evaluate(() => cm.replaceRange('\\textbf{ouvert\n', {line: 10, ch: 0}));
    await expect.poll(() => page.locator('.cm-lintRange-warning').count(), {timeout: 5000}).toBeGreaterThan(0);
  });
});
