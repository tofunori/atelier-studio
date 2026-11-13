// Notes posées par l'agent du chat (outil atelier_annotate, Thierry
// 2026-11-09) : l'éditeur LaTeX et le lecteur PDF les affichent signées,
// Thierry y répond (fil gardé dans le store et copie au chat), la réponse de
// l'agent arrive sans rechargement, Résoudre et Accepter ferment la note.
// Le store est écrit ici comme l'écrit l'outil Rust (fichier entier remplacé).
import {test, expect, type Page} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mts';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(GALLERY, '..', 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');

const TEX = [
  '\\begin{abstract}',
  'Wildfire smoke lowers glacier albedo and enhances melt.',
  '\\end{abstract}',
  '\\section{Introduction}',
  'Glaciers retreat quickly in western Canada.',
  '',
].join('\n');

type Store = Record<string, any[]>;
const storeFile = (dir: string) => path.join(dir, '.fig_thumbs', 'pdf_annots.json');
const readStore = (dir: string): Store => { try { return JSON.parse(readFileSync(storeFile(dir), 'utf8')); } catch { return {}; } };
function writeStore(dir: string, store: Store) {
  mkdirSync(path.join(dir, '.fig_thumbs'), {recursive: true});
  writeFileSync(storeFile(dir) + '.tmp', JSON.stringify(store));
  renameSync(storeFile(dir) + '.tmp', storeFile(dir));
}

const remark = {id: 'a1-0', from: {line: 1, ch: 0}, to: {line: 1, ch: 36}, text: 'Wildfire smoke lowers glacier albedo',
  comment: 'Ici, « lowers » vient de Ren 2021 : la baisse mesurée est de 0,04 en JJA.', by: 'agent', author: 'Claude', at: 1};
const proposal = {id: 'a1-1', from: {line: 4, ch: 0}, to: {line: 4, ch: 24}, text: 'Glaciers retreat quickly',
  comment: 'Donner l’ordre de grandeur.', by: 'agent', author: 'Claude', at: 1,
  suggest: {text: 'Glaciers retreat by about 30 m per year', reason: 'Chiffre de Menounos 2019.'}};

async function withProject(run: (ctx: {root: string; file: string; url: string; port: number}) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-agent-notes-'));
  const appDir = path.join(root, '.app');
  mkdirSync(appDir);
  let server;
  try {
    const file = path.join(root, 'main.tex');
    writeFileSync(file, TEX);
    copyFileSync(FIXTURE, path.join(root, 'paper.pdf'));
    writeStore(root, {[`tex-comments:${file}`]: [remark, proposal]});
    const port = await freePort();
    server = spawnGalleryServer({root, port, watch: false, env: {ATELIER_APP_DIR: appDir}});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, file, port, url: `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(file)}`});
  } finally { await stop(server); await removeTempRoot(root); }
}

async function withChatHost(page: Page) {
  // Hôte factice : accuse réception des envois au chat et les garde.
  await page.addInitScript(() => {
    (window as any).__chat = [];
    window.addEventListener('message', event => {
      const data = event.data;
      if (data?.type !== 'atelier-add-to-chat') return;
      (window as any).__chat.push(data);
      window.postMessage({type: 'atelier-add-to-chat-ack', nonce: data.nonce, requestId: data.requestId, ok: true}, '*');
    });
  });
}

test('agent notes in LaTeX: signed in place, reply in the thread and the chat, live answer, resolve', async ({page}) => {
  await withProject(async ({root, file, url}) => {
    await withChatHost(page);
    await page.goto(url);
    await expect(page.locator('.cm-editor')).toBeVisible();
    const heads = page.locator('.texa-head');
    await expect(heads).toHaveCount(2);
    await expect(heads.first().locator('.texa-who')).toHaveText('Claude');
    await expect(heads.first().locator('.is-agent')).toBeVisible();
    const first = page.locator('.texa-block').first();
    await expect(first.locator('.texa-resolve')).toBeVisible();

    // Répondre : le message reste dans le fil (store) et part au chat.
    const saved = page.waitForResponse(r => r.url().includes('/pdfannot') && r.request().method() === 'POST');
    await first.locator('.texa-answer').click();
    await first.locator('.texr-input').fill('Et pour la fonte ?');
    await first.locator('.texr-input').press('Enter');
    expect((await saved).ok()).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__chat.length)).toBe(1);
    const request = await page.evaluate(() => (window as any).__chat[0]);
    expect(request.text).toContain('Réponse sur ta note [a1-0] dans main.tex (ligne 2) : Et pour la fonte ?');
    expect(request.text).toContain('atelier_annotate, action reply');
    await expect(page.locator('.texa-wait').first()).toBeVisible();
    const key = `tex-comments:${file}`;
    expect(readStore(root)[key].find(a => a.id === 'a1-0').thread.map(m => m.by)).toEqual(['user']);

    // L'agent répond (outil Rust) : la réponse arrive sans rechargement, non lue.
    const store = readStore(root);
    const note = store[key].find(a => a.id === 'a1-0');
    note.thread.push({id: 'm' + (Date.now() + 1), by: 'agent', author: 'Claude', text: 'La fonte augmente de 8 % (Aubry-Wake 2022).', at: Date.now() + 1});
    await new Promise(resolve => setTimeout(resolve, 1100));
    writeStore(root, store);
    await expect(first.locator('.texa-msg')).toHaveCount(2, {timeout: 10_000});
    await expect(first.locator('.texa-msg').nth(1)).toContainText('Aubry-Wake 2022');
    await expect(page.locator('.texa-head .is-unread')).toHaveCount(1);

    // Filtre du panneau : Toutes / Les miennes / Claude.
    if (!(await page.locator('#texcPanel .tp-filter').isVisible().catch(() => false))) {
      await page.locator('#texcBtn').click();
    }
    const filter = page.locator('#texcPanel .tp-filter');
    await expect(filter.getByRole('button')).toHaveText(['Toutes', 'Les miennes', 'Claude']);

    // Résoudre : la note quitte la page et le store.
    const resolved = page.waitForResponse(r => r.url().includes('/pdfannot') && r.request().method() === 'POST');
    await page.locator('.texa-block').first().locator('.texa-resolve').click();
    expect((await resolved).ok()).toBe(true);
    await expect(heads).toHaveCount(1);
    expect(readStore(root)[key].map(a => a.id)).toEqual(['a1-1']);
  });
});

test('agent proposal in LaTeX: accept replaces only the passage', async ({page}) => {
  await withProject(async ({root, file, url}) => {
    await withChatHost(page);
    await page.goto(url);
    await expect(page.locator('.texa-head')).toHaveCount(2);
    const block = page.locator('.texa-block.texr-proposal');
    await expect(block.locator('.texr-new b')).toHaveText(['by about 30 m per year']);
    await expect(block.locator('.texr-why')).toHaveText('Chiffre de Menounos 2019.');
    await block.locator('.texr-accept').click();
    await expect(page.locator('.texa-head')).toHaveCount(1);
    const text = await page.evaluate(() => (window as any).texEditor?.getValue?.() ?? document.querySelector('.cm-content')?.textContent);
    expect(text).toContain('Glaciers retreat by about 30 m per year in western Canada.');
    expect(text).toContain('Wildfire smoke lowers glacier albedo and enhances melt.');
    // Rien n'est envoyé au chat : accepter est local.
    expect(await page.evaluate(() => (window as any).__chat.length)).toBe(0);
    await expect.poll(() => readStore(root)[`tex-comments:${file}`].map(a => a.id)).toEqual(['a1-0']);
  });
});

test('agent note in a project PDF: a Word card signed by the user, reply kept in the thread even when the agent writes meanwhile', async ({page}) => {
  await withProject(async ({root, port}) => {
    await withChatHost(page);
    writeStore(root, {...readStore(root), 'paper.pdf': [{id: 'a2-0p1', page: 1, kind: 'hl', color: 'rgba(255,213,74,.40)',
      rects: [[0.1, 0.2, 0.3, 0.012]], text: 'passage', note: '', by: 'agent', author: 'Claude', at: 1,
      memo: 'Ce passage définit l’albédo large bande.'}]});
    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=paper.pdf`);
    await expect.poll(() => page.locator('.pg[data-page="1"] canvas').evaluate(c => (c as HTMLCanvasElement).width).catch(() => 0),
      {timeout: 15_000}).toBeGreaterThan(0);
    // copie du projet (TP) : la note de Claude est la sienne, sans marque de l'agent
    const card = page.locator('#annPane .pc-list .cc').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.tx')).toHaveText('Ce passage définit l’albédo large bande.');
    await expect(card.locator('.nm')).not.toHaveText(/Claude/);
    await page.locator('.pg[data-page="1"] .pdfmemo').click();
    const open = page.locator('#annPane .pc-list .cc.on');
    await expect(open).toBeVisible();
    await expect(page.locator('#annotPop')).toBeHidden();

    // L'agent écrit dans le fil pendant que Thierry répond : les deux messages restent.
    const store = readStore(root);
    store['paper.pdf'][0].thread = [{id: 'm1', by: 'agent', author: 'Claude', text: 'Voir aussi la section 2.', at: 5}];
    writeStore(root, store);
    const saved = page.waitForResponse(r => r.url().includes('/pdfannot') && r.request().method() === 'POST');
    await open.locator('.c-field textarea').fill('Quelle bande spectrale ?');
    await open.locator('[data-act=reply]').click();
    expect((await saved).ok()).toBe(true);
    await expect.poll(() => readStore(root)['paper.pdf'][0].thread?.map(m => m.by)).toEqual(['agent', 'user']);
  });
});
