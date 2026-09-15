import {test, expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

const source = new URL('../../src/studio/features/latex/pdf_sync.ts', import.meta.url).pathname;
const bundle = (await build({entryPoints: [source], bundle: true, write: false,
  format: 'iife', globalName: 'PdfSync'})).outputFiles[0].text;
const css = (await readFile(new URL('../../assets/latex_studio.css', import.meta.url), 'utf8'))
  .replace('@import url("./scrollbars.css");', await readFile(new URL('../../assets/scrollbars.css', import.meta.url), 'utf8'));

for (const zoom of [1, 0.1]) {
  test(`PDF refresh keeps painted pages and scroll position at zoom ${zoom}`, async ({page}) => {
    await page.setContent('<div id="right"><div id="marker"></div></div>');
    await page.addStyleTag({content: css + '\n#right{position:absolute;top:0;left:0;width:624px;height:650px;}'});
    await page.addScriptTag({content: bundle});
    await page.evaluate(async zoom => {
      const right = document.getElementById('right');
      window.revision = 1;
      window.waiting = 0;
      window.gate = new Promise(resolve => { window.release = resolve; });
      window.fetch = async () => ({ok: true, json: async () => ({mtime: window.revision})});
      const pdfjs = {getDocument() {
        const revision = window.revision;
        return {promise: Promise.resolve({numPages: 16, getPage: async () => ({
          getViewport: ({scale}) => ({width: 600 * scale, height: 800 * scale}),
          render: ({canvasContext, viewport}) => ({promise: (async () => {
            if (revision === 2) { window.waiting++; await window.gate; }
            canvasContext.fillStyle = revision === 1 ? '#336699' : '#669933';
            canvasContext.fillRect(0, 0, viewport.width, viewport.height);
            canvasContext.canvas.dataset.revision = String(revision);
          })()}),
        })})};
      }};
      window.controller = PdfSync.createLatexPdfSyncController({path: '/test.tex', isPdfMode: false,
        getPdfPath: () => '/test.pdf', getZoom: () => zoom, getEditor: () => null,
        right, marker: document.getElementById('marker'), pdfjs, channel: null,
        setState() {}, revealLine() {}});
      await window.controller.loadPdf();
      right.scrollTop = zoom === 1 ? 2700 : 200;
      window.visiblePages = () => [...right.querySelectorAll('.pdfpage')].filter(el => {
        const bounds = el.getBoundingClientRect(), pane = right.getBoundingClientRect();
        return bounds.bottom > pane.top && bounds.top < pane.bottom;
      });
    }, zoom);
    await expect.poll(() => page.evaluate(() => visiblePages().every(el => el.querySelector('canvas')))).toBe(true);
    await page.evaluate(() => {
      window.oldPage = visiblePages()[0];
      window.oldTop = oldPage.getBoundingClientRect().top;
      window.revision = 2;
      window.refresh = controller.loadPdf();
    });
    await expect.poll(() => page.evaluate(() => waiting)).toBeGreaterThan(0);
    expect(await page.evaluate(() => ({connected: oldPage.isConnected,
      top: oldPage.getBoundingClientRect().top === oldTop,
      painted: visiblePages().every(el => el.querySelector('canvas[data-revision="1"]'))})))
      .toEqual({connected: true, top: true, painted: true});
    await page.evaluate(async () => {
      const right = document.getElementById('right');
      right.scrollTop += 40;
      window.expectedScroll = right.scrollTop;
      window.blankFrames = 0;
      let monitor = true;
      function frame() {
        if (!monitor) return;
        if (!visiblePages().length || visiblePages().some(el => !el.querySelector('canvas'))) blankFrames++;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      release();
      await refresh;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      monitor = false;
    });
    expect(await page.evaluate(() => ({oldRemoved: !oldPage.isConnected,
      scroll: document.getElementById('right').scrollTop === expectedScroll,
      blankFrames, painted: visiblePages().every(el => el.querySelector('canvas[data-revision="2"]'))})))
      .toEqual({oldRemoved: true, scroll: true, blankFrames: 0, painted: true});
  });
}
