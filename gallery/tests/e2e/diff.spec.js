import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, utimesSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INITIAL_TEXT = [
  '\\section{Observations}',
  'The glacier surface stayed bright after fresh snow covered the dark ice.',
  'Summer temperatures remained moderate across the upper basin.',
  'Snow depth observations remained stable at the central station.',
  'Wind speed stayed low during the afternoon measurement window.',
  'Cloud cover remained scattered above the upper accumulation zone.',
  'Measured albedo declined near the exposed terminus late in the season.',
  '',
].join('\n');
const CODE_INITIAL_TEXT = [
  'def summarize(surface):',
  '    albedo = surface["albedo"]',
  '    temperature = surface["temperature"]',
  '    return albedo, temperature',
  '',
].join('\n');

const EDITORS = {
  latex: { asset: 'latex_studio.html', filename: 'contract.tex', initialText: INITIAL_TEXT, query: '&engine=cm5' },
  code: { asset: 'code_editor.html', filename: 'contract.py', initialText: CODE_INITIAL_TEXT, query: '' },
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForPing(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ping`);
      if (response.ok) return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`server on ${port} did not answer /ping`);
}

function waitForExit(server, timeoutMs) {
  if (server.exitCode !== null || server.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = exited => {
      clearTimeout(timer);
      server.off('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    server.once('exit', onExit);
  });
}

async function stopServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  server.kill('SIGTERM');
  if (await waitForExit(server, 1000)) return;
  server.kill('SIGKILL');
  await waitForExit(server, 1000);
}

async function withEditor(kind, run, engine = kind === 'latex' ? 'cm5' : null) {
  const editor = EDITORS[kind];
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-diff-e2e-'));
  const filePath = path.join(root, editor.filename);
  let server;
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'diff-e2e@atelier.test'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Atelier Diff E2E'], { cwd: root });
    writeFileSync(filePath, editor.initialText);
    execFileSync('git', ['add', editor.filename], { cwd: root });
    execFileSync('git', ['commit', '-qm', `initial ${kind} fixture`], { cwd: root });

    const port = await freePort();
    server = spawn(process.execPath, [path.join(GALLERY, 'server', 'main.mjs')], {
      cwd: root,
      env: { ...process.env, FIG_PORT: String(port), GALLERY_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForPing(port);
    const engineQuery = kind === 'latex' ? `&engine=${engine}` : editor.query;
    const url = `http://127.0.0.1:${port}/.fig_thumbs/${editor.asset}?path=${encodeURIComponent(filePath)}${engineQuery}`;
    await run({ root, filePath, texPath: filePath, port, url, kind, initialText: editor.initialText });
  } finally {
    await stopServer(server);
    rmSync(root, { recursive: true, force: true });
  }
}

async function withLatexStudio(engineOrRun, maybeRun) {
  const engine = typeof engineOrRun === 'string' ? engineOrRun : 'cm5';
  const run = typeof engineOrRun === 'function' ? engineOrRun : maybeRun;
  return withEditor('latex', run, engine);
}

async function openEditor(page, url, kind = 'latex', engine = 'cm5') {
  await page.goto(url);
  if (kind === 'latex') await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe(engine);
  await expect.poll(() => page.evaluate(() => typeof cm !== 'undefined' && Boolean(cm))).toBe(true);
  await expect(page.locator(engine === 'cm6' ? '.cm-editor' : '.CodeMirror')).toBeVisible();
}

function watchEditorTraffic(page) {
  const versionPayloads = [];
  page.on('request', request => {
    if (request.method() !== 'POST' || !request.url().endsWith('/versions')) return;
    versionPayloads.push(request.postDataJSON());
  });
  return { versionPayloads };
}

async function setEditorText(page, text) {
  await page.evaluate(nextText => {
    const lastLine = cm.lastLine();
    cm.replaceRange(
      nextText,
      { line: 0, ch: 0 },
      { line: lastLine, ch: cm.getLine(lastLine).length },
      '+input',
    );
  }, text);
}

const editorText = page => page.evaluate(() => cm.getValue());

async function pasteIntoEditor(page, engine, text) {
  return page.evaluate(({engine, text}) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', text);
    const target = engine === 'cm5' ? cm.getInputField() : document.querySelector('.cm-content');
    target.focus();
    if (engine === 'cm5') target.value = text;
    target.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: transfer,
    }));
    return target.tagName;
  }, {engine, text});
}

let externalWriteSequence = 0;
function writeExternal(filePath, text) {
  const tempPath = path.join(path.dirname(filePath),
    `.${path.basename(filePath)}.external-${process.pid}-${++externalWriteSequence}.tmp`);
  writeFileSync(tempPath, text);
  const changedAt = new Date(Date.now() + 1000);
  utimesSync(tempPath, changedAt, changedAt);
  renameSync(tempPath, filePath);
}

function matchingInterventions(payload, expected) {
  return (payload?.ops || []).filter(op => op.type === 'append').map(op => ({
    ...op.intervention,
    before: op.texts?.[op.intervention.fromHash],
    after: op.texts?.[op.intervention.toHash],
  })).filter(entry =>
    entry.before === expected.before
      && entry.after === expected.after
      && entry.source === expected.source
      && entry.status === expected.status);
}

function allInterventions(payloads) {
  const byId = new Map();
  for (const payload of payloads) {
    for (const op of payload?.ops || []) if (op.type === 'append') byId.set(op.intervention.id, op);
  }
  return [...byId.values()];
}

function hasIntervention(payloads, expected) {
  return payloads.some(payload => matchingInterventions(payload, expected).length > 0);
}

async function expectSingleStableIntervention(page, versionPayloads, expected) {
  await expect.poll(() => {
    return { total: allInterventions(versionPayloads).length,
      matching: versionPayloads.flatMap(payload => matchingInterventions(payload, expected)).length };
  }).toEqual({ total: 1, matching: 1 });
  const postCount = versionPayloads.length;
  const nextCodeResponse = page.waitForResponse(response =>
    response.request().method() === 'GET' && new URL(response.url()).pathname === '/code');
  await nextCodeResponse;
  const duplicateVersionPost = await page.waitForRequest(request =>
    request.method() === 'POST' && request.url().endsWith('/versions'), { timeout: 1000 })
    .then(request => request, () => null);
  expect(duplicateVersionPost).toBeNull();
  expect(versionPayloads).toHaveLength(postCount);
  expect(allInterventions(versionPayloads)).toHaveLength(1);
  expect(versionPayloads.flatMap(payload => matchingInterventions(payload, expected))).toHaveLength(1);
}

async function saveOnce(page) {
  const savedLabel = page.locator('#sbSaved');
  await savedLabel.evaluate(element => { element.textContent = ''; });
  const saved = page.waitForResponse(response =>
    response.url().endsWith('/codesave') && response.request().method() === 'POST');
  await page.locator('#saveBtn').evaluate(button => button.click());
  expect((await saved).ok()).toBe(true);
  await expect(savedLabel).toContainText('sauvegardé');
}

async function replaceTextAndSave(page, text) {
  await page.evaluate(nextText => {
    const cm = window.cm;
    const lastLine = cm.lastLine();
    cm.replaceRange(
      nextText,
      { line: 0, ch: 0 },
      { line: lastLine, ch: cm.getLine(lastLine).length },
      '+input',
    );
  }, text);
  await saveOnce(page);
}

async function replaceLineAndSave(page, line, text) {
  await page.evaluate(({ lineNumber, nextText }) => {
    const cm = window.cm;
    cm.replaceRange(
      nextText,
      { line: lineNumber, ch: 0 },
      { line: lineNumber, ch: cm.getLine(lineNumber).length },
      '+input',
    );
  }, { lineNumber: line, nextText: text });
  await saveOnce(page);
}

test('CM5: one multi-word save is one intervention', async ({ page }) => {
  await withLatexStudio(async ({ url }) => {
    await openEditor(page, url);
    const changed = INITIAL_TEXT.replace(
      'stayed bright after fresh snow covered the dark ice',
      'became visibly darker after wind removed most fresh snow',
    );

    await replaceTextAndSave(page, changed);
    await page.locator('#diffTag').click();

    const nav = page.locator('#dvNav');
    const count = nav.locator('.dvNavC');
    await expect(count).toHaveText('tout · 1');
    await nav.locator('[data-d="-1"]').click();
    await expect(count).toHaveText('1 / 1');

    await page.locator('#diffTag').click();
    await expect(nav).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.cm.getOption('readOnly'))).toBe(false);
  });
});

test('CM5: three spatially separated saves are three interventions', async ({ page }) => {
  await withLatexStudio(async ({ url }) => {
    await openEditor(page, url);

    await replaceLineAndSave(page, 1,
      'The glacier surface darkened after wind exposed the underlying ice.');
    await replaceLineAndSave(page, 2,
      'Summer temperatures increased sharply across the upper basin.');
    await replaceLineAndSave(page, 3,
      'Measured albedo recovered near the exposed terminus late in the season.');

    await page.locator('#diffTag').click();
    const nav = page.locator('#dvNav');
    const count = nav.locator('.dvNavC');
    const previous = nav.locator('[data-d="-1"]');
    await expect(count).toHaveText('tout · 3');

    await previous.click();
    await expect(count).toHaveText('3 / 3');
    await previous.click();
    await expect(count).toHaveText('2 / 3');
    await previous.click();
    await expect(count).toHaveText('1 / 3');

    await count.click();
    await expect(count).toHaveText('tout · 3');
  });
});

test('CM5: reload preserves three interventions and restore 2/3 becomes intervention four', async ({ page }) => {
  await withLatexStudio(async ({ url }) => {
    await openEditor(page, url);
    const s1 = INITIAL_TEXT.replace(
      'stayed bright after fresh snow covered the dark ice',
      'darkened after wind exposed the underlying ice',
    );
    const s2 = s1.replace(
      'Summer temperatures remained moderate across the upper basin.',
      'Summer temperatures increased sharply across the upper basin.',
    );
    const s3 = s2.replace(
      'Snow depth observations remained stable at the central station.',
      'Snow depth observations declined at the central station.',
    );
    await replaceTextAndSave(page, s1);
    await replaceTextAndSave(page, s2);
    await replaceTextAndSave(page, s3);

    await page.locator('#diffTag').click();
    const count = page.locator('#dvNav .dvNavC');
    const previous = page.locator('#dvNav [data-d="-1"]');
    await expect(count).toHaveText('tout · 3');
    await previous.click();
    await previous.click();
    await expect(count).toHaveText('2 / 3');
    await expect.poll(() => editorText(page)).toBe(s2);

    const saved = page.waitForResponse(response =>
      response.url().endsWith('/codesave') && response.request().method() === 'POST');
    const persisted = page.waitForResponse(response =>
      response.url().endsWith('/versions') && response.request().method() === 'POST' && response.ok());
    await page.locator('#diffRestore').click();
    expect((await saved).ok()).toBe(true);
    await persisted;
    await expect.poll(() => editorText(page)).toBe(s2);

    await page.reload();
    await openEditor(page, url);
    await page.locator('#diffTag').click();
    await expect(page.locator('#dvNav .dvNavC')).toHaveText('tout · 4');
    await expect.poll(() => editorText(page)).toBe(s2);
  });
});

test('CM5: two open pages converge through one 409 retry without losing either intervention', async ({ page, context }) => {
  await withLatexStudio(async ({ url }) => {
    const other = await context.newPage();
    try {
      await openEditor(page, url);
      await openEditor(other, url);
      const left = INITIAL_TEXT.replace('Summer temperatures remained moderate', 'LEFT temperatures increased');
      const right = INITIAL_TEXT.replace('Measured albedo declined', 'RIGHT albedo recovered');
      await Promise.all([
        page.evaluate(({ before, after }) => { cm.setValue(after); __dv.push(before, after,
          {source: 'user-save', status: 'applied'}); }, { before: INITIAL_TEXT, after: left }),
        other.evaluate(({ before, after }) => { cm.setValue(after); __dv.push(before, after,
          {source: 'user-save', status: 'applied'}); }, { before: INITIAL_TEXT, after: right }),
      ]);
      await expect.poll(() => page.evaluate(async () => {
        const state = await (await fetch('/versions?path=' + encodeURIComponent(path))).json();
        return { revision: state.revision, count: state.interventions?.length || 0,
          distinctIds: new Set((state.interventions || []).map(item => item.id)).size };
      }), { timeout: 7000 }).toEqual({ revision: 2, count: 2, distinctIds: 2 });
    } finally {
      await other.close();
    }
  });
});

test('CM5: save and clean disk reload keep explicit intervention sources', async ({ page }) => {
  await withLatexStudio(async ({ texPath, url }) => {
    const traffic = watchEditorTraffic(page);
    const { versionPayloads } = traffic;

    await openEditor(page, url);
    const savedText = INITIAL_TEXT.replace(
      'stayed bright after fresh snow covered the dark ice',
      'became visibly darker after wind removed most fresh snow',
    );
    await replaceTextAndSave(page, savedText);

    await expect.poll(() => hasIntervention(versionPayloads, {
      before: INITIAL_TEXT, after: savedText, source: 'user-save', status: 'applied',
    })).toBe(true);

    const diskText = savedText.replace(
      'Measured albedo declined near the exposed terminus late in the season.',
      'Measured albedo recovered after the external observation was applied.',
    );
    writeExternal(texPath, diskText);

    await expect.poll(() => editorText(page), { timeout: 7000 }).toBe(diskText);
    await expect.poll(() => hasIntervention(versionPayloads, {
      before: savedText, after: diskText, source: 'external-reload', status: 'applied',
    })).toBe(true);

    const interventionCount = allInterventions(versionPayloads).length;
    const versionPostCount = versionPayloads.length;
    const nextCodeResponse = page.waitForResponse(response =>
      response.request().method() === 'GET' && new URL(response.url()).pathname === '/code');
    await nextCodeResponse;
    const duplicateVersionPost = await page.waitForRequest(request =>
      request.method() === 'POST' && request.url().endsWith('/versions'), { timeout: 1000 })
      .then(request => request, () => null);
    expect(duplicateVersionPost).toBeNull();
    expect(versionPayloads).toHaveLength(versionPostCount);
    expect(allInterventions(versionPayloads)).toHaveLength(interventionCount);
  });
});

for (const engine of ['cm5', 'cm6']) {
  test.describe(engine.toUpperCase(), () => {
    test('diff multi-zone is one intervention', async ({ page }) => {
      await withLatexStudio(engine, async ({ url }) => {
        let saveRequests = 0;
        page.on('request', request => {
          if (request.method() === 'POST' && request.url().endsWith('/codesave')) saveRequests += 1;
        });
        await openEditor(page, url, 'latex', engine);
        const lineNumbers = page.locator(engine === 'cm6' ? '.cm-lineNumbers' : '.CodeMirror-linenumbers');
        const foldGutter = page.locator(engine === 'cm6' ? '.cm-foldGutter' : '.CodeMirror-foldgutter');
        await expect(lineNumbers).toBeVisible();
        await expect(foldGutter).toHaveCount(1);
        await page.evaluate(() => { cm.setCursor({line: 0, ch: 0}); cm.focus(); });
        const editablePasteTarget = await pasteIntoEditor(page, engine, 'editable-paste-');
        if (engine === 'cm5') expect(editablePasteTarget).toBe('TEXTAREA');
        await expect.poll(() => editorText(page)).toBe(`editable-paste-${INITIAL_TEXT}`);
        await page.evaluate((initial) => cm.setValue(initial), INITIAL_TEXT);
        const changed = INITIAL_TEXT
          .replace('surface stayed bright', 'surface visibly stayed bright')
          .replace('temperatures remained moderate', 'temperatures sharply remained moderate');
        await replaceTextAndSave(page, changed);
        const gutterMarker = page.locator('.dv-cell').first();
        await expect(gutterMarker).toBeVisible();
        // For this fixed fixture the first rendered gutter cell opens the
        // Summer-temperatures change (zero-based document line 2).
        const expectedMarkerLine = 2;
        await page.evaluate(() => {
          cm.setCursor({line: cm.lastLine(), ch: 0});
          window.__gutterScrollTargets = [];
          const scrollIntoView = cm.scrollIntoView.bind(cm);
          cm.scrollIntoView = (pos, ...rest) => {
            window.__gutterScrollTargets.push({line: pos.line, ch: pos.ch});
            return scrollIntoView(pos, ...rest);
          };
        });
        await gutterMarker.evaluate((marker) => {
          setTimeout(() => {
            marker.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
          }, 0);
        });
        await expect(page.locator('.dv-flash').first()).toContainText('temperatures');
        await expect.poll(() => page.evaluate(() => window.__gutterScrollTargets.at(-1)?.line))
          .toBe(expectedMarkerLine);
        await expect(page.locator('#dvNav .dvNavC')).toHaveText('tout · 1');
        await expect.poll(() => page.evaluate(() => cm.getOption('readOnly'))).toBe(true);
        const savesBeforeReadOnlyShortcut = saveRequests;
        await page.keyboard.press('Meta+s');
        await page.waitForTimeout(250);
        expect(saveRequests).toBe(savesBeforeReadOnlyShortcut);
        const before = await editorText(page);
        await page.evaluate(() => cm.focus());
        await page.keyboard.type('blocked');
        expect(await editorText(page)).toBe(before);
        const readOnlyPasteTarget = await pasteIntoEditor(page, engine, 'clipboard-blocked');
        if (engine === 'cm5') expect(readOnlyPasteTarget).toBe('TEXTAREA');
        await page.waitForTimeout(100);
        expect(await editorText(page)).toBe(before);
        await page.locator('#diffTag').click();
        await expect.poll(() => page.evaluate(() => cm.getOption('readOnly'))).toBe(false);
        await page.evaluate(() => cm.focus());
        await page.keyboard.press('Meta+a');
        await expect.poll(() => page.evaluate(() => cm.getSelection())).toBe(changed);
        await page.evaluate(() => { cm.setCursor({line: 0, ch: 0}); cm.focus(); });
        await page.keyboard.type('ok');
        await expect.poll(() => editorText(page)).toBe(`ok${changed}`);
      });
    });

    test('diff timeline cumulative and steps', async ({ page }) => {
      await withLatexStudio(engine, async ({ url }) => {
        await openEditor(page, url, 'latex', engine);
        await replaceLineAndSave(page, 1, 'First intervention changes the glacier surface.');
        await replaceLineAndSave(page, 2, 'Second intervention changes summer temperature.');
        await replaceLineAndSave(page, 3, 'Third intervention changes snow depth.');
        await page.locator('#diffTag').click();
        const count = page.locator('#dvNav .dvNavC');
        const previous = page.locator('#dvNav [data-d="-1"]');
        await expect(count).toHaveText('tout · 3');
        await previous.click(); await expect(count).toHaveText('3 / 3');
        await previous.click(); await expect(count).toHaveText('2 / 3');
        await previous.click(); await expect(count).toHaveText('1 / 3');
        await count.click(); await expect(count).toHaveText('tout · 3');
      });
      await withLatexStudio(engine, async ({filePath, url}) => {
        const {versionPayloads} = watchEditorTraffic(page);
        await openEditor(page, url, 'latex', engine);
        const local = conflictZone(INITIAL_TEXT, 'LOCAL');
        const disk = conflictZone(INITIAL_TEXT, 'EXTERNAL');
        await setEditorText(page, local);
        writeExternal(filePath, disk);
        await expect.poll(() => hasIntervention(versionPayloads, {
          before: INITIAL_TEXT, after: disk, source: 'external-conflict', status: 'pending-conflict',
        }), {timeout: 7000}).toBe(true);
        await expect.poll(() => editorText(page)).toBe(local);
      });
    });

    test('diff restore exact target', async ({ page }) => {
      await withLatexStudio(engine, async ({ url }) => {
        await openEditor(page, url, 'latex', engine);
        const s1 = INITIAL_TEXT.replace('stayed bright', 'darkened visibly');
        const s2 = s1.replace('remained moderate', 'increased sharply');
        const s3 = s2.replace('remained stable', 'declined quickly');
        for (const text of [s1, s2, s3]) await replaceTextAndSave(page, text);
        await page.locator('#diffTag').click();
        const previous = page.locator('#dvNav [data-d="-1"]');
        await previous.click();
        await previous.click();
        await expect.poll(() => editorText(page)).toBe(s2);
        const saved = page.waitForResponse(r => r.url().endsWith('/codesave') && r.request().method() === 'POST');
        const persisted = page.waitForResponse(r => r.url().endsWith('/versions')
          && r.request().method() === 'POST' && r.ok());
        await page.locator('#diffRestore').click();
        expect((await saved).ok()).toBe(true);
        await persisted;
        await expect.poll(() => editorText(page)).toBe(s2);
        await page.reload();
        await openEditor(page, url, 'latex', engine);
        await page.locator('#diffTag').click();
        await expect(page.locator('#dvNav .dvNavC')).toHaveText('tout · 4');
        await expect.poll(() => editorText(page)).toBe(s2);
      });
    });

    test('diff whitespace semantics', async ({ page }) => {
      await withLatexStudio(engine, async ({ url }) => {
        await openEditor(page, url, 'latex', engine);
        const rewrapped = INITIAL_TEXT.replace('dark ice.\nSummer', 'dark\nice. Summer');
        await page.evaluate(({before, after}) => __dv.push(before, after,
          {source: 'user-save', status: 'applied'}), {before: INITIAL_TEXT, after: rewrapped});
        await page.locator('#diffTag').click();
        await expect(page.locator('#dvNav .dvNavC')).toHaveText('tout · 0');
        await expect(page.locator('.dAddM, .dDelW')).toHaveCount(0);
        await expect.poll(() => editorText(page)).toBe(INITIAL_TEXT);
      });
    });

    test('diff anchored comments survive rewrap', async ({ page }) => {
      await withLatexStudio(engine, async ({ url }) => {
        await openEditor(page, url, 'latex', engine);
        const tracked = await page.evaluate(() => {
          const from = {line: 2, ch: 7};
          const to = {line: 2, ch: 19};
          const mark = cm.markText(from, to, {className: 'texc-hl'});
          cm.replaceRange('Earlier context. ', {line: 2, ch: 0});
          const moved = mark.find();
          const text = moved && cm.getRange(moved.from, moved.to);
          mark.clear();
          mark.clear();
          return {moved, text, cleared: mark.find()};
        });
        expect(tracked.text).toBe('temperatures');
        expect(tracked.moved.from.ch).toBeGreaterThan(7);
        expect(tracked.cleared).toBeUndefined();
        await page.evaluate(() => texcOpen({
          from: {line: 2, ch: 29}, to: {line: 2, ch: 37}, text: 'moderate',
        }));
        await page.locator('#texcPop textarea').fill('anchor survives');
        await page.locator('#texcPop .tc-save').click();
        await page.evaluate(() => {
          wrapSel.value = '50';
          window.__rewrapAll();
        });
        await expect.poll(() => page.evaluate(() => {
          const comment = texcAll[0];
          const range = texcMarks[comment.id].find();
          return {range, text: range && cm.getRange(range.from, range.to), note: comment.comment};
        })).toMatchObject({text: 'moderate', note: 'anchor survives'});
        const anchored = await page.evaluate(() => {
          const comment = texcAll[0];
          const range = texcMarks[comment.id].find();
          return {text: range && cm.getRange(range.from, range.to), note: comment.comment};
        });
        expect(anchored.text).toBe('moderate');
        expect(anchored.note).toBe('anchor survives');
        const bookmark = await page.evaluate(() => {
          const widget = document.createElement('span');
          widget.dataset.testWidget = 'deletion';
          widget.textContent = 'removed glacier text';
          widget.title = 'full removed glacier text';
          const mark = cm.setBookmark({line: 1, ch: 4}, {widget});
          cm.replaceRange('prefix-', {line: 1, ch: 0});
          const position = mark.find();
          const rendered = document.querySelector('[data-test-widget="deletion"]');
          return {position, text: rendered?.textContent, title: rendered?.title};
        });
        expect(bookmark).toMatchObject({
          position: {line: 1, ch: 11}, text: 'removed glacier text', title: 'full removed glacier text',
        });
        await page.evaluate(() => {
          cm.setValue('    An indented line with enough words to wrap over several visual rows in the narrow editor column.');
          const wrapper = cm.getWrapperElement();
          wrapper.style.width = '180px';
          cm.setOption('lineWrapping', true);
          cm.refresh();
        });
        const wrappedLine = page.locator(engine === 'cm6' ? '.cm-line' : '.CodeMirror-line').first();
        await expect.poll(() => wrappedLine.evaluate((line) => ({
          indent: line.style.textIndent,
          padding: line.style.paddingLeft,
          height: line.getBoundingClientRect().height,
        }))).toMatchObject({indent: expect.stringMatching(/^-/), padding: expect.stringMatching(/px$/)});
        await expect.poll(() => wrappedLine.evaluate((line) => line.getBoundingClientRect().height)).toBeGreaterThan(30);
        await expect(page.locator(engine === 'cm6' ? '.cm-line' : '.CodeMirror-line').first()).toBeVisible();
      });
    });

    test('diff worker stays responsive', async ({ page }) => {
      await withLatexStudio(engine, async ({ url }) => {
        await openEditor(page, url, 'latex', engine);
        const responsiveness = page.evaluate(async () => {
          const before = cm.getValue();
          const after = before + Array.from({length: 12000}, (_, i) => `line ${i} changed`).join('\n');
          cm.setValue(after);
          __dv.push(before, after, {source: 'user-save', status: 'applied'});
          let ticks = 0;
          const timer = setInterval(() => { ticks += 1; }, 0);
          document.getElementById('diffTag').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          clearInterval(timer);
          return ticks;
        });
        await expect(responsiveness).resolves.toBeGreaterThan(2);
        await expect(page.locator('#dvNav .dvNavC')).toContainText('tout · 1');
        await expect(page.locator('#dvCommit')).toBeVisible({timeout: 25_000});
        await expect(page.locator('#dvCommit')).toHaveAttribute('title', /bloc.*modifié/, {timeout: 25_000});
        await expect(page.locator('#diffTag .dv-count')).not.toHaveText('', {timeout: 25_000});
      });
    });
  });
}

const conflictZone = (text, prefix) => text.split('\n')
  .map((line, index) => (index >= 1 && index <= 3 ? `${prefix} ${line}` : line))
  .join('\n');

const DIRTY_SCENARIOS = {
  latex: {
    merge: {
      local: INITIAL_TEXT.replace('dark ice.\nSummer', 'dark ice.\n\nSummer'),
      disk: INITIAL_TEXT.replace(
        'Measured albedo declined near the exposed terminus late in the season.',
        'Measured albedo recovered after the external observation was applied.',
      ),
    },
    conflict: {
      local: conflictZone(INITIAL_TEXT, 'LOCAL'),
      disk: conflictZone(INITIAL_TEXT, 'EXTERNAL'),
    },
  },
  code: {
    merge: {
      local: CODE_INITIAL_TEXT.replace('    albedo =', '  albedo ='),
      disk: CODE_INITIAL_TEXT.replace('return albedo, temperature', 'return {"albedo": albedo, "temperature": temperature}'),
    },
    conflict: {
      local: conflictZone(CODE_INITIAL_TEXT, 'LOCAL'),
      disk: conflictZone(CODE_INITIAL_TEXT, 'EXTERNAL'),
    },
  },
};

for (const kind of ['latex', 'code']) {
  test(`${kind}: dirty non-overlap merge records disk action and preserves merged buffer`, async ({ page }) => {
    await withEditor(kind, async ({ filePath, url, initialText }) => {
      const { versionPayloads } = watchEditorTraffic(page);
      await openEditor(page, url, kind);
      const { local, disk } = DIRTY_SCENARIOS[kind].merge;
      const merged = kind === 'latex'
        ? local.replace(
          'Measured albedo declined near the exposed terminus late in the season.',
          'Measured albedo recovered after the external observation was applied.',
        )
        : local.replace('return albedo, temperature', 'return {"albedo": albedo, "temperature": temperature}');

      await setEditorText(page, local);
      writeExternal(filePath, disk);

      await expect.poll(() => hasIntervention(versionPayloads, {
        before: initialText, after: disk, source: 'external-merge', status: 'applied',
      }), { timeout: 7000 }).toBe(true);
      await expect.poll(() => editorText(page)).toBe(merged);
      await expectSingleStableIntervention(page, versionPayloads, {
        before: initialText, after: disk, source: 'external-merge', status: 'applied',
      });
    });
  });

  test(`${kind}: dirty same-zone conflict records pending disk action and preserves local buffer`, async ({ page }) => {
    await withEditor(kind, async ({ filePath, url, initialText }) => {
      const { versionPayloads } = watchEditorTraffic(page);
      await openEditor(page, url, kind);
      const { local, disk } = DIRTY_SCENARIOS[kind].conflict;

      await setEditorText(page, local);
      writeExternal(filePath, disk);

      await expect.poll(() => hasIntervention(versionPayloads, {
        before: initialText, after: disk, source: 'external-conflict', status: 'pending-conflict',
      }), { timeout: 7000 }).toBe(true);
      await expect.poll(() => editorText(page)).toBe(local);
      await expectSingleStableIntervention(page, versionPayloads, {
        before: initialText, after: disk, source: 'external-conflict', status: 'pending-conflict',
      });
    });
  });
}
