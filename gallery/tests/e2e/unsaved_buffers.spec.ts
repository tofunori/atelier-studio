// Audit 2026-10-18, problèmes 1 et 4 : un tampon non enregistré ne disparaît
// jamais. Contre le vrai serveur galerie Rust :
// - brouillon de secours écrit pendant la frappe, restauré comme « modifié »
//   à la réouverture, jamais écrit dans le fichier (LaTeX, code, Markdown) ;
// - l'état « modifié » est publié à l'app hôte, et « aller à la ligne »
//   d'un fichier ouvert ne recharge plus l'iframe ;
// - un changement disque ou un 409 ne remplace jamais le tampon modifié.
import {test, expect, type Page, type Frame} from '@playwright/test';
import { spawnGalleryServer, freePort, stopGalleryServer as stop } from '../gallery_server.mts';
import {mkdtempSync, writeFileSync, readFileSync, renameSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import { removeTempRoot } from './temp-root.ts';

type Project = {root: string; port: number; url: (asset: string, name: string, extra?: string) => string};

async function withProject(files: Record<string, string>, run: (project: Project) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-unsaved-'));
  let server;
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text);
    const port = await freePort();
    server = spawnGalleryServer({ root, port });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, port, url: (asset, name, extra = '') =>
      `http://127.0.0.1:${port}/.fig_thumbs/${asset}?path=${encodeURIComponent(path.join(root, name))}${extra}`});
  } finally { await stop(server); await removeTempRoot(root); }
}

// `cm` n'existe qu'une fois l'éditeur monté.
const buffer = (target: Page | Frame) => target.evaluate(() => typeof cm === 'undefined' ? null : cm.getValue());

const SAVE = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';

function draftWritten(page: Page) {
  return page.waitForResponse((r) => r.url().endsWith('/draft') && r.request().method() === 'POST'
    && !String(r.request().postData() || '').includes('"clear"'));
}

async function serverDraft(port: number, file: string) {
  const response = await fetch(`http://127.0.0.1:${port}/draft?path=${encodeURIComponent(file)}`);
  return (await response.json()).draft;
}

function externalWrite(target: string, text: string, aheadMs = 1500) {
  const temp = `${target}.external`;
  writeFileSync(temp, text);
  const future = new Date(Date.now() + aheadMs); utimesSync(temp, future, future); renameSync(temp, target);
}

async function typeAtEnd(page: Page | Frame, text: string) {
  await page.locator('.cm-content').click();
  const key = process.platform === 'darwin' ? 'Meta+End' : 'Control+End';
  if ('keyboard' in page) { await page.keyboard.press(key); await page.keyboard.type(text); }
  else { await page.page().keyboard.press(key); await page.page().keyboard.type(text); }
}

for (const [asset, file, initial] of [
  ['latex_studio.html', 'main.tex', '\\section{Un}\nTexte.\n'],
  ['code_editor.html', 'sample.py', 'value = 1\n'],
] as const) {
  test(`${asset}: an unsaved buffer comes back as modified after the page is reloaded`, async ({page}) => {
    await withProject({[file]: initial}, async ({root, port, url}) => {
      const target = path.join(root, file);
      await page.goto(url(asset, file));
      await expect(page.locator('.cm-editor')).toBeVisible();
      await expect.poll(() => buffer(page)).toBe(initial);
      const written = draftWritten(page);
      await typeAtEnd(page, 'brouillon perdu ?');
      expect((await written).ok()).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe(initial);
      expect((await serverDraft(port, target))?.text).toContain('brouillon perdu ?');

      await page.reload();
      await expect.poll(() => buffer(page)).toContain('brouillon perdu ?');
      if (asset === 'latex_studio.html') await expect(page.locator('#ddot')).toBeVisible();
      else await expect(page.locator('#state')).toHaveClass(/dirty/);
      await expect(page.locator('#state')).toContainText(/brouillon non enregistré/i);
      expect(readFileSync(target, 'utf8'), 'le brouillon n’est jamais écrit dans le fichier').toBe(initial);

      const saved = page.waitForResponse((r) => r.url().endsWith('/codesave') && r.request().method() === 'POST');
      await page.keyboard.press(SAVE);
      expect((await saved).ok()).toBe(true);
      expect(readFileSync(target, 'utf8')).toContain('brouillon perdu ?');
      await expect.poll(() => serverDraft(port, target)).toBeNull();
    });
  });
}

test('md_studio.html: an unsaved buffer comes back as modified after the page is reloaded', async ({page}) => {
  await withProject({'note.md': '# Titre\n\nTexte.\n'}, async ({root, port, url}) => {
    const target = path.join(root, 'note.md');
    await page.goto(url('md_studio.html', 'note.md'));
    await expect.poll(() => page.evaluate(() => typeof editor !== 'undefined' && editor !== null && editor.getMarkdown())).toContain('Texte.');
    const written = draftWritten(page);
    await page.evaluate(() => editor.setMarkdown('# Titre\n\nTexte retouché sans ⌘S.\n', false));
    expect((await written).ok()).toBe(true);
    await expect(page.locator('#state')).toHaveClass(/dirty/);
    expect(readFileSync(target, 'utf8')).toBe('# Titre\n\nTexte.\n');

    await page.reload();
    await expect.poll(() => page.evaluate(() => editor && editor.getMarkdown())).toContain('Texte retouché sans ⌘S.');
    await expect(page.locator('#state')).toHaveClass(/dirty/);
    await expect(page.locator('#state')).toContainText(/brouillon non enregistré/i);
    expect(readFileSync(target, 'utf8')).toBe('# Titre\n\nTexte.\n');
    expect((await serverDraft(port, target))?.text).toContain('Texte retouché');
  });
});

// EDIT-02 : en thème clair, Toast UI n'impose plus ses paragraphes #fff.
test('md_studio.html: Toast UI follows the app theme and its prose uses the tokens', async ({page}) => {
  await withProject({'note.md': '# Titre\n\nTexte.\n'}, async ({url}) => {
    await page.addInitScript(() => localStorage.setItem('atelier-theme-cache', JSON.stringify({
      type: 'atelier-theme', version: 3, colorScheme: 'light',
      vars: {'--surface-app': '#faf9f5', '--surface-header': '#f0eee6', '--text-primary': '#1f1e1d'}})));
    await page.goto(url('md_studio.html', 'note.md'));
    await expect.poll(() => page.evaluate(() => typeof editor !== 'undefined' && editor !== null)).toBe(true);
    const prose = page.locator('#ed .toastui-editor-ww-container .toastui-editor-contents p').first();
    await expect(prose).toHaveCSS('color', 'rgb(31, 30, 29)');
    await expect(page.locator('#ed .toastui-editor-defaultUI')).not.toHaveClass(/toastui-editor-dark/);
    // l'hôte passe en sombre : la classe suit, et survit à la bascule de mode
    await page.evaluate(() => window.postMessage({type: 'atelier-theme', version: 3, colorScheme: 'dark',
      vars: {'--surface-app': '#1e2124', '--text-primary': '#dadee3'}}, '*'));
    await expect(page.locator('#ed .toastui-editor-defaultUI')).toHaveClass(/toastui-editor-dark/);
    await expect(prose).toHaveCSS('color', 'rgb(218, 222, 227)');
    await page.locator('#ed .toastui-editor-mode-switch .tab-item').first().click();
    await expect(page.locator('#ed .toastui-editor-defaultUI')).toHaveClass(/toastui-editor-dark/);
  });
});

test('the editor tells its host when it is modified, and goes to a line without reloading', async ({page}) => {
  // Paragraphes séparés : en texte fluide, les lignes d'un même paragraphe
  // partagent une seule ligne visuelle.
  const lines = Array.from({length: 120}, (_, index) => `Ligne ${index + 1}.`).join('\n\n') + '\n';
  await withProject({'long.tex': lines}, async ({url}) => {
    const editorUrl = url('latex_studio.html', 'long.tex');
    // Hôte d'une autre origine (autre port), comme l'app (tauri://localhost) :
    // il reçoit les messages de l'éditeur et lui parle par postMessage. Servi
    // par un vrai serveur local : une page interceptée serait « publique »
    // pour Chromium, qui bloquerait alors l'iframe locale.
    const hostHtml = `<!doctype html><meta charset="utf-8"><body style="margin:0">
       <iframe id="doc" style="width:900px;height:600px;border:0" src="${editorUrl}"></iframe>
       <script>window.__msgs=[];addEventListener('message',(e)=>{if(e.source===document.getElementById('doc').contentWindow)window.__msgs.push(e.data);});</script>`;
    const host = createServer((_request, response) => { response.writeHead(200, {'Content-Type': 'text/html'}); response.end(hostHtml); });
    await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve));
    try {
    await page.goto(`http://127.0.0.1:${(host.address() as AddressInfo).port}/`);
    const frame = page.frameLocator('#doc');
    await expect(frame.locator('.cm-editor')).toBeVisible();
    const inner = page.frames().find((candidate) => candidate.url().includes('latex_studio.html'))!;
    await inner.evaluate(() => { cm.focus(); cm.setCursor({line: 0, ch: 0}); });
    await page.keyboard.type('Retouche ');
    await expect.poll(() => page.evaluate(() => window.__msgs.filter((m) => m.type === 'atelier-dirty').map((m) => m.dirty)), 'état initial publié, puis « modifié »').toEqual([false, true]);
    await inner.evaluate(() => { (window as any).__sameDocument = true; });

    await page.evaluate(() => (document.getElementById('doc') as HTMLIFrameElement).contentWindow.postMessage({type: 'atelier-goto-line', line: '199'}, '*'));
    await expect(frame.locator('.cm-line-flash')).toContainText('Ligne 100.');
    expect(await inner.evaluate(() => (window as any).__sameDocument), 'pas de rechargement').toBe(true);
    await expect.poll(() => buffer(inner)).toContain('Retouche Ligne 1.');

    const saved = page.waitForResponse((r) => r.url().endsWith('/codesave') && r.request().method() === 'POST');
    await page.keyboard.press(SAVE);
    expect((await saved).ok()).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__msgs.filter((m) => m.type === 'atelier-dirty').map((m) => m.dirty))).toEqual([false, true, false]);
    } finally { host.close(); }
  });
});

test('code editor: a disk change never replaces a modified buffer', async ({page}) => {
  await withProject({'sample.py': 'value = 1\n'}, async ({root, url}) => {
    const target = path.join(root, 'sample.py');
    await page.goto(url('code_editor.html', 'sample.py'));
    await expect.poll(() => buffer(page)).toBe('value = 1\n');
    await page.evaluate(() => { cm.focus(); cm.setCursor({line: 0, ch: 9}); });
    await page.keyboard.type(' # local');
    await expect(page.locator('#state')).toHaveClass(/dirty/);
    externalWrite(target, 'value = 2  # agent\n');
    await expect(page.locator('#state')).toHaveClass(/conflict/, {timeout: 8000});
    await page.waitForTimeout(2500); // une sonde de plus : toujours rien de remplacé
    expect(await buffer(page)).toBe('value = 1 # local\n');
    expect(readFileSync(target, 'utf8')).toBe('value = 2  # agent\n');
  });
});

test('latex: a save refused with 409 keeps the buffer and reports the conflict', async ({page}) => {
  await withProject({'main.tex': 'Phrase un.\nPhrase deux.\n'}, async ({root, url}) => {
    const target = path.join(root, 'main.tex');
    await page.goto(url('latex_studio.html', 'main.tex'));
    await expect.poll(() => buffer(page)).toBe('Phrase un.\nPhrase deux.\n');
    await page.evaluate(() => { cm.focus(); cm.setCursor({line: 0, ch: 0}); });
    await page.keyboard.type('Local. ');
    await expect(page.locator('#ddot')).toBeVisible();
    externalWrite(target, 'Phrase un, version agent.\nPhrase deux.\n');
    await expect(page.locator('#state')).toHaveClass(/err/, {timeout: 8000});

    const refused = page.waitForResponse((r) => r.url().endsWith('/codesave') && r.request().method() === 'POST');
    await page.keyboard.press(SAVE);
    expect((await refused).status()).toBe(409);
    await expect(page.locator('#state')).toHaveClass(/err/);
    expect(await buffer(page), 'le tampon n’est jamais remplacé').toBe('Local. Phrase un.\nPhrase deux.\n');
    expect(readFileSync(target, 'utf8'), 'le premier ⌘S n’écrase pas l’agent').toBe('Phrase un, version agent.\nPhrase deux.\n');
    await expect(page.locator('#ddot')).toBeVisible();

    const kept = page.waitForResponse((r) => r.url().endsWith('/codesave') && r.request().method() === 'POST');
    await page.keyboard.press(SAVE);
    expect((await kept).ok()).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('Local. Phrase un.\nPhrase deux.\n');
  });
});
