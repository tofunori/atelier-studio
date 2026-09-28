import {test, expect, type Page} from '@playwright/test';
import {build} from 'esbuild';
import {ChildProcess, spawn} from 'node:child_process';
import {copyFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {freePort, waitForServer, stopGalleryServer, serveHostPage, REPO_DIR, ASSETS_DIR} from '../gallery_server.mts';
import {removeTempRoot} from './temp-root.ts';

// Compile current sources in memory; a test never rewrites the shared bundles.
const compile = async (file: string|URL, globalName: string) => (await build({entryPoints: [new URL(file, import.meta.url).pathname],
  bundle: true, write: false, format: 'iife', globalName})).outputFiles[0].text;
const core = await compile('../../src/studio/core/index.ts', 'AtelierStudioCore');
const reading = await compile('../../src/studio/features/latex/reading.ts', 'LatexReading');
let root: string, server: ChildProcess, port: number;
test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-pdf-interaction-'));
  copyFileSync(path.join(REPO_DIR, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf'), path.join(root, 'twocol.pdf'));
  writeFileSync(path.join(root, 'figures_data.json'), '{"files":[]}');
  writeFileSync(path.join(root, 'figures_index.html'), '<html></html>');
  port = await freePort();
  server = spawn(path.join(REPO_DIR, 'rust/target/debug/atelier-gallery-server'),
    ['--root', root, '--port', String(port), '--no-watch'],
    {env: {...process.env, ATELIER_ASSETS_DIR: ASSETS_DIR, ATELIER_STUDIO: '1'}, stdio: 'ignore'});
  await waitForServer(port, {child: server});
});
test.afterAll(async () => {await stopGalleryServer(server); await removeTempRoot(root);});

async function openPdf(page: Page) {
  await page.route('**/studio_core.bundle.js', (route) => route.fulfill({contentType: 'text/javascript', body: core}));
  const host = await serveHostPage(page, port, `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
    <iframe src="/.fig_thumbs/pdf_viewer.html?file=twocol.pdf#atelier_nonce=test-nonce"></iframe>
    <script>window.requests=[];addEventListener('message',e=>{if(['atelier-attach-pdf','atelier-add-to-chat'].includes(e.data?.type))requests.push(e.data)});</script>`);
  await page.goto(host);
  const reader = page.frameLocator('iframe');
  await expect.poll(() => reader.locator('.textLayer span').count()).toBeGreaterThan(0);
  return reader;
}
async function ack(page: Page, values: Record<string, any> = {}) {
  await page.evaluate((values) => {
    const request = window.requests.at(-1);
    document.querySelector('iframe').contentWindow.postMessage({type: 'atelier-add-to-chat-ack',
      nonce: 'test-nonce', requestId: request.requestId, ok: true, ...values}, '*');
  }, values);
}

for (const activation of ['pointer', 'accessible']) test(`PDF palette takes focus from the parent before Escape (${activation})`, async ({page}) => {
  const reader = await openPdf(page);
  const box = await reader.locator('.textLayer span').first().boundingBox();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, {steps: 8});
  await page.mouse.up();
  const selected = await reader.locator('body').evaluate(() => hlText());
  expect(selected.length).toBeGreaterThan(5);
  const palette = reader.locator('.pdf-color-toggle');
  const color = await reader.locator('.pdf-current-color').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => {
    const tab = document.createElement('button'); tab.id = 'host-tab'; tab.textContent = 'PDF';
    tab.style.position = 'fixed'; document.body.appendChild(tab); tab.focus();
  });
  await expect(page.locator('#host-tab')).toBeFocused();
  // An AX activation can dispatch click without transferring the parent's focus.
  if (activation === 'accessible') await palette.evaluate((button) => (button as HTMLElement).click());
  else await palette.click();
  await expect(palette).toHaveAttribute('aria-expanded', 'true');
  await expect(palette).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveAttribute('aria-expanded', 'false');
  await expect(palette).toBeFocused();
  expect(await reader.locator('body').evaluate(() => hlText())).toBe(selected);
  expect(await reader.locator('.pdf-current-color').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(color);
  await expect(reader.locator('#selPill')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await reader.locator('body').evaluate(() => hlText())).toBe('');
});

test('PDF attachment waits for authenticated ACK, reports refusal, and can retry', async ({page}) => {
  const reader = await openPdf(page);
  const button = reader.locator('#chatPdfBtn');
  await button.click();
  await expect.poll(() => page.evaluate(() => requests.length)).toBe(1);
  await expect(button).toBeDisabled(); await expect(button).not.toHaveClass(/done/);
  await ack(page, {nonce: 'wrong'});
  await ack(page, {requestId: 'wrong'});
  // Even correct data originating inside the iframe is not an ACK from the host.
  const requestId = await page.evaluate(() => requests[0].requestId);
  await reader.locator('body').evaluate((_, requestId) => window.postMessage({type: 'atelier-add-to-chat-ack',
    requestId, nonce: 'test-nonce', ok: true}, '*'), requestId);
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await ack(page, {ok: false, error: 'Projet indisponible'});
  await expect(button).toBeEnabled(); await expect(button).toHaveClass(/error/);
  await expect(reader.locator('#status')).toContainText('Projet indisponible');
  await button.click();
  await expect.poll(() => page.evaluate(() => requests.length)).toBe(2);
  expect(await page.evaluate(() => requests[1].requestId !== requests[0].requestId)).toBe(true);
  await ack(page);
  await expect(button).toHaveClass(/done/); await expect(button).toBeEnabled();
  await expect(reader.locator('#status')).toHaveText('');
});

test('PDF attachment timeout never shows success and retries retain one request identity', async ({page}) => {
  const reader = await openPdf(page);
  const button = reader.locator('#chatPdfBtn');
  await button.click();
  await expect(button).toHaveClass(/error/, {timeout: 8000});
  await expect(button).not.toHaveClass(/done/); await expect(button).toBeEnabled();
  expect(await page.evaluate(() => ({count: requests.length, ids: new Set(requests.map((r) => r.requestId)).size})))
    .toEqual({count: 3, ids: 1});
  await expect(reader.locator('#status')).toContainText('non confirmé');
});

test('PDF annotation delivery reports success only after the host accepts it', async ({page}) => {
  const reader = await openPdf(page);
  await page.route('**/quote', route => route.fulfill({contentType: 'application/json', body: JSON.stringify({message: 'Citation préparée'})}));
  const send = () => reader.locator('body').evaluate(() => {
    window.annotationResult = 'pending'; window.annotationFailure = '';
    void sendAnnot({id: 'test-comment', page: 1, kind: 'comment', text: 'Passage', note: 'Garder le brouillon'},
(      why) => {annotationFailure = why;}, undefined, true).then(result => {annotationResult = result;});
  });
  await send();
  await expect.poll(() => page.evaluate(() => requests.length)).toBe(1);
  expect(await reader.locator('body').evaluate(() => annotationResult)).toBe('pending');
  await expect(reader.locator('#status')).not.toContainText('Annotation ajoutée');
  await ack(page, {ok: false, error: 'Conversation fermée'});
  await expect.poll(() => reader.locator('body').evaluate(() => annotationResult)).toBe(false);
  expect(await reader.locator('body').evaluate(() => annotationFailure)).toBe('Conversation fermée');
  await send();
  await expect.poll(() => page.evaluate(() => requests.length)).toBe(2);
  await ack(page);
  await expect.poll(() => reader.locator('body').evaluate(() => annotationResult)).toBe(true);
  await expect(reader.locator('#status')).toHaveText('Annotation ajoutée au chat');
});

test('PDF and shared annotations inherit light/dark colors and the host UI scale', async ({page}) => {
  const reader = await openPdf(page);
  await reader.locator('body').evaluate(() => {
    const note = document.createElement('div'); note.id = 'test-note';
    document.body.appendChild(note);
    window.AtelierAnnotationUI.createNoteEditor(note, {onSubmit(..._args) {}, onDelete(..._args) {}, placeholder: 'Note'});
  });
  for (const [scheme, base, bg, ink] of [['light', 12, '#ffffff', '#202124'], ['dark', 18, '#242930', '#dadee3']] as [string,number,string,string][]) {
    await page.evaluate(({scheme, base, bg, ink}) => document.querySelector('iframe').contentWindow.postMessage({
      type: 'atelier-theme', nonce: 'test-nonce', version: base, colorScheme: scheme, vars: {
        '--ui-base-size': `${base}px`, '--fs-body': `${Math.max(12, 13 * base / 15)}px`,
        '--fs-body-s': `${Math.max(11, 12 * base / 15)}px`, '--fs-label': `${Math.max(11, 11 * base / 15)}px`,
        '--surface-overlay': bg, '--text-primary': ink, '--control-height': `${30 * base / 15}px`,
      }}, '*'), {scheme, base, bg, ink});
    await expect(reader.locator('html')).toHaveAttribute('data-atelier-theme', String(base));
    const values = await reader.locator('body').evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      return {note: style('#test-note').backgroundColor, ink: style('#test-note').color,
        noteFont: parseFloat(style('#test-note textarea').fontSize), navFont: parseFloat(style('#pgCur').fontSize),
        pane: style('#annPane').backgroundColor, readingControls: parseFloat(style('#readBar button').fontSize),
        capsule: style('#selPill .atelier-capsule').backgroundColor,
        capsuleHeight: parseFloat(style('#selPill .atelier-capsule').height)};
    });
    expect(values.note).toBe(scheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(36, 41, 48)');
    expect(values.capsule).toBe(values.note);
    expect(values.pane).toBe(values.note);
    expect(values.ink).toBe(scheme === 'light' ? 'rgb(32, 33, 36)' : 'rgb(218, 222, 227)');
    expect(values.noteFont).toBeCloseTo(Math.max(12, 13 * base / 15), 1);
    expect(values.navFont).toBeCloseTo(Math.max(11, 12 * base / 15), 1);
    expect(values.readingControls).toBeCloseTo(Math.max(11, 12 * base / 15), 1);
    expect(values.capsuleHeight).toBe(Math.max(34, 30 * base / 15));
  }
});

test('PDF search navigation follows the current reduced-motion preference', async ({page}) => {
  const reader = await openPdf(page);
  await reader.locator('body').evaluate(() => {
    window.scrollCalls = [];
    const original = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function(options) {window.scrollCalls.push(options); return original.call(this, options);};
  });
  await page.emulateMedia({reducedMotion: 'reduce'});
  await reader.locator('#findBtn').click();
  await reader.locator('#findBar input').fill('glaciers');
  await expect(reader.locator('#findBar .cnt')).toHaveText(/^1\/\d+$/);
  await expect.poll(() => reader.locator('body').evaluate(() => scrollCalls.at(-1)?.behavior)).toBe('auto');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await reader.locator('#findBar .fnext').click();
  await expect.poll(() => reader.locator('body').evaluate(() => scrollCalls.at(-1)?.behavior)).toBe('smooth');
});

test('LaTeX reading navigation follows reduced motion without losing its target', async ({page}) => {
  await page.goto(await serveHostPage(page, port, '<header><button id="split"></button></header><div id="left"></div><div id="right"></div>'));
  await page.addScriptTag({content: reading});
  await page.evaluate(() => {
    window.scrollCalls = [];
    Element.prototype.scrollIntoView = function(options) {scrollCalls.push({line: this.dataset.line, ...(options as ScrollIntoViewOptions)});};
    window.controller = LatexReading.createLatexReadingController({getEditor: () => ({getValue: () => 'Premier passage.\n\nDeuxième passage.', refresh(..._args) {}}),
      right: document.getElementById('right'), splitButton: document.getElementById('split'),
      setPdfVisible(..._args) {}, revealLine(..._args) {}, katex: {renderToString: (value) => value}});
    controller.setRead(true);
  });
  for (const [preference, behavior] of [['reduce', 'auto'], ['no-preference', 'smooth']] as const) {
    await page.emulateMedia({reducedMotion: preference});
    expect(await page.evaluate(() => controller.revealSourceLine(2))).toBe(true);
    expect(await page.evaluate(() => scrollCalls.at(-1))).toMatchObject({line: '3', block: 'start', behavior});
  }
});
