import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, renameSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { removeTempRoot } from './temp-root.js';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref(); socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const {port} = socket.address(); socket.close(() => resolve(port));
    });
  });
}

async function stop(server) {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 1000))]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function withProject(files, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-editor-cm6-'));
  let server;
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text);
    const port = await freePort();
    server = spawn(process.execPath, [path.join(GALLERY, 'server', 'main.mjs')], {
      cwd: root, env: {...process.env, FIG_PORT: String(port), GALLERY_ROOT: root}, stdio: 'ignore',
    });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, port, url: (asset, name, extra = '') =>
      `http://127.0.0.1:${port}/.fig_thumbs/${asset}?path=${encodeURIComponent(path.join(root, name))}${extra}`});
  } finally { await stop(server); await removeTempRoot(root); }
}

async function expectEngine(page, engine) {
  await expect.poll(() => page.evaluate(() => window.__ENGINE)).toBe(engine);
  await expect(page.locator(engine === 'cm6' ? '.cm-editor' : '.CodeMirror')).toBeVisible();
}

async function saveShortcut(page) {
  const response = page.waitForResponse(r => r.url().endsWith('/codesave') && r.request().method() === 'POST');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  expect((await response).ok()).toBe(true);
}

test('latex toolbar exposes individual diffs in a single row', async ({page}) => {
  await withProject({'sample.tex': '\\section{Introduction}\nTexte de travail.\n'}, async ({url}) => {
    await page.goto(url('latex_studio.html', 'sample.tex'));
    await expectEngine(page, 'cm6');
    for (const width of [1100, 700, 400]) {
      await page.setViewportSize({width, height:760});
      await expect(page.locator('#diffGrp')).toBeVisible();
      await expect(page.locator('#toolbarWrap')).toBeVisible();
      await expect(page.locator('#popPdf')).toBeVisible();
      await expect(page.locator('#statusbar')).toBeHidden();
      expect(await page.locator('header').evaluate(el=>el.scrollWidth <= el.clientWidth+1)).toBe(true);
    }
    await page.locator('#toolbarWrap').click();
    await expect(page.locator('#toolbarWrap')).toHaveAttribute('aria-pressed','false');
    // Unsaved feedback must survive the compact toolbar and hidden filename.
    const before = await page.locator('#documentModes').boundingBox();
    await page.locator('.cm-content').click();
    await page.keyboard.type('Modification utilisateur. ');
    await expect(page.locator('#ddot')).toBeVisible();
    const after = await page.locator('#documentModes').boundingBox();
    expect(after.width).toBe(before.width);

  });
});

test('code editor save reload and diff', async ({page}) => {
  await withProject({'sample.py': 'value = 1\n'}, async ({root, url}) => {
    await page.goto(url('code_editor.html', 'sample.py'));
    await expectEngine(page, 'cm6');
    await page.evaluate(() => cm.setValue('value = 2\n'));
    await saveShortcut(page);
    expect(readFileSync(path.join(root, 'sample.py'), 'utf8')).toBe('value = 2\n');
    await expect(page.locator('#diffTag')).toBeEnabled();
    const target = path.join(root, 'sample.py');
    const temp = `${target}.external`;
    writeFileSync(temp, 'value = 3\n');
    const future = new Date(Date.now() + 1500); utimesSync(temp, future, future); renameSync(temp, target);
    await expect.poll(() => page.evaluate(() => cm.getValue())).toBe('value = 3\n');
    await page.goto(url('code_editor.html', 'sample.py', '&engine=cm5'));
    await expectEngine(page, 'cm5');
    await page.evaluate(() => cm.setValue('value = 4\n'));
    await saveShortcut(page);
    await expect(page.locator('#diffTag')).toBeEnabled();
  });
});

test('code editor preserves Python indentation', async ({page}) => {
  await withProject({'indent.py': 'def run():\n    value = 1'}, async ({url}) => {
    await page.goto(url('code_editor.html', 'indent.py'));
    await expectEngine(page, 'cm6');
    await page.locator('.cm-content').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('return value');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('\n    return value');
  });
});

test('markdown preview split edit roundtrip', async ({page}) => {
  for (const engine of ['cm5', 'cm6']) {
    await withProject({'note.md': '# Alpha\n\nInitial selection text\n'}, async ({root, url}) => {
      const target = path.join(root, 'note.md');
      await page.goto(url('md_viewer.html', 'note.md', `&engine=${engine}`));
      await expect(page.locator('#prevPane')).toContainText('Initial');
      await page.locator('#mSplit').click(); await expectEngine(page, engine);
      await page.evaluate(() => cm.setSelection({line: 2, ch: 0}, {line: 2, ch: 7}));
      await expect.poll(() => page.evaluate(() => cm.getSelection())).toBe('Initial');
      await page.locator('#mPrev').click(); await page.locator('#mEdit').click();
      await expect.poll(() => page.evaluate(() => cm.getSelection())).toBe('Initial');
      await page.evaluate(() => cm.setValue('# Alpha\n\nEdited\n'));
      await page.locator('#mSplit').click(); await expect(page.locator('#prevPane')).toContainText('Edited');
      await saveShortcut(page); expect(readFileSync(target, 'utf8')).toContain('Edited');

      const cleanExternal = '# Alpha\n\nClean external reload\n';
      const temp = `${target}.clean`; writeFileSync(temp, cleanExternal);
      const future = new Date(Date.now() + 1200); utimesSync(temp, future, future); renameSync(temp, target);
      await expect.poll(() => page.evaluate(() => cm.getValue()), {timeout: 7000}).toBe(cleanExternal);
      await expect(page.locator('#prevPane')).toContainText('Clean external reload');

      await page.evaluate(() => cm.setValue('# Alpha\n\nLocal dirty\n'));
      const conflictDisk = '# Alpha\n\nExternal conflict\n';
      const conflictTemp = `${target}.conflict`; writeFileSync(conflictTemp, conflictDisk);
      const later = new Date(Date.now() + 2400); utimesSync(conflictTemp, later, later); renameSync(conflictTemp, target);
      const conflict = page.waitForResponse(r => r.url().endsWith('/codesave') && r.request().method() === 'POST');
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
      await conflict;
      await expect(page.locator('#state')).toHaveClass(/conflict/);
      await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Local dirty');
      expect(readFileSync(target, 'utf8')).toContain('External conflict');
    });
  }
});

test('engine resolution precedence', async ({page}) => {
  await withProject({'sample.py': 'print(1)\n', 'note.md': '# note\n', 'main.tex': '\\section{One}\n'}, async ({url}) => {
    await page.goto(url('code_editor.html', 'sample.py'));
    await page.evaluate(() => localStorage.setItem('studioEngine', 'cm5'));
    await page.goto(url('code_editor.html', 'sample.py', '&engine=cm6')); await expectEngine(page, 'cm6');
    await page.goto(url('code_editor.html', 'sample.py')); await expectEngine(page, 'cm5');
    await page.evaluate(() => localStorage.removeItem('studioEngine'));
    await page.goto(url('code_editor.html', 'sample.py')); await expectEngine(page, 'cm6');
    await page.evaluate(() => localStorage.setItem('studioEngine', 'invalid'));
    await page.goto(url('code_editor.html', 'sample.py', '&engine=invalid')); await expectEngine(page, 'cm6');
    await page.goto(url('md_viewer.html', 'note.md', '&engine=invalid'));
    await page.locator('#mEdit').click(); await expectEngine(page, 'cm6');
    await page.goto(url('latex_studio.html', 'main.tex', '&engine=invalid')); await expectEngine(page, 'cm6');
  });
});

test('CM6 propose huit vrais thèmes sombres et les persiste entre éditeurs', async ({page}) => {
  await withProject({
    'theme.tex': '% commentaire scientifique\n\\section{Résultats}\n\\newcommand{\\glacier}{August}\n',
    'sample.py': 'import math\n# scientific comment\ndef glacier(value: float):\n    label = "August"\n    return math.sqrt(value) * 2\n',
  }, async ({url}) => {
    await page.goto(url('latex_studio.html', 'theme.tex'));
    await expectEngine(page, 'cm6');
    const tokens = page.locator('.cm-content .cm-line span');
    await expect.poll(() => tokens.count()).toBeGreaterThan(3);
    const colors = await tokens.evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).color))]);
    expect(colors.length).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(30, 33, 36)');

    const themeTrigger = page.getByRole('button', {name: "Thème de l'éditeur"});
    await expect(themeTrigger).toBeVisible();
    const themeCases = [
      ['Atelier', 'rgb(30, 33, 36)'],
      ['VS Code Dark+', 'rgb(30, 30, 30)'],
      ['Nord', 'rgb(46, 52, 64)'],
      ['Monokai', 'rgb(39, 40, 34)'],
      ['Gruvbox Dark', 'rgb(40, 40, 40)'],
      ['Material Ocean', 'rgb(46, 50, 53)'],
      ['Solarized Dark', 'rgb(0, 43, 54)'],
      ['Dracula', 'rgb(40, 42, 54)'],
    ];
    for (const [label, background] of themeCases) {
      await themeTrigger.click();
      await expect(page.getByRole('menuitemradio')).toHaveCount(8);
      await page.getByRole('menuitemradio', {name: label, exact: true}).click();
      await expect(page.locator('.cm-editor')).toHaveCSS('background-color', background);
    }
    expect(await page.evaluate(() => localStorage.getItem('atelier.editorTheme'))).toBe('dracula');

    await page.reload();
    await expectEngine(page, 'cm6');
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(40, 42, 54)');

    await page.goto(url('code_editor.html', 'sample.py'));
    await expectEngine(page, 'cm6');
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(40, 42, 54)');
    const codeColors = await page.locator('.cm-content .cm-line span').evaluateAll(nodes =>
      [...new Set(nodes.map(node => getComputedStyle(node).color))]);
    expect(codeColors.length).toBeGreaterThanOrEqual(5);
  });
});

test('latex deterministic parity', async ({page}) => {
  await withProject({'main.tex': '\\section{Alpha}\nTherefore\n\nA paragraph with enough words that deterministic rewrap can split it into multiple shorter source lines for editing, long enough that it exceeds the widest automatic wrap column whatever the width of the editor pane happens to be at this point in the test.\n',
    'script.py': 'unused = 1\n'}, async ({root, url}) => {
    let quotePayload = null;
    await page.route('**/compile', route => route.fulfill({status: 200, contentType: 'application/json',
      body: JSON.stringify({ok: false, log: '! Controlled compile failure\nl.2 deterministic'})}));
    await page.route('**/quote', async route => {
      quotePayload = route.request().postDataJSON();
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, message: 'added'})});
    });
    await page.route('**/lint?**', route => route.fulfill({status: 200, contentType: 'application/json',
      body: JSON.stringify({available: true, diagnostics: [{row: 1, code: 'F841', message: 'unused'}]})}));
    await page.goto(url('latex_studio.html', 'main.tex'));
    await expectEngine(page, 'cm6');
    await page.evaluate(() => { cm.setValue('\\section{Alpha}\nTherefore'); cm.setCursor({line: 1, ch: 9}); cm.focus(); });
    await expect(page.locator('.cm-ghostText')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Therefore the');

    await page.locator('#moreBtn').click();
    await page.locator('#morePop [data-act="outline"]').click();
    await expect(page.locator('#outline')).toHaveClass(/open/);
    await expect(page.locator('#outline')).toContainText('Alpha');

    await page.evaluate(() => cm.setSelection({line: 0, ch: 9}, {line: 0, ch: 14}));
    await expect(page.locator('#selPill')).toBeVisible();
    await page.locator('#selPill .go').click();
    await expect.poll(() => quotePayload?.text).toBe('Alpha');

    await page.evaluate(() => document.getElementById('readBtn').click());
    await expect(page.locator('#right')).toHaveClass(/reading/);
    await expect(page.locator('#texread')).toContainText('Therefore');
    // Lecture est une vue plein cadre : l'éditeur est masqué et ne peut donc
    // plus recevoir le focus ni les raccourcis. On en ressort avant de tester
    // l'édition — c'est aussi ce que fait l'utilisateur.
    await expect(page.locator('#left')).toBeHidden();
    await page.evaluate(() => document.getElementById('editBtn').click());
    await expect(page.locator('#left')).toBeVisible();

    await page.evaluate(() => cm.setValue('\\section{Alpha}\nA paragraph with enough words that deterministic rewrap can split it into multiple shorter source lines for editing, long enough that it exceeds the widest automatic wrap column whatever the width of the editor pane happens to be at this point in the test.'));
    // `wrapSel` n'offre que « win »/« off » : lui affecter '50' ne prenait pas
    // et la colonne retombait sur la largeur mesurée du panneau. Le paragraphe
    // est donc plus long que la colonne automatique maximale (120), ce qui rend
    // la coupe vraie quelle que soit la géométrie.
    await page.evaluate(() => { window.__rewrapAll(); });
    await expect.poll(() => page.evaluate(() => cm.getValue().split('\n').length)).toBeGreaterThan(2);

    await page.locator('#build').click();
    await expect(page.locator('#texlog')).toHaveClass(/open/);
    await expect(page.locator('#tlBody')).toContainText('Controlled compile failure');

    await page.evaluate(() => document.getElementById('openFile').click());
    await expect(page.locator('#picker')).toHaveClass(/show/);
    await expect(page.locator('#pickerList')).toContainText('script.py');

    await page.evaluate(() => { cm.setValue('\\section{Beta}\nText\n'); cm.focus(); });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Alpha');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('Beta');
    await saveShortcut(page);
    expect(readFileSync(path.join(root, 'main.tex'), 'utf8')).toContain('Beta');
    // `?engine=cm5` sur la page LaTeX : la pile CM5 n'y est plus chargée, la
    // fabrique retombe sur cm6 sans casser la page.
    await page.goto(url('latex_studio.html', 'main.tex', '&engine=cm5')); await expectEngine(page, 'cm6');
    await page.goto(url('latex_studio.html', 'script.py'));
    await expectEngine(page, 'cm6');
    await expect(page.locator('#sbLint')).toContainText('1 ruff');
  });
});

test('latex auto rewrap saves numbered physical lines that fit the window', async ({page}) => {
  const paragraph = 'Wildfire carbon deposition is measured across many glacier pixels and compared with local climate controls so that a narrow editor still keeps every physical source line visible without a second visual continuation row.';
  await withProject({'wrap.tex': `\\section{Results}\n${paragraph}\n`}, async ({root, url}) => {
    await page.setViewportSize({width: 772, height: 926});
    await page.goto(url('latex_studio.html', 'wrap.tex'));
    await expectEngine(page, 'cm6');
    await page.locator('#moreBtn').click();
    await expect(page.locator('#moreAutoRw')).toHaveText('désactivé');
    expect(await page.evaluate(() => localStorage.getItem('texAutoRewrap'))).toBeNull();
    await page.locator('[data-act="autorewrap"]').click();
    await expect(page.locator('#moreAutoRw')).toHaveText('activé');

    await page.evaluate(text => cm.setValue(`\\section{Results}\n${text}\n`), paragraph);
    await saveShortcut(page);
    const savedLines = readFileSync(path.join(root, 'wrap.tex'), 'utf8').trimEnd().split('\n');
    expect(savedLines.length).toBeGreaterThan(3);
    expect(Math.max(...savedLines.map(line => line.length))).toBeLessThanOrEqual(90);
    await page.locator('#toolbarWrap').click();
    await expect(page.locator('.cm-fluid-space')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const rows = [...document.querySelectorAll('.cm-line')];
      if (!rows.length) return -1;
      const base = rows.find(row => row.textContent)?.getBoundingClientRect().height || 0;
      return rows.filter(row => row.getBoundingClientRect().height > base * 1.5).length;
    })).toBe(0);
    const numbered = await page.evaluate(() => [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
      .filter(node => getComputedStyle(node).visibility !== 'hidden')
      .map(node => node.textContent?.trim() || '').filter(value => /^\d+$/.test(value)).length);
    expect(numbered).toBe(await page.evaluate(() => cm.lineCount()));

    await page.locator('#moreBtn').click();
    await page.locator('[data-act="autorewrap"]').click();
    await expect(page.locator('#moreAutoRw')).toHaveText('désactivé');
    expect(await page.evaluate(() => localStorage.getItem('texAutoRewrap'))).toBe('0');
  });
});

test('latex anchored comments persist through the typed controller in CM6', async ({page}) => {
  for (const engine of ['cm6']) {
    await withProject({'comments.tex': '\\section{Review}\nAnchored comment text\n'}, async ({url}) => {
      await page.goto(url('latex_studio.html', 'comments.tex', `&engine=${engine}`));
      await expectEngine(page, engine);
      await page.evaluate(() => texcOpen({
        from: {line: 1, ch: 0}, to: {line: 1, ch: 8}, text: 'Anchored',
      }));
      await expect(page.locator('#texcPop')).toBeVisible();
      await page.locator('#texcPop textarea').fill('Vérifier ce passage');
      const saved = page.waitForResponse(response => response.url().includes('/pdfannot')
        && response.request().method() === 'POST');
      await page.locator('#texcPop .send2').click();
      expect((await saved).ok()).toBe(true);
      await expect(page.locator('.texc-hl')).toBeVisible();
      await page.locator('#moreBtn').click();
      await page.locator('[data-act="comments"]').click();
      await expect(page.locator('#texcPanel')).toContainText('Vérifier ce passage');
    });
  }
});

// Régression : le rechargement agent remplaçait le document ENTIER, et CM6
// remappait toute position à travers ce changement [0, length] — une position
// intérieure s'écrase alors au début ou à la fin du document. Sélections et
// ancres du geste de souris en cours sautaient aux extrémités : un clic pendant
// une écriture d'agent finissait en sélection de tout un pan du document.
// Depuis, setValue ne remplace que la portion réellement modifiée.
test('rechargement agent : la sélection hors zone survit, le clic reste un clic', async ({page}) => {
  const corps = Array.from({length: 60}, (_, i) =>
    `Paragraphe ${String(i + 1).padStart(2, '0')} : phrase de test pour la selection dans l'editeur du studio.`).join('\n\n');
  const source = `\\documentclass{article}\n\\begin{document}\n\n${corps}\n\n\\end{document}\n`;
  await withProject({'agent.tex': source}, async ({root, url}) => {
    await page.goto(url('latex_studio.html', 'agent.tex'));
    await expectEngine(page, 'cm6');

    // L'utilisateur sélectionne un passage, puis quitte l'éditeur pour le chat.
    await page.evaluate(() => {
      cm.focus();
      cm.setSelection({line: 10, ch: 0}, {line: 16, ch: 30});
    });
    const passage = await page.evaluate(() => cm.getSelection());
    expect(passage.length).toBeGreaterThan(0);
    await page.evaluate(() => document.activeElement?.blur());

    // Un agent modifie un paragraphe SOUS la sélection pendant ce temps.
    const cible = path.join(root, 'agent.tex');
    const temporaire = `${cible}.external`;
    writeFileSync(temporaire, source.replace('Paragraphe 30', 'Paragraphe 30 REECRIT PAR L AGENT AVEC UNE PHRASE PLUS LONGUE'));
    const futur = new Date(Date.now() + 1500);
    utimesSync(temporaire, futur, futur);
    renameSync(temporaire, cible);
    await expect.poll(() => page.evaluate(() => cm.getValue())).toContain('REECRIT PAR L AGENT');

    // La sélection couvre toujours exactement le même texte.
    expect(await page.evaluate(() => cm.getSelection())).toBe(passage);

    // Et le retour dans le texte pose un simple curseur, jamais une plage.
    await page.locator('.cm-content').click({position: {x: 120, y: 60}});
    const apresClic = await page.evaluate(() => ({
      selection: cm.getSelection().length,
      dom: window.getSelection().toString().length,
    }));
    expect(apresClic.selection).toBe(0);
    expect(apresClic.dom).toBe(0);
  });
});

// Le scénario vécu : l'agent écrit PENDANT le clic de l'utilisateur. Le reload
// tombe entre mousedown et mouseup ; l'ancre du geste doit rester au point de
// clic, pas sauter à une extrémité du document.
test('rechargement agent en plein clic : l ancre de la souris ne bouge pas', async ({page}) => {
  const corps = Array.from({length: 200}, (_, i) =>
    `Paragraphe ${i + 1} : phrase de test pour la selection dans l'editeur du studio.`).join('\n\n');
  const source = `\\documentclass{article}\n\\begin{document}\n${corps}\n\\end{document}\n`;
  await withProject({'midclick.tex': source}, async ({url}) => {
    await page.goto(url('latex_studio.html', 'midclick.tex'));
    await expectEngine(page, 'cm6');
    await page.evaluate(() => { cm.focus(); cm.scrollIntoView({line: 100, ch: 0}, 80); });
    const point = await page.evaluate(() => {
      const c = cm.charCoords({line: 100, ch: 10}, 'window');
      return {x: c.left, y: (c.top + c.bottom) / 2};
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    // Le rechargement complet arrive pendant que le bouton est enfoncé.
    await page.evaluate((texte) => { cm.setValue(texte.replace('Paragraphe 50 :', 'Paragraphe 50 MODIFIE :')); }, source);
    await page.mouse.move(point.x + 2, point.y + 1);
    await page.mouse.up();
    const etat = await page.evaluate(() => ({
      selection: cm.getSelection().length,
      anchor: cm.getCursor('anchor'),
    }));
    expect(etat.selection).toBeLessThan(50);
    expect(Math.abs(etat.anchor.line - 100)).toBeLessThanOrEqual(1);
  });
});

test('latex fluid text preserves source through resize edit selection and reload', async ({page}) => {
  const prose = 'The fire slope remains negative\nin all three elevation zones\nthroughout the observation period.';
  const source = prose + '\n\n\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}\n\n% a comment\nA separate paragraph.\n';
  await withProject({'fluid.tex': source}, async ({root, url}) => {
    await page.setViewportSize({width: 1250, height: 900});
    await page.goto(url('latex_studio.html', 'fluid.tex'));
    await expectEngine(page, 'cm6');
    await expect(page.locator('#sbWrap')).toHaveText('Lignes : texte fluide');
    await expect(page.locator('.cm-fluid-space')).toHaveCount(2);
    const sameVisualLine = () => page.evaluate(() => {
      const a = cm.charCoords({line: 0, ch: 0}, 'window');
      const b = cm.charCoords({line: 1, ch: 0}, 'window');
      return Math.abs(a.top - b.top) < 2;
    });
    await expect.poll(sameVisualLine).toBe(true);
    const paragraphHeight = () => page.locator('.cm-line').first().evaluate((line) => line.getBoundingClientRect().height);
    const wideHeight = await paragraphHeight();
    await page.setViewportSize({width: 640, height: 900});
    await expect.poll(paragraphHeight).toBeGreaterThan(wideHeight);
    await expect.poll(() => page.evaluate(() => cm.getValue())).toBe(source);
    await page.setViewportSize({width: 1250, height: 900});
    await expect.poll(sameVisualLine).toBe(true);
    await expect.poll(paragraphHeight).toBe(wideHeight);
    const targetPoint = await page.evaluate(() => cm.charCoords({line: 1, ch: 3}, 'window'));
    await page.mouse.click(targetPoint.left + 1, (targetPoint.top + targetPoint.bottom) / 2);
    expect(await page.evaluate(() => cm.getCursor())).toEqual({line: 1, ch: 3});
    await page.evaluate(() => cm.setSelection({line: 0, ch: 0}, {line: 2, ch: cm.getLine(2).length}));
    expect(await page.evaluate(() => cm.getSelection())).toBe(prose);
    await page.evaluate(() => { cm.setCursor({line: 1, ch: 0}); cm.focus(); });
    await page.keyboard.type('particularly ');
    const edited = source.replace('in all', 'particularly in all');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toBe(edited);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(() => page.evaluate(() => cm.getValue())).toBe(source);
    await saveShortcut(page);
    expect(readFileSync(path.join(root, 'fluid.tex'), 'utf8')).toBe(source);
    await page.locator('#moreBtn').click();
    await page.locator('[data-act="wrap"]').click();
    await page.locator('[data-wrap="win"]').click();
    await expect(page.locator('.cm-fluid-space')).toHaveCount(0);
    await expect.poll(sameVisualLine).toBe(false);
    await page.locator('#moreBtn').click();
    await page.locator('[data-act="wrap"]').click();
    await page.locator('[data-wrap="fluid"]').click();
    const external = source.replace('three elevation zones', 'three glacier elevation zones');
    const target = path.join(root, 'fluid.tex');
    writeFileSync(target, external);
    const future = new Date(Date.now() + 1500); utimesSync(target, future, future);
    await expect.poll(() => page.evaluate(() => cm.getValue())).toBe(external);
    await expect(page.locator('.cm-fluid-space')).toHaveCount(2);
    await expect(page.locator('.cm-review-selection')).toBeVisible();
    await page.locator('#diffTag').click();
    await expect(page.locator('.cm-review-selection')).toHaveCount(0);
    await expect.poll(sameVisualLine).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe(external);
    await page.screenshot({path: '/tmp/atelier-fluid-text-webkit.png'});
  });
});


test('latex individual review automatically opens, accepts, rejects and protects disk conflicts', async ({page}) => {
  const before = '\\section{Results}\nOriginal first paragraph.\n\nUnchanged context.\n\nOriginal second paragraph.\n';
  const after = before.replace('Original first', 'Revised first').replace('Original second', 'Revised second');
  await withProject({'sample.tex': before}, async ({root,url}) => {
    await page.goto(url('latex_studio.html','sample.tex'));
    await expectEngine(page,'cm6');
    await page.waitForTimeout(700);
    writeFileSync(path.join(root,'sample.tex'),after);
    await expect(page.locator('#diffTag')).toHaveAttribute('aria-pressed','true',{timeout:10000});
    await expect(page.locator('.dv-count')).toHaveText('1/1');
    await expect(page.getByRole('button',{name:'Accepter',exact:true}).first()).toBeAttached();
    await page.getByRole('button',{name:'Accepter',exact:true}).first().click();
    expect(readFileSync(path.join(root,'sample.tex'),'utf8')).toBe(after);
    await page.locator('#diffUndo').click();
    await page.route('**/codesave', async route => { await new Promise(resolve=>setTimeout(resolve,250)); await route.continue(); });
    await page.getByRole('button',{name:'Refuser',exact:true}).first().click();
    expect(await page.evaluate(()=>cm.getOption('readOnly'))).toBe(true);
    await expect.poll(()=>readFileSync(path.join(root,'sample.tex'),'utf8')).toContain('Original first');
    expect(readFileSync(path.join(root,'sample.tex'),'utf8')).toContain('Revised second');
    await expect.poll(()=>page.evaluate(()=>cm.getOption('readOnly'))).toBe(false);
    await page.unroute('**/codesave');
    await page.locator('#diffUndo').click();
    await expect.poll(()=>readFileSync(path.join(root,'sample.tex'),'utf8')).toBe(after);
    const rewrapped = after.replace('Unchanged context.', 'Unchanged\ncontext.');
    writeFileSync(path.join(root,'sample.tex'),rewrapped);
    await expect.poll(()=>page.evaluate(()=>cm.getValue()),{timeout:10000}).toBe(rewrapped);
    await page.locator('#diffTag').click();
    await expect(page.locator('.cm-deletedChunk')).toHaveCount(0);
    await page.locator('#diffTag').click();
    await expect(page.locator('#diffTag')).toHaveAttribute('aria-pressed','true');
    // A second intervention compares only with the immediately previous file.
    const second = rewrapped.replace('Revised second','Final second');
    writeFileSync(path.join(root,'sample.tex'),second);
    await expect(page.locator('.dv-count')).toHaveText('2/2',{timeout:10000});
    await expect(page.locator('.cm-deletedChunk')).not.toContainText('Original first');
    await page.getByRole('button',{name:'Intervention précédente',exact:true}).click();
    await expect(page.locator('.dv-count')).toHaveText('1/2');
    await expect(page.getByRole('button',{name:'Refuser',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Intervention suivante',exact:true}).click();
    await expect(page.locator('.dv-count')).toHaveText('2/2');
    await expect(page.getByRole('button',{name:'Intervention suivante',exact:true})).toBeDisabled();
    // The file changes after display: save must refuse an obsolete mtime.
    await page.route('**/statfile?*',route=>route.fulfill({json:{mtime:0}}));
    const concurrent = second + 'Concurrent disk edit.\n';
    writeFileSync(path.join(root,'sample.tex'),concurrent);
    await page.getByRole('button',{name:'Refuser',exact:true}).first().click();
    await expect(page.locator('#state')).toContainText('non enregistré');
    expect(readFileSync(path.join(root,'sample.tex'),'utf8')).toBe(concurrent);
  });
});


test('latex individual review accepts all permanently without writing the file', async ({page}) => {
  await withProject({'sample.tex':'Original.\n'}, async ({root,url}) => {
    await page.goto(url('latex_studio.html','sample.tex'));
    await expectEngine(page,'cm6');
    await page.waitForTimeout(700);
    writeFileSync(path.join(root,'sample.tex'),'First change.\n');
    await expect(page.locator('.dv-count')).toHaveText('1/1');
    writeFileSync(path.join(root,'sample.tex'),'Second change.\n');
    await expect(page.locator('.dv-count')).toHaveText('2/2');
    await page.getByRole('button',{name:'Intervention précédente',exact:true}).click();
    const saves=[]; page.on('request',r=>{if(r.url().endsWith('/codesave'))saves.push(r.url())});
    await page.locator('#diffAcceptAll').click();
    await expect(page.locator('.dv-count')).toHaveText('0');
    await expect(page.locator('#diffTag')).toBeDisabled();
    expect(await page.evaluate(()=>cm.getValue())).toBe('Second change.\n');
    expect(readFileSync(path.join(root,'sample.tex'),'utf8')).toBe('Second change.\n');
    expect(saves).toHaveLength(0);
    await expect(page.locator('#diffUndo')).toBeHidden();
    await expect(page.locator('#diffAcceptAll')).toBeDisabled();
    await page.reload(); await expectEngine(page,'cm6');
    await expect(page.locator('.dv-count')).toHaveText('0');
    writeFileSync(path.join(root,'sample.tex'),'Third change.\n');
    await expect(page.locator('.dv-count')).toHaveText('1/1');
  });
});

test('latex toolbar console docks below editor and follows real compile states', async ({page}) => {
  await withProject({'sample.tex':'\\section{Results}\nValid text.\n'}, async ({url}) => {
    await page.goto(url('latex_studio.html','sample.tex'));await expectEngine(page,'cm6');
    let release;const gate=new Promise(r=>release=r);
    await page.route('**/compile',async route=>{await gate;await route.fulfill({json:{ok:false,log:'! Undefined control sequence.\nl.2 \\bad'}})});
    await page.locator('#build').click();await expect(page.locator('#build')).toHaveAttribute('aria-busy','true');
    release();await expect(page.locator('#texlog')).toBeVisible();await expect(page.locator('#build')).toHaveAttribute('data-compile','err');
    const editor=await page.locator('#split').boundingBox(),consoleBox=await page.locator('#texlog').boundingBox();
    expect(consoleBox.y).toBeGreaterThanOrEqual(editor.y+editor.height-1);
    await expect(page.locator('#tlIssues')).toContainText('Undefined control sequence');
    await page.locator('#tlLogTab').click();await expect(page.locator('#tlBody')).toContainText('l.2');
    await page.locator('#tlResize').focus();await page.keyboard.press('ArrowUp');
    await expect(page.locator('#tlResize')).toHaveAttribute('aria-valuenow','200');
    await page.unroute('**/compile');await page.route('**/compile',route=>route.fulfill({json:{ok:true,log:'Output written.'}}));
    await page.locator('#tlRetry').click();await expect(page.locator('#build')).toHaveAttribute('data-compile','ok');
    await page.locator('#tlClose').click();await expect(page.locator('#texlog')).toBeHidden();
  });
});

test('latex individual review keeps selection stable while scrolling diff widgets', async ({page}) => {
  const before = Array.from({length:120},(_,i)=>`Original paragraph ${i}.\n`).join('\n');
  await withProject({'sample.tex':before}, async ({root,url}) => {
    await page.goto(url('latex_studio.html','sample.tex'));
    await expectEngine(page,'cm6');
    await page.waitForTimeout(700);
    writeFileSync(path.join(root,'sample.tex'),before.replaceAll('Original','Revised'));
    await expect(page.locator('.cm-review-selection')).toBeVisible();
    await page.evaluate(()=>{cm.focus();cm.setSelection({line:0,ch:0},{line:0,ch:7});});
    await expect.poll(()=>page.evaluate(()=>cm.getSelection())).toBe('Revised');
    await expect(page.locator('.cm-selectionBackground').first()).toBeVisible();
    const selection = page.locator('.cm-selectionBackground').first();
    await expect(selection).toHaveCSS('background-color', 'rgba(232, 130, 58, 0.38)');
    await page.locator('#toolbarWrap').focus();
    await expect(page.locator('.cm-review-selection')).not.toHaveClass(/cm-focused/);
    await expect(selection).toHaveCSS('background-color', 'rgba(232, 130, 58, 0.38)');
    expect(await page.evaluate(()=>cm.getSelection())).toBe('Revised');
    await page.evaluate(()=>cm.focus());
    await expect(selection).toHaveCSS('background-color', 'rgba(232, 130, 58, 0.38)');
    await page.locator('.cm-scroller').hover();
    await page.mouse.wheel(0,1800);
    await page.waitForTimeout(250);
    expect(await page.evaluate(()=>cm.getSelection())).toBe('Revised');
    await page.evaluate(()=>cm.setCursor({line:0,ch:0}));
    await page.mouse.wheel(0,-1800);
    await expect(page.locator('.cm-selectionBackground')).toHaveCount(0);
    expect(await page.locator('.cm-content').evaluate(el=>getComputedStyle(el,'::selection').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await page.locator('#diffTag').click();
    await expect(page.locator('.cm-review-selection')).toHaveCount(0);
  });
});

test('latex individual review gutter keeps controls outside wrapped text and covers each chunk', async ({page}) => {
  const original = 'Old wording. '.repeat(28) + '\n\nUnchanged context.\n';
  const current = 'New wording. '.repeat(34) + '\n\nUnchanged context.\n';
  await withProject({'sample.tex':current}, async ({url}) => {
    await page.goto(url('latex_studio.html','sample.tex'));
    await expectEngine(page,'cm6');
    await page.evaluate(original=>cm.showMergeDiff(original,{individual:true,onDecision:value=>{window.__gutterDecision=value;}}), original);
    for (const width of [1050,620]) {
      await page.setViewportSize({width,height:850});
      const widget=page.locator('.cm-deletedChunk:has(.atelier-review-decision)').first();
      await expect.poll(()=>widget.evaluate(el=>parseFloat(el.style.getPropertyValue('--review-height')))).toBeGreaterThan(80);
      const geometry=await widget.evaluate(el=>{
        const r=el.getBoundingClientRect(),buttons=el.querySelector('.cm-chunkButtons').getBoundingClientRect();
        const line=el.querySelector('.cm-deletedLine')?.getBoundingClientRect();
        const bracket=getComputedStyle(el,'::before');
        return {outside:buttons.right<r.left,noBar:line?Math.abs(line.top-r.top)<1:r.height===0,height:parseFloat(bracket.height),widgetHeight:r.height,opensRight:bracket.borderRightWidth==='0px'};
      });
      expect(geometry.outside).toBe(true);expect(geometry.noBar).toBe(true);
      expect(geometry.height).toBeGreaterThan(geometry.widgetHeight);expect(geometry.opensRight).toBe(true);
    }
    await page.screenshot({path:'/tmp/atelier-review-gutter.png'});
    await page.getByRole('button',{name:'Refuser',exact:true}).first().click();
    expect(await page.evaluate(()=>window.__gutterDecision.text)).toBe(original);
    // A trailing blank added line still belongs inside the bracket.
    await page.evaluate(()=>{cm.hideMergeDiff();cm.setValue('New\n\nContext\n');cm.showMergeDiff('Old\nContext\n',{individual:true,onDecision:()=>{}});});
    await expect.poll(()=>page.evaluate(()=>{
      const widget=document.querySelector('.cm-deletedChunk');
      const bottom=widget.getBoundingClientRect().top+parseFloat(widget.style.getPropertyValue('--review-height'));
      const blank=document.querySelectorAll('.cm-line')[1].getBoundingClientRect();
      return Math.abs(bottom-blank.bottom)<2;
    })).toBe(true);
    await page.evaluate(()=>{cm.hideMergeDiff();cm.setValue('Added.\nContext.\n');cm.showMergeDiff('Context.\n',{individual:true,onDecision:value=>{window.__gutterDecision=value;}});});
    await expect(page.locator('.atelier-review-compact')).toHaveCount(1);
    await expect(page.locator('.cm-chunkButtons')).toHaveCSS('position','absolute');
    await page.getByRole('button',{name:'Accepter',exact:true}).click();
    expect(await page.evaluate(()=>window.__gutterDecision.base)).toBe('Added.\nContext.\n');
    await page.evaluate(()=>cm.hideMergeDiff());
    await expect(page.locator('.atelier-review-gutter')).toHaveCount(0);
    await expect(page.locator('.atelier-review-decision')).toHaveCount(0);
  });
});
