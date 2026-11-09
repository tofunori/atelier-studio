// Rondes d'annotations (Thierry 2026-11-08) : notes enregistrées, « Réviser
// avec l'agent », réponse de l'agent servie par le vrai serveur Rust
// (/texrevisions lit tex_revisions.json du dossier de l'app), Accepter ⌘↩.
import {test, expect, type Page} from '@playwright/test';
import { spawnGalleryServer, freePort, stopGalleryServer as stop } from '../gallery_server.mts';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { removeTempRoot } from './temp-root.ts';

const TEX = [
  '\\begin{abstract}',
  'Wildfire smoke lowers glacier albedo and enhances melt.',
  '\\end{abstract}',
  '\\section{Introduction}',
  'Glaciers retreat quickly in western Canada.',
  '',
].join('\n');

async function withProject(run: (ctx: {root: string; appDir: string; file: string; url: string}) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), 'atelier-rounds-'));
  const appDir = path.join(root, '.app');
  mkdirSync(appDir);
  let server;
  try {
    const file = path.join(root, 'main.tex');
    writeFileSync(file, TEX);
    const port = await freePort();
    server = spawnGalleryServer({root, port, env: {ATELIER_APP_DIR: appDir}});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    await run({root, appDir, file, url: `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(file)}`});
  } finally { await stop(server); await removeTempRoot(root); }
}

async function openWithHost(page: Page, url: string) {
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
  await page.goto(url);
  await expect(page.locator('.cm-editor')).toBeVisible();
}

async function annotate(page: Page, line: number, from: number, text: string, note: string) {
  await page.evaluate(([line, from, text]) => (window as any).texcOpen({
    from: {line, ch: from}, to: {line, ch: from + String(text).length}, text,
  }), [line, from, text] as const);
  const saved = page.waitForResponse(r => r.url().includes('/pdfannot') && r.request().method() === 'POST');
  await page.locator('#texcPop textarea').fill(note);
  await page.locator('#texcPop textarea').press('Enter');
  expect((await saved).ok()).toBe(true);
  await expect(page.locator('#texcPop')).toBeHidden();
}

test('annotation round: notes wait, the agent proposes in place, accept replaces only the passage', async ({page}) => {
  await withProject(async ({appDir, file, url}) => {
    await openWithHost(page, url);
    const passage = 'Wildfire smoke lowers glacier albedo and enhances melt.';
    await annotate(page, 1, 0, passage, 'Commencer par le résultat.');
    await annotate(page, 4, 0, 'Glaciers retreat quickly', 'Combien, et depuis quand ?');
    // Entrée garde les notes : rien n'est parti au chat.
    expect(await page.evaluate(() => (window as any).__chat.length)).toBe(0);

    // Annotations a son icône dans la barre (2026-11-08).
    await page.locator('#texcBtn').click();
    const panel = page.locator('#texcPanel');
    await expect(panel.locator('.tp-title')).toHaveText('Annotations');
    await expect(panel.locator('.tp-sub')).toHaveText('2 notes');
    await panel.getByRole('button', {name: 'Réviser avec l’agent'}).click();

    // Une seule demande, directe, avec les ids de notes et la règle de l'outil.
    await expect.poll(() => page.evaluate(() => (window as any).__chat.length)).toBe(1);
    const request = await page.evaluate(() => (window as any).__chat[0]);
    expect(request.direct).toBe(true);
    expect(request.text).toContain('Ronde d\'annotations 1 sur main.tex : 2 notes.');
    expect(request.text).toContain('· Résumé');
    expect(request.text).toContain('· 1 · Introduction');
    const round = /round « (r\d+) »/.exec(request.text)![1];
    const ids = [...request.text.matchAll(/^\[([^\]]+)\]/gm)].map(m => m[1]);
    expect(ids).toHaveLength(2);
    await expect(panel.locator('.tp-title')).toHaveText('Ronde 1');
    await expect(panel.locator('.tp-work')).toContainText('L’agent révise 2 notes');
    await expect(page.locator('.atelier-annotation-number.is-busy')).toHaveCount(2);

    // L'agent répond (ce que le runtime écrit pour l'outil atelier_revision).
    const proposal = 'Glacier albedo drops after large fire seasons, which enhances melt.';
    writeFileSync(path.join(appDir, 'tex_revisions.json'), JSON.stringify({[file]: {round, seq: 2, items: {
      [ids[0]]: {kind: 'propose', text: proposal, reason: 'Le résultat passe en tête.', author: 'Codex', seq: 1, at: Date.now()},
      [ids[1]]: {kind: 'ask', question: 'Quelle période veux-tu citer ?', author: 'Codex', seq: 2, at: Date.now()},
    }}}));
    const block = page.locator('.texr-proposal');
    await expect(block).toBeVisible();
    await expect(block.locator('.texr-new-line')).toContainText(proposal);
    await expect(block.locator('.texr-why')).toHaveText('Le résultat passe en tête.');
    await expect(page.locator('.texr-head .texr-note').first()).toHaveText('Commencer par le résultat.');
    await expect(page.locator('.texc-hl.texr-old')).toBeVisible();
    await expect(page.locator('.texr-del-word').first()).toBeVisible();
    await expect(page.locator('.texr-question')).toContainText('Quelle période veux-tu citer ?');
    await expect(panel.locator('.tp-sub')).toHaveText('2 notes · 2 à revoir');
    await expect(panel.locator('.tone-todo')).toContainText('À revoir');
    await expect(panel.locator('.tone-ask')).toContainText('Question pour toi');
    // Rien n'a encore touché le texte.
    expect(await page.evaluate(() => (window as any).cm.getValue())).toBe(TEX);

    // Le champ d'une question garde le clavier (le widget garde ses événements).
    await page.locator('.texr-question .texr-input').click();
    await page.keyboard.type('Depuis 2000');
    await expect(page.locator('.texr-question .texr-input')).toHaveValue('Depuis 2000');
    expect(await page.evaluate(() => (window as any).cm.getValue())).toBe(TEX);

    // Accepter (⌘↩) remplace le passage et lui seul, puis l'historique est écrit.
    const history = page.waitForResponse(r => r.url().includes('/pdfannot') && r.request().method() === 'POST'
      && String(r.request().postData()).includes('tex-rounds:'));
    await page.locator('.cm-content').click({position: {x: 5, y: 5}});
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(block).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).cm.getValue())).toBe(TEX.replace(passage, proposal));
    const saved = JSON.parse(String((await history).request().postData()));
    expect(saved.annots[0]).toMatchObject({decision: 'acc', proposal, n: 1});

    // Répondre à la question renvoie la note à l'agent.
    await page.locator('.texr-question .texr-input').press('Enter');
    await expect.poll(() => page.evaluate(() => (window as any).__chat.length)).toBe(2);
    expect((await page.evaluate(() => (window as any).__chat[1])).text).toMatch(/^Réponse à ta question sur la note \[[^\]]+\] \(ronde 1, main\.tex\) : Depuis 2000/);
    await expect(page.locator('.texr-question')).toHaveCount(0);
    await expect(panel.locator('.tp-work')).toContainText('L’agent révise 1 note');
  });
});

test('annotation round: reject keeps the text and the round panel survives a reload', async ({page}) => {
  await withProject(async ({appDir, file, url}) => {
    await openWithHost(page, url);
    const passage = 'Glaciers retreat quickly';
    await annotate(page, 4, 0, passage, 'Chiffrer.');
    // Annotations a son icône dans la barre (2026-11-08).
    await page.locator('#texcBtn').click();
    await page.locator('#texcPanel').getByRole('button', {name: 'Réviser avec l’agent'}).click();
    await expect.poll(() => page.evaluate(() => (window as any).__chat.length)).toBe(1);
    const text = (await page.evaluate(() => (window as any).__chat[0])).text as string;
    const round = /round « (r\d+) »/.exec(text)![1];
    const id = /^\[([^\]]+)\]/m.exec(text)![1];
    // Rechargement pendant que l'agent travaille : la ronde reprend.
    await page.reload();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('#texcPanel .tp-title')).toHaveText('Ronde 1');
    writeFileSync(path.join(appDir, 'tex_revisions.json'), JSON.stringify({[file]: {round, seq: 1, items: {
      [id]: {kind: 'propose', text: 'Glaciers lost 30 % of their area since 1985', reason: 'Un chiffre.', author: 'Claude', seq: 1, at: Date.now()},
    }}}));
    await expect(page.locator('.texr-proposal')).toBeVisible();
    await page.locator('.texr-reject').click();
    await expect(page.locator('.texr-proposal')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).cm.getValue())).toBe(TEX);
    await expect(page.locator('#texcPanel .tp-title')).toHaveText('Annotations');
    await expect(page.locator('#texcPanel .tp-past')).toContainText('Ronde 1 · 0 acceptée sur 1');
  });
});
