import {test, expect} from '@playwright/test';
import { spawnGalleryServer, freePort, stopGalleryServer as stop } from '../gallery_server.mjs';
import {mkdtempSync, writeFileSync, renameSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {removeTempRoot} from './temp-root.js';


async function withLongLatex(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-editor-scroll-'));
  const target = path.join(root, 'main.tex');
  const lines = Array.from({length: 700}, (_, index) =>
    `Line ${index + 1}: alpha beta gamma delta epsilon`).join('\n') + '\n';
  let server;
  try {
    writeFileSync(target, lines);
    const port = await freePort();
    server = spawnGalleryServer({ root, port });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({
      root, target, lines,
      url: `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(target)}&engine=cm6`,
    });
  } finally { await stop(server); await removeTempRoot(root); }
}

async function waitForEditor(page) {
  await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe('cm6');
  await expect(page.locator('.cm-editor')).toBeVisible();
}

async function firstPointerSelection(page, line = 450) {
  await page.evaluate((targetLine) => cm.scrollIntoView({line: targetLine, ch: 0}, 80), line);
  await expect.poll(() => page.evaluate(() => cm.getScrollInfo().top)).toBeGreaterThan(4000);
  await page.locator('#moreBtn').focus();
  const points = await page.evaluate((targetLine) => ({
    from: cm.charCoords({line: targetLine, ch: 10}, 'window'),
    to: cm.charCoords({line: targetLine, ch: 28}, 'window'),
  }), line);
  const before = await page.evaluate(() => cm.getScrollInfo().top);
  await page.mouse.move(points.from.left, (points.from.top + points.from.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move(points.to.left, (points.to.top + points.to.bottom) / 2, {steps: 8});
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => cm.getSelection().length)).toBeGreaterThan(5);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => cm.getScrollInfo().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  return {before, after};
}

test('editor scrollbar keeps a stable native lane while shared surfaces keep their narrow lane', async ({page}) => {
  await withLongLatex(async ({url}) => {
    await page.goto(url);
    await waitForEditor(page);
    const rules = await page.evaluate(() => {
      const all = [];
      const collect = (sheet) => {
        try {
          for (const rule of sheet.cssRules || []) {
            all.push(rule.cssText);
            if (rule.styleSheet) collect(rule.styleSheet);
          }
        } catch {}
      };
      for (const sheet of document.styleSheets) collect(sheet);
      return all;
    });
    const measure = () => page.evaluate(() => {
      const scroller = document.querySelector('.cm-editor .cm-scroller');
      const style = scroller ? getComputedStyle(scroller) : null;
      return {
        clientWidth: scroller?.clientWidth || 0,
        clientHeight: scroller?.clientHeight || 0,
        scrollHeight: scroller?.scrollHeight || 0,
        gutter: style?.scrollbarGutter || '',
        scrollbarWidth: style?.scrollbarWidth || '',
      };
    });
    await page.evaluate(() => cm.setValue('short buffer\n'));
    await page.waitForTimeout(120);
    const shortGeometry = await measure();
    await page.evaluate(() => cm.setValue(Array.from({length: 700}, (_, index) =>
      `Line ${index + 1}: alpha beta gamma delta epsilon`).join('\n') + '\n'));
    await expect.poll(() => page.evaluate(() => document.querySelector('.cm-editor .cm-scroller')?.scrollHeight || 0)).toBeGreaterThan(1000);
    const longGeometry = await measure();
    const metrics = {
      shortGeometry,
      longGeometry,
      editorScrollbar: rules.find((rule) => rule.includes('.cm-editor') && rule.includes('::-webkit-scrollbar') && /width:\s*10px/.test(rule)) || '',
      sharedScrollbar: rules.find((rule) => rule.includes('.messages') && rule.includes('::-webkit-scrollbar') && /width:\s*6px/.test(rule)) || '',
    };
    expect(metrics.shortGeometry.gutter).toContain('stable');
    expect(metrics.longGeometry.gutter).toContain('stable');
    expect(metrics.shortGeometry.scrollbarWidth).toBe('auto');
    expect(metrics.longGeometry.scrollbarWidth).toBe('auto');
    expect(metrics.shortGeometry.scrollHeight).toBeLessThanOrEqual(metrics.shortGeometry.clientHeight + 1);
    expect(metrics.longGeometry.scrollHeight).toBeGreaterThan(metrics.shortGeometry.scrollHeight);
    expect(metrics.longGeometry.clientWidth).toBe(metrics.shortGeometry.clientWidth);
    // WebKit exposes the pseudo width through CSSOM on some releases and
    // reports `auto` on others; the loaded rule is the portable assertion.
    expect(metrics.editorScrollbar).toMatch(/width:\s*10px/);
    expect(metrics.editorScrollbar).toMatch(/height:\s*10px/);
    expect(metrics.sharedScrollbar).toMatch(/width:\s*6px/);
    expect(metrics.sharedScrollbar).toMatch(/height:\s*6px/);
    expect(metrics.sharedScrollbar).not.toContain('.cm-scroller');
  });
});

test('first pointer selection in a long unfocused LaTeX document keeps the viewport', async ({page}) => {
  await withLongLatex(async ({url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await firstPointerSelection(page);
    // Sélection native (pas de couche drawSelection ni de mark .cm-clsel) :
    // la fenêtre porte une sélection non vide dans .cm-content.
    await expect.poll(() => page.evaluate(() => {
      const sel = window.getSelection();
      return sel && !sel.isCollapsed && document.querySelector('.cm-content')?.contains(sel.anchorNode);
    })).toBe(true);
    await expect(page.locator('.cm-selectionLayer .cm-selectionBackground')).toHaveCount(0);
  });
});

test('CM5 range-shaped scrollIntoView targets the range instead of line zero', async ({page}) => {
  await withLongLatex(async ({url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await page.evaluate(() => cm.scrollIntoView({
      from: {line: 520, ch: 5}, to: {line: 520, ch: 28},
    }, 80));
    await expect.poll(() => page.evaluate(() => cm.getScrollInfo().top)).toBeGreaterThan(5000);
    const coords = await page.evaluate(() => cm.charCoords({line: 520, ch: 12}, 'window'));
    expect(coords.top).toBeGreaterThan(70);
    expect(coords.bottom).toBeLessThan(760);
  });
});

// setValue ne remplace que les portions réellement modifiées : une sélection
// hors de ces zones couvre toujours le même texte après le rechargement, et le
// défilement ne bouge pas.
test('external full-document reload preserves selection and never emits a top reset', async ({page}) => {
  await withLongLatex(async ({target, lines, url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await firstPointerSelection(page, 480);
    const before = await page.evaluate(() => ({anchor: cm.getViewportAnchor(), from: cm.getCursor('from')}));
    const replacement = lines.replace('Line 20:', 'Line 20 externally updated:');
    const temp = `${target}.external`;
    writeFileSync(temp, replacement);
    const future = new Date(Date.now() + 1600); utimesSync(temp, future, future); renameSync(temp, target);
    await expect.poll(() => page.evaluate(() => cm.getValue().includes('externally updated')), {timeout: 7000}).toBe(true);
    const state = await page.evaluate(() => ({
      anchor: cm.getViewportAnchor(),
      from: cm.getCursor('from'),
      selection: cm.getSelection(),
    }));
    // Le rechargement ne doit jamais renvoyer en tête du document. La position
    // est vérifiée en TEXTE (ancre de viewport) et non en pixels : CodeMirror
    // réestime la hauteur du document après une écriture externe (mesuré sur
    // ce .tex de 700 lignes : 7709 px → 4069 px), donc un même scrollTop n'y
    // désigne plus la même ligne.
    expect(Math.abs(state.anchor.line - before.anchor.line), JSON.stringify({before, state})).toBeLessThanOrEqual(2);
    expect(state.from.line).toBe(480);
    expect(state.selection.length).toBeGreaterThan(5);
  });
});

test('external reload during an active drag does not expand the selection or reset the viewport', async ({page}) => {
  await withLongLatex(async ({target, lines, url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await page.evaluate(() => cm.scrollIntoView({line: 480, ch: 0}, 80));
    await expect.poll(() => page.evaluate(() => cm.getScrollInfo().top)).toBeGreaterThan(4000);
    await expect.poll(() => page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller');
      const c = cm.charCoords({line: 480, ch: 10}, 'window');
      const box = scroller.getBoundingClientRect();
      return c.top >= box.top && c.bottom <= box.bottom;
    })).toBe(true);
    await page.locator('#moreBtn').focus();
    await page.evaluate(() => {
      const originalSetValue = cm.setValue.bind(cm);
      window.__setValueCalls = 0;
      cm.setValue = value => { window.__setValueCalls += 1; return originalSetValue(value); };
    });
    const points = await page.evaluate(() => ({
      from: cm.charCoords({line: 480, ch: 10}, 'window'),
      to: cm.charCoords({line: 480, ch: 28}, 'window'),
    }));
    const fromPoint = {x: points.from.left, y: (points.from.top + points.from.bottom) / 2};
    const toPoint = {x: points.to.left, y: (points.to.top + points.to.bottom) / 2};
    await page.mouse.move(fromPoint.x, fromPoint.y);
    await page.mouse.down();
    const anchorBefore = await page.evaluate(() => cm.getViewportAnchor());

    // Le bouton reste enfoncé pendant la sonde document : l'ancre DOM du
    // geste doit survivre à la transaction CM6 qui recharge la version agent.
    const replacement = lines.replace('Line 20:', 'Line 20 externally updated:');
    const temp = `${target}.external`;
    writeFileSync(temp, replacement);
    const future = new Date(Date.now() + 1600); utimesSync(temp, future, future); renameSync(temp, target);
    // Keep the endpoint in the same viewport coordinates. Recomputing a
    // document coordinate after the reload would itself ask WebKit to scroll
    // to an off-screen line and would conflate the test with pointer autoscroll.
    // The editor deliberately applies the pending document after mouseup; wait
    // for the watcher to call setValue while the button remains down.
    await expect.poll(() => page.evaluate(() => window.__setValueCalls), {timeout: 7000}).toBeGreaterThan(0);
    await page.mouse.move(toPoint.x, toPoint.y, {steps: 8});
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => cm.getValue().includes('externally updated')), {timeout: 7000}).toBe(true);
    await expect.poll(() => page.evaluate(() => cm.getSelection().length)).toBeGreaterThan(5);
    const state = await page.evaluate(() => ({
      anchor: cm.getViewportAnchor(),
      from: cm.getCursor('from'),
      to: cm.getCursor('to'),
      selection: cm.getSelection(),
    }));
    // Le glisser ne doit ni filer vers une extrémité ni laisser le passage lu
    // sortir de l'écran. Position vérifiée en TEXTE : CodeMirror réestime la
    // hauteur du document après une écriture externe (mesuré : 7709 px →
    // 4069 px sur ce .tex de 700 lignes), donc un scrollTop n'y désigne plus la
    // même ligne. Avant ce correctif, la même séquence laissait l'éditeur à
    // top = 19, c'est-à-dire en tête du document.
    expect(Math.abs(state.anchor.line - anchorBefore.line), JSON.stringify({anchorBefore, state})).toBeLessThanOrEqual(2);
    expect(Math.abs(state.to.line - state.from.line), JSON.stringify(state)).toBeLessThanOrEqual(1);
    expect(state.selection.length).toBeGreaterThan(5);
    expect(state.selection.length).toBeLessThan(100);
  });
});

test('external reload while Diff is open refreshes the review without navigating', async ({page}) => {
  await withLongLatex(async ({target, lines, url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await page.evaluate(() => cm.scrollIntoView({line: 480, ch: 0}, 80));
    await expect.poll(() => page.evaluate(() => cm.getScrollInfo().top)).toBeGreaterThan(1000);
    const anchorBefore = await page.evaluate(() => cm.getViewportAnchor());

    // Le premier passage est volontairement loin dans le document : le
    // rechargement journalise et ouvre Diff sans déplacer la lecture, ce qui
    // isole le second push avec la revue déjà active.
    const first = lines.replace('Line 480:', 'Line 480 externally updated:');
    let temp = `${target}.external`;
    writeFileSync(temp, first);
    let future = new Date(Date.now() + 1600); utimesSync(temp, future, future); renameSync(temp, target);
    await expect.poll(() => page.evaluate(() => cm.getValue().includes('Line 480 externally updated:')), {timeout: 7000}).toBe(true);
    await expect(page.locator('#diffTag')).toHaveClass(/\bon\b/);
    await expect(page.locator('.dv-count')).toHaveText('1/1');
    const anchorAfterOpen = await page.evaluate(() => cm.getViewportAnchor());
    expect(Math.abs(anchorAfterOpen.line - anchorBefore.line), JSON.stringify({anchorBefore, anchorAfterOpen})).toBeLessThanOrEqual(2);

    await page.evaluate(() => {
      cm.setSelection({line: 480, ch: 10}, {line: 480, ch: 28});
      document.activeElement?.blur();
    });
    const beforeSelection = await page.evaluate(() => cm.getSelection());

    // Recharger une seconde intervention pendant que la vue Diff est active
    // doit seulement mettre à jour le passage courant : l'ouverture/navigation
    // reste celle demandée explicitement par l'utilisateur.
    const second = first.replace('Line 680:', 'Line 680 externally updated:');
    temp = `${target}.external`;
    writeFileSync(temp, second);
    future = new Date(Date.now() + 1600); utimesSync(temp, future, future); renameSync(temp, target);
    await expect.poll(() => page.evaluate(() => cm.getValue().includes('Line 680 externally updated:')), {timeout: 7000}).toBe(true);
    const state = await page.evaluate(() => ({
      anchor: cm.getViewportAnchor(),
      selection: cm.getSelection(),
      diffOpen: document.querySelector('#diffTag')?.classList.contains('on'),
    }));
    expect(Math.abs(state.anchor.line - anchorBefore.line), JSON.stringify({anchorBefore, state})).toBeLessThanOrEqual(2);
    expect(state.selection).toBe(beforeSelection);
    expect(state.diffOpen).toBe(true);
  });
});

test('external merge keeps a distant selection and viewport while the review opens', async ({page}) => {
  await withLongLatex(async ({root, target, lines, url}) => {
    await page.goto(url);
    await waitForEditor(page);
    await page.evaluate(() => {
      cm.focus();
      cm.scrollIntoView({line: 480, ch: 0}, 80);
      cm.replaceRange('LOCAL BUFFER ', {line: 4, ch: 0});
    });
    await page.evaluate(() => {
      cm.setSelection({line: 480, ch: 10}, {line: 480, ch: 28});
      document.activeElement?.blur();
    });
    const beforeSelection = await page.evaluate(() => cm.getSelection());
    expect(beforeSelection.length).toBeGreaterThan(5);
    await expect.poll(() => page.evaluate(() => cm.getScrollInfo().top)).toBeGreaterThan(1000);
    const beforeTop = await page.evaluate(() => cm.getScrollInfo().top);
    await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller');
      window.__scrollTrace = [];
      scroller.addEventListener('scroll', () => window.__scrollTrace.push(scroller.scrollTop));
    });

    // Deux retouches très éloignées sur disque obligent la fusion à conserver
    // le passage sélectionné entre elles au lieu d'émettre [préfixe, suffixe].
    const replacement = lines
      .replace('Line 20:', 'Line 20 externally updated:')
      .replace('Line 680:', 'Line 680 externally updated:');
    const temp = `${target}.external`;
    writeFileSync(temp, replacement);
    const future = new Date(Date.now() + 1600); utimesSync(temp, future, future); renameSync(temp, target);
    await expect.poll(() => page.evaluate(() => {
      const value = cm.getValue();
      return value.includes('Line 20 externally updated:')
        && value.includes('Line 680 externally updated:')
        && /LOCAL\s+BUFFER/.test(value);
    }), {timeout: 7000}).toBe(true);

    const state = await page.evaluate(() => ({
      top: cm.getScrollInfo().top,
      selection: cm.getSelection(),
      diffOpen: document.querySelector('#diffTag')?.classList.contains('on'),
      trace: window.__scrollTrace,
    }));
    expect(Math.abs(state.top - beforeTop)).toBeLessThanOrEqual(4);
    expect(state.selection).toBe(beforeSelection);
    expect(state.diffOpen).toBe(true);
    expect(state.trace.every(value => Math.abs(value - beforeTop) <= 4)).toBe(true);
    await expect(page.locator('#diffTag')).toHaveClass(/\bon\b/);
    await expect(page.locator('.dv-count')).toHaveText('1/1');
  });
});
