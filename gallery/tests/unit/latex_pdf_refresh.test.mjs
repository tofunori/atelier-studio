import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

// Compile the current controller in memory, without regenerating tracked bundles.
const compiled = await build({entryPoints: [fileURLToPath(new URL('../../src/studio/features/latex/pdf_sync.ts', import.meta.url))], bundle: true, write: false, format: 'iife', globalName: 'PdfSync', platform: 'browser'});
const context = {console: {warn() {}}};
vm.runInNewContext(compiled.outputFiles[0].text, context);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
const flush = async () => {for (let i = 0; i < 30; i++) await Promise.resolve();};

function harness(t) {
  const dom = new JSDOM('<div id="right"></div><div id="marker"></div>', {pretendToBeVisual: true});
  t.after(() => dom.window.close());
  const win = dom.window;
  const right = win.document.getElementById('right');
  Object.defineProperties(right, {clientWidth: {value: 624}, clientHeight: {value: 800}});
  // JSDOM has no layout engine: model the one-page viewport explicitly.
  Object.defineProperties(win.HTMLElement.prototype, {
    scrollHeight: {configurable: true, get() {return this.querySelector('.pdfpage') ? 1000 : 0;}},
    offsetHeight: {configurable: true, get() {return this.classList.contains('pdfpage') ? 1000 : 0;}},
    offsetTop: {configurable: true, get() {return 0;}},
  });
  win.HTMLCanvasElement.prototype.getContext = () => ({scale() {}});
  let poll, mtime = 1;
  win.setInterval = callback => {poll = callback; return 1;};
  win.fetch = async () => ({ok: true, json: async () => ({mtime})});
  const queue = [], requests = [];
  const controller = context.PdfSync.createLatexPdfSyncController({
    path: 'main.tex', isPdfMode: false, getPdfPath: () => 'main.pdf', getZoom: () => 1,
    getEditor: () => null, right, marker: win.document.getElementById('marker'),
    pdfjs: {getDocument(options) {requests.push(options.url); assert.ok(queue.length, 'unexpected PDF reload'); return {promise: queue.shift()};}},
    channel: null, setState() {}, revealLine() {}, document: win.document, window: win,
  });
  function document({pageGate, renderGate} = {}) {
    const page = {getViewport: ({scale}) => ({width: 600 * scale, height: 1000 * scale}), render: () => ({promise: renderGate?.promise || Promise.resolve()})};
    return {numPages: 1, getPage: async () => {if (pageGate) await pageGate.promise; return page;}};
  }
  return {right, controller, requests, queue, document, setMtime(value) {mtime = value;}, async poll() {poll(); await flush();}, async initial() {queue.push(Promise.resolve(document())); await controller.loadPdf(); assert.ok(right.querySelector('canvas')); return right.querySelector('.pdfpage');}};
}

test('refresh retains the old page through download, page decoding and rendering, then swaps', async t => {
  const h = harness(t), old = await h.initial();
  h.right.scrollTop = 120;
  const download = deferred(), pageGate = deferred(), renderGate = deferred();
  h.queue.push(download.promise);
  const loading = h.controller.loadPdf();
  await flush();
  assert.equal(h.right.querySelector('.pdfpage'), old);
  const status = h.right.querySelector('.pdf-load-status');
  assert.ok(status.hidden || status.style.position === 'absolute', 'refresh status must not shift existing pages');
  download.resolve(h.document({pageGate, renderGate})); await flush();
  assert.equal(h.right.querySelector('.pdfpage'), old);
  pageGate.resolve(); await flush();
  assert.equal(h.right.querySelector('.pdfpage'), old);
  assert.ok(old.querySelector('canvas'));
  renderGate.resolve(); await loading;
  assert.notEqual(h.right.querySelector('.pdfpage'), old);
  assert.ok(h.right.querySelector('.pdfpage canvas'));
  assert.equal(old.isConnected, false);
  assert.equal(h.right.scrollTop, 120);
});

for (const failure of ['download', 'render']) test(`failed ${failure} keeps the last readable PDF`, async t => {
  const h = harness(t), old = await h.initial();
  const gate = deferred();
  h.queue.push(failure === 'download' ? gate.promise : Promise.resolve(h.document({renderGate: gate})));
  const loading = h.controller.loadPdf(); await flush();
  gate.reject(new Error('deliberate failure')); await loading;
  assert.equal(h.right.querySelector('.pdfpage'), old);
  assert.ok(old.querySelector('canvas'));
  assert.equal(h.controller.hasDocument(), true);
});

test('mtime watcher does not reload a revision already refreshed after compilation', async t => {
  const h = harness(t); await h.initial(); await h.poll();
  h.setMtime(2); h.queue.push(Promise.resolve(h.document()));
  await h.controller.loadPdf(); await h.poll();
  assert.equal(h.requests.length, 2);
  h.setMtime(3); h.queue.push(Promise.resolve(h.document()));
  await h.poll();
  assert.equal(h.requests.length, 3, 'an external change must still reload');
});

test('an older delayed refresh cannot replace a newer completed revision', async t => {
  const h = harness(t); await h.initial();
  const gate = deferred(); h.queue.push(Promise.resolve(h.document({renderGate: gate})));
  const older = h.controller.loadPdf(); await flush();
  h.queue.push(Promise.resolve(h.document())); await h.controller.loadPdf();
  const newest = h.right.querySelector('.pdfpage');
  gate.resolve(); await older;
  assert.equal(h.right.querySelector('.pdfpage'), newest);
  assert.equal(h.right.querySelectorAll('.pdfpage').length, 1);
});

test('a revision written during rendering remains detectable by the watcher', async t => {
  const h = harness(t); await h.initial();
  h.setMtime(2);
  const gate = deferred(); h.queue.push(Promise.resolve(h.document({renderGate: gate})));
  const loading = h.controller.loadPdf(); await flush();
  h.setMtime(3);
  gate.resolve(); await loading;
  h.queue.push(Promise.resolve(h.document())); await h.poll();
  assert.equal(h.requests.length, 3);
});

test('scrolling while the replacement renders is preserved at the swap', async t => {
  const h = harness(t); await h.initial(); h.right.scrollTop = 20;
  const gate = deferred(); h.queue.push(Promise.resolve(h.document({renderGate: gate})));
  const loading = h.controller.loadPdf(); await flush();
  h.right.scrollTop = 160;
  gate.resolve(); await loading;
  assert.equal(h.right.scrollTop, 160);
});
