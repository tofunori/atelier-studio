import {test, expect, type Page} from '@playwright/test';
import {ChildProcess, spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {freePort, waitForServer, stopGalleryServer, serveHostPage, REPO_DIR, ASSETS_DIR} from '../gallery_server.mts';
import {removeTempRoot} from './temp-root.ts';

// Une police peut annoncer Ascent = Descent = 0 (vécu 2026-10-19 sur un
// manuscrit) : la couche texte posait alors le haut des spans sur la ligne
// de base, et la sélection bleue couvrait l'interligne SOUS la ligne au lieu
// du texte. PDF minimal écrit à la main : Times-Roman, métriques au choix.
const LINES = ['the main source of energy for melting snow and ice (Gardner and Sharp, 2010). In western',
  'America, Williamson et al. (2025) attribute 31% of the change in glacier mass balance',
  'the 2000s and the 2010s to an albedo decline mediated by air temperature. Many glaciers',
  'are surrounded by extensive coniferous and boreal forests at lower elevations (Parisien'];
const PAGE_H = 400, FONT = 11, FIRST_BASELINE = 340, LEADING = 26;
function metricsPdf(ascent: number, descent: number){
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => '\\' + c);
  const content = 'BT\n' + LINES.map((l, i) => `/F1 ${FONT} Tf 1 0 0 1 40 ${FIRST_BASELINE - i*LEADING} Tm (${esc(l)}) Tj`).join('\n') + '\nET\n';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 ${PAGE_H}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding /FontDescriptor 6 0 R >>',
    `<< /Type /FontDescriptor /FontName /Times-Roman /Flags 34 /FontBBox [-168 -218 1000 898] /ItalicAngle 0 /Ascent ${ascent} /Descent ${descent} /CapHeight 662 /StemV 84 >>`];
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  return out + `xref\n0 ${objs.length+1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

let root: string, server: ChildProcess, port: number;
test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-pdf-metrics-'));
  writeFileSync(path.join(root, 'zero.pdf'), metricsPdf(0, 0));
  writeFileSync(path.join(root, 'normal.pdf'), metricsPdf(683, -217));
  writeFileSync(path.join(root, 'figures_data.json'), '{"files":[]}');
  writeFileSync(path.join(root, 'figures_index.html'), '<html></html>');
  port = await freePort();
  server = spawn(path.join(REPO_DIR, 'rust/target/debug/atelier-gallery-server'),
    ['--root', root, '--port', String(port), '--no-watch'],
    {env: {...process.env, ATELIER_ASSETS_DIR: ASSETS_DIR, ATELIER_STUDIO: '1'}, stdio: 'ignore'});
  await waitForServer(port, {child: server});
});
test.afterAll(async () => {await stopGalleryServer(server); await removeTempRoot(root);});

async function openPdf(page: Page, file: string) {
  const host = await serveHostPage(page, port, `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
    <iframe src="/.fig_thumbs/pdf_viewer.html?file=${file}#atelier_nonce=test-nonce"></iframe>`);
  await page.goto(host);
  const reader = page.frameLocator('iframe');
  await expect.poll(() => reader.locator('.pg[data-page="1"] .textLayer span').count()).toBe(LINES.length);
  return reader;
}

for (const file of ['zero.pdf', 'normal.pdf']) test(`the selection covers the glyphs of the dragged line (${file})`, async ({page}) => {
  const reader = await openPdf(page, file);
  const pg = (await reader.locator('.pg[data-page="1"]').boundingBox())!;
  const scale = pg.height / PAGE_H, em = FONT * scale;
  const baseline = (line: number) => pg.y + (PAGE_H - FIRST_BASELINE + line * LEADING) * scale;
  // Glisser au milieu de la hauteur d'x de la 3e ligne, là où l'œil vise.
  const y = baseline(2) - 0.25 * em;
  await page.mouse.move(pg.x + 60 * scale, y);
  await page.mouse.down();
  await page.mouse.move(pg.x + 260 * scale, y, {steps: 8});
  await page.mouse.up();
  const text = await reader.locator('body').evaluate(() => hlText());
  expect(text).toContain('2010s to an albedo');
  const rects = await reader.locator('.pdfsel').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect(); return {top: r.top, bottom: r.bottom};
  }));
  expect(rects).toHaveLength(1);
  const frame = (await page.locator('iframe').boundingBox())!;
  const top = rects[0].top + frame.y, bottom = rects[0].bottom + frame.y;
  // Le rectangle couvre les capitales (≈ 0,66 em au-dessus de la ligne de
  // base) et s'arrête avant le haut de la ligne suivante.
  expect(top).toBeLessThan(baseline(2) - 0.6 * em);
  expect(bottom).toBeGreaterThan(baseline(2));
  expect(bottom).toBeLessThan(baseline(3) - 0.7 * em);
});
