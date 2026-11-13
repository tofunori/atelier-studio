import {test as base, expect, type Page} from '@playwright/test';
import {copyFile, mkdtemp, readFile, realpath, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {freePort, spawnGalleryServer, stopGalleryServer, waitForServer} from '../gallery_server.mts';
import {removeTempRoot} from './temp-root.ts';

// Panneau .docx : la copie corrigée de Christophe (fixture d'atelier-docx,
// au dialecte de Word) s'ouvre, se retouche au clavier et en revue, et
// chaque geste arrive dans le fichier sur le disque.
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'christophe.docx');
const NAME = 'Chapitre 2 corrigé CK.docx';
// Manuscrit court suivi d'une bibliographie Zotero de 40 entrées, toutes
// « garder avec le suivant » (chaîne plus longue qu'une feuille).
const BIBLIO = path.join(path.dirname(FIXTURE), 'bibliographie.docx');
// PNG 2×1 (en-tête et IHDR suffisent au moteur ; le navigateur l'affiche).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGO4WR5uX7EVAAsuAxTa261lAAAAAElFTkSuQmCC', 'base64');

const test = base.extend<{project: {root: string; url: string; doc: string}}>({
  project: async ({}, use) => {
    const root = await mkdtemp(path.join(tmpdir(), 'atelier-docx-'));
    await copyFile(FIXTURE, path.join(root, NAME));
    await copyFile(BIBLIO, path.join(root, 'Bibliographie.docx'));
    const port = await freePort();
    const server = spawnGalleryServer({root, port, watch: false});
    try {
      await waitForServer(port, {child: server});
      await use({root, url: `http://127.0.0.1:${port}`, doc: path.join(root, NAME)});
    } finally {
      await stopGalleryServer(server);
      await removeTempRoot(root);
    }
  },
});

type Para = {text: string; align?: string; heading?: number; segments: {text: string; media?: string; rev?: string; highlight?: string; u?: boolean}[]};
type Model = {revision: string; paragraphs: Para[]; notes: {paragraphs: Para[]}[]; headers: {paragraphs: Para[]}[]; changes: {id: number; kind: string; author: string; text: string}[]; comments: {id: number; author: string; text: string; parent?: number; done: boolean; quote: string}[]};

async function open(page: Page, project: {url: string; doc: string}) {
  await page.request.post(`${project.url}/docx/prefs`, {data: {author: 'Thierry'}});
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(project.doc)}`);
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
}

const disk = async (page: Page, project: {url: string; doc: string}): Promise<Model> =>
  (await page.request.get(`${project.url}/docx/model?path=${encodeURIComponent(project.doc)}`)).json();

/** Place le curseur juste après `after` dans le paragraphe `idx`. */
async function caretAfter(page: Page, idx: number, after: string) {
  await page.evaluate(([i, needle]) => {
    const p = document.querySelector(`.d-p[data-idx="${i}"]`)!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      const k = t.data.indexOf(needle as string);
      if (k >= 0) {
        const r = document.createRange();
        r.setStart(t, k + (needle as string).length);
        r.collapse(true);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
        return;
      }
    }
    throw new Error(`introuvable : ${needle}`);
  }, [idx, after] as const);
}

async function select(page: Page, idx: number, needle: string) {
  await page.evaluate(([i, n]) => {
    const p = document.querySelector(`.d-p[data-idx="${i}"]`)!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      const k = t.data.indexOf(n as string);
      if (k >= 0) {
        const r = document.createRange();
        r.setStart(t, k);
        r.setEnd(t, k + (n as string).length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
        return;
      }
    }
    throw new Error(`introuvable : ${n}`);
  }, [idx, needle] as const);
}

test('docx: la frappe, Entrée et le retour arrière arrivent en suivi signé dans le fichier', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  // Marge de revue : une pastille par paragraphe modifié, une fiche par commentaire.
  await expect(page.locator('#cards .it.grp')).toHaveCount(9);
  await expect(page.locator('#cards .it[data-key="c1"]')).toContainText('Pourquoi 0,6');
  await expect(page.locator('#foot')).toContainText('11 modifications');

  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.type(', fixé a priori,');
  // La frappe se voit tout de suite, puis part à la pause.
  await expect(page.locator('.d-p[data-idx="2"]')).toContainText('retenu ici, fixé a priori, offre');
  // Curseur fin, à la hauteur des lettres et posé dans le paragraphe.
  await expect(page.locator('#caret')).toHaveClass(/\bon\b/);
  const [cb, pb] = await Promise.all([page.locator('#caret').boundingBox(), page.locator('.d-p[data-idx="2"]').boundingBox()]);
  expect(cb!.width).toBeLessThanOrEqual(1.5);
  const fs = await page.locator('.d-p[data-idx="2"]').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const lh = await page.locator('.d-p[data-idx="2"]').evaluate(el => parseFloat(getComputedStyle(el).lineHeight));
  expect(cb!.height).toBeGreaterThan(fs * 0.9);
  expect(cb!.height).toBeLessThanOrEqual(fs * 1.3);
  expect(cb!.height).toBeLessThan(lh);
  expect(cb!.y).toBeGreaterThanOrEqual(pb!.y);
  expect(cb!.y + cb!.height).toBeLessThanOrEqual(pb!.y + pb!.height);
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].text).toContain('retenu ici, fixé a priori, offre');
  let m = await disk(page, project);
  const mine = m.changes.filter(c => c.author === 'Thierry');
  expect(mine.map(c => [c.kind, c.text])).toEqual([['ins', ', fixé a priori,']]);

  // Corriger sa propre frappe ne crée pas de suppression.
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].text).toContain('fixé a priori offre');
  m = await disk(page, project);
  expect(m.changes.filter(c => c.author === 'Thierry').map(c => c.kind)).toEqual(['ins']);

  // Entrée coupe le paragraphe ; le curseur passe au début du suivant.
  const n = m.paragraphs.length;
  await caretAfter(page, 2, 'priori');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await disk(page, project)).paragraphs.length).toBe(n + 1);
  await page.keyboard.type('X');
  await expect.poll(async () => (await disk(page, project)).paragraphs[3].text).toMatch(/^X offre/);
  expect(errors).toEqual([]);
});

test('docx: accepter, refuser, commenter, répondre et annuler depuis la marge', async ({page, project}) => {
  await open(page, project);
  // Remplacement de Christophe : une pastille, deux suivis acceptés d'un coup.
  const repl = page.locator('#cards .it.grp[data-ids~="101"]');
  await expect(repl).toHaveAttribute('data-ids', '101 102');
  await repl.locator('[data-act="acceptAll"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 101 || c.id === 102)).toBe(false);
  await expect(page.locator('.d-p[data-idx="1"] .del')).toHaveCount(0);

  // Annuler (⌘Z) rend les deux suivis.
  await page.locator('#paper').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await disk(page, project)).changes.filter(c => c.id === 101 || c.id === 102).length).toBe(2);

  // Refuser la mise en forme de « 0,04 » : la pastille s'ouvre sur ses lignes.
  const fmt = page.locator('#cards .it.grp[data-ids~="104"]');
  await fmt.locator('.row').click();
  await fmt.locator('.cr[data-ch="104"] [data-act="reject"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 104)).toBe(false);

  // Répondre au commentaire de Christophe puis le résoudre.
  const thread = page.locator('#cards .it[data-key="c1"]');
  await thread.locator('.cc').click();
  await expect(thread).toHaveClass(/\bon\b/);
  await expect(page.locator('#paper .cmt.on')).toHaveCount(1);
  await thread.locator('textarea').fill('Analyse ajoutée en annexe B.');
  await thread.locator('[data-act="reply"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.parent === 1 && c.text === 'Analyse ajoutée en annexe B.' && c.author === 'Thierry')).toBe(true);
  await expect(thread.locator('.rp')).toHaveCount(2);
  await thread.locator('[data-act="resolve"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.find(c => c.id === 1)?.done).toBe(true);
  await expect(page.locator('#navLbl')).toContainText('Aucun commentaire');
  // Fil résolu : son passage perd son fond, réponses comprises (elles ont leur propre ancrage).
  await expect(page.locator('#paper .cmt[data-c~="1"]').first()).toHaveClass(/\bdone\b/);
  await expect(page.locator('#paper .cmt:not(.done)')).toHaveCount(0);

  // Annoter depuis la capsule commune d'Atelier : une boîte s'ouvre sous le
  // passage, ⌘Entrée en fait un commentaire Word signé dans la marge.
  await select(page, 4, "fin d'été");
  await expect(page.locator('#selbar.atelier-selection')).toBeVisible();
  await page.locator('#selbar [aria-label="Annoter"]').click();
  const note = page.locator('.nbox.show textarea');
  await expect(note).toBeFocused();
  await expect(page.locator('.nbox .nb-src')).toContainText("fin d'été");
  await note.fill('Préciser la date.');
  await note.press('ControlOrMeta+Enter');
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.quote === "fin d'été" && c.text === 'Préciser la date.' && c.author === 'Thierry')).toBe(true);
  await expect(page.locator('.nbox.show')).toHaveCount(0);

  // La bulle d'une modification dans la page accepte sur place.
  await page.locator('#paper .ins[data-ch="120"]').click();
  await expect(page.locator('#bub')).toContainText('Christophe');
  await page.locator('#bub [data-act="accept"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 120)).toBe(false);
});

test("docx: sa réponse se modifie d'un clic, celle de Christophe jamais, et la rangée tient dans une fiche de 240 px", async ({page, project}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.addInitScript(() => { try { localStorage.setItem('docxLaneW', '240'); } catch { /* sans stockage */ } });
  await open(page, project);
  const thread = page.locator('#cards .it[data-key="c1"]');
  await thread.locator('.cc').click();
  await expect(thread).toHaveClass(/\bon\b/);
  await thread.locator('textarea').fill('Oui, c\'est ça…');
  await thread.locator('[data-act="reply"]').click();
  await expect(thread.locator('.rp')).toHaveCount(2);

  // À 240 px, toute la rangée d'actions reste dans la fiche.
  const inside = await thread.evaluate((el) => {
    const card = el.querySelector('.cc')!.getBoundingClientRect();
    return Array.from(el.querySelectorAll('.ac > *')).every((b) => { const r = b.getBoundingClientRect(); return r.left >= card.left && r.right <= card.right; });
  });
  expect(inside).toBe(true);
  await expect(thread.locator('[data-act="resolve"]')).toHaveAttribute('aria-label', 'Résoudre');

  // Seuls ses propres messages s'ouvrent : celui de Christophe, jamais.
  await expect(thread.locator('.cc > .tx')).not.toHaveClass(/mine/);
  await expect(thread.locator('.tx.mine')).toHaveCount(2);
  const mine = thread.locator('.tx.mine').last();
  await expect(mine).toHaveText('Oui, c\'est ça…');
  await mine.click();
  const edit = thread.locator('textarea.c-edit');
  await expect(edit).toBeFocused();
  await expect(edit).toHaveValue('Oui, c\'est ça…');
  await edit.press('Escape');
  await expect(edit).toHaveCount(0);
  await expect(thread.locator('textarea')).toBeVisible();

  await mine.click();
  await thread.locator('textarea.c-edit').fill('Oui, c\'est ça… clair dans les 3 zones.');
  await thread.locator('textarea.c-edit').press('ControlOrMeta+Enter');
  const replies = async () => (await disk(page, project)).comments.filter(c => c.parent === 1 && c.author === 'Thierry').map(c => c.text.trim()).sort();
  await expect.poll(replies).toEqual(['D\'accord, je l\'ajoute en annexe.', 'Oui, c\'est ça… clair dans les 3 zones.']);
  await expect(thread.locator('.tx.mine').last()).toHaveText('Oui, c\'est ça… clair dans les 3 zones.');
  const christophe = (await disk(page, project)).comments.find(c => c.id === 1)!;
  expect(christophe.author).not.toBe('Thierry');
  expect(christophe.text).toContain('Pourquoi 0,6');

  // ⌘Z rend le texte d'avant.
  await page.locator('#paper').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(replies).toEqual(['D\'accord, je l\'ajoute en annexe.', 'Oui, c\'est ça…']);
});

test('docx: rechercher et remplacer partout, en suivi signé', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  await page.locator('#paper').focus();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('#fQ')).toBeFocused();
  await page.keyboard.type('GLACE');
  // Insensible à la casse ; le compteur suit le résultat courant.
  await expect(page.locator('#fN')).toHaveText(/^1 sur \d+$/);
  const total = Number((await page.locator('#fN').textContent())!.split(' sur ')[1]);
  expect(total).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#fN')).toHaveText(total > 1 ? `2 sur ${total}` : `1 sur ${total}`);
  await page.locator('#fMore').click();
  await expect(page.locator('#fRow2')).toBeVisible();
  await page.locator('#fR').fill('neige');
  await page.locator('#fAll').click();
  await expect(page.locator('#toast')).toContainText('en suivi');
  await expect.poll(async () => (await disk(page, project)).changes.filter(c => c.author === 'Thierry' && c.kind === 'ins' && c.text === 'neige').length).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#find')).not.toHaveClass(/\bshow\b/);
  expect(errors).toEqual([]);
});

test("docx: un brouillon de commentaire suit son passage quand le fichier change, et garde sa saisie", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  await select(page, 2, 'compromis');
  // Le bouton Commenter de la barre ouvre un brouillon dans la marge.
  await page.locator('#btnComment').click();
  const draft = page.locator('#cards .it[data-key="draft"] textarea');
  await draft.fill('Trop vague');
  // L'agent écrit plus haut dans le même paragraphe pendant qu'on rédige.
  const m = await disk(page, project);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Claude', op: {op: 'replace', find: 'retenu ici', with: 'retenu ici, fixé a priori,'}}});
  expect(r.ok()).toBe(true);
  await expect(page.locator('.d-p[data-idx="2"]')).toContainText('fixé a priori', {timeout: 6000});
  // La saisie et le focus survivent au redessin de la marge.
  await expect(draft).toBeFocused();
  await page.keyboard.type(' ici.');
  await expect(draft).toHaveValue('Trop vague ici.');
  await draft.press('ControlOrMeta+Enter');
  await expect.poll(async () => (await disk(page, project)).comments.find(c => c.text === 'Trop vague ici.')?.quote).toBe('compromis');
  expect(errors).toEqual([]);
});

test('docx: remplacer avance au passage suivant, écrit en suivi dans les ajouts des autres et un double-clic ne décide qu\'une fois', async ({page, project}) => {
  await open(page, project);
  await page.locator('#paper').focus();
  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.type('pixels');
  await expect(page.locator('#fN')).toHaveText(/^1 sur \d+$/);
  await page.locator('#fMore').click();
  await page.locator('#fR').fill('pixels purs');
  // Le remplacement contient le terme : deux clics remplacent deux passages différents.
  await page.locator('#fOne').click();
  await expect.poll(async () => (await disk(page, project)).paragraphs.map(p => p.text).join(' ')).toContain('pixels purs');
  await page.locator('#fOne').click();
  await expect.poll(async () => ((await disk(page, project)).paragraphs.map(p => p.text).join(' ').match(/pixels purs/g) || []).length).toBe(2);
  expect((await disk(page, project)).paragraphs.map(p => p.text).join(' ')).not.toContain('purs purs');
  await page.keyboard.press('Escape');

  // « Sentinel-2 » est un ajout de Christophe : comme Word, Tout remplacer y
  // efface et y écrit en suivi signé Thierry, sans lui retirer son ajout.
  await page.keyboard.press('ControlOrMeta+f');
  await page.locator('#fQ').fill('Sentinel');
  await expect(page.locator('#fN')).toHaveText(/sur/);
  if (!(await page.locator('#fRow2').isVisible())) await page.locator('#fMore').click();
  await page.locator('#fR').fill('S2');
  await page.locator('#fAll').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.author === 'Thierry' && c.kind === 'ins' && c.text.includes('S2'))).toBe(true);
  const after = await disk(page, project);
  expect(after.changes.some(c => c.id === 120 && c.author === 'Christophe')).toBe(true);
  expect(after.changes.some(c => c.author === 'Thierry' && c.kind === 'del' && c.text.includes('Sentinel'))).toBe(true);
  await page.keyboard.press('Escape');

  // Double-clic sur ✓ d'une ligne : une seule décision, pas d'erreur.
  const fmt = page.locator('#cards .it.grp[data-ids~="104"]');
  await fmt.locator('.row').click();
  await fmt.locator('.cr[data-ch="104"] [data-act="accept"]').dblclick();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 104)).toBe(false);
  await page.waitForTimeout(300);
  await expect(page.locator('#toast')).not.toContainText('introuvable');
});

test("docx: une note sur un passage part dans la boîte du chat, le passage garde son pointillé et son numéro jusqu'à l'envoi", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  await page.evaluate(() => {
    const w = window as unknown as {__atelierPost: () => void; __sent?: Record<string, unknown>[]; AtelierStudioCore?: Record<string, unknown>};
    w.__atelierPost = () => {};
    w.__sent = [];
    w.AtelierStudioCore = {...(w.AtelierStudioCore || {}), requestChatAttachment: (o: {payload: Record<string, unknown>}) => { w.__sent!.push(o.payload); return Promise.resolve(); }};
  });
  const before = (await disk(page, project)).comments.length;
  // Ajouter au chat ouvre la même boîte ; Entrée envoie au chat.
  await select(page, 2, 'compromis');
  await page.locator('#selbar [aria-label="Ajouter au chat"]').click();
  const note = page.locator('.nbox.show textarea');
  await expect(note).toBeFocused();
  await note.fill('Trop vague, lequel ?');
  await note.press('Enter');
  await expect(page.locator('.nbox.show')).toHaveCount(0);
  // Une deuxième, sans note.
  await select(page, 4, "fin d'été");
  await page.locator('#selbar [aria-label="Annoter"]').click();
  await page.locator('.nbox.show [data-act="chat"]').click();
  const sent = await page.evaluate(() => (window as unknown as {__sent: {text: string; path: string; type: string}[]}).__sent);
  expect(sent).toHaveLength(2);
  expect(sent[0].type).toBe('atelier-add-to-chat');
  expect(sent[0].path).toBe(project.doc);
  expect(sent[0].text).toMatch(/\(p\d+\) : « compromis »\nCommentaire : Trop vague, lequel \?$/);
  expect(sent[1].text).toMatch(/« fin d'été »\nCommentaire : \(voir passage\)$/);
  // Rien n'est écrit dans le document.
  expect((await disk(page, project)).comments.length).toBe(before);
  // Les deux passages sont numérotés dans la page, dans l'ordre de la boîte.
  await expect(page.locator('#chatnums i')).toHaveText(['1', '2']);
  // La boîte du chat dit ce qui y attend encore : envoyé, retiré.
  await page.evaluate((texts) => window.postMessage({type: 'atelier-chat-pending', texts}, '*'), [sent[1].text, sent[0].text]);
  await expect(page.locator('#chatnums i')).toHaveText(['1', '2']);
  const pos = await page.locator('#chatnums i').evaluateAll(els => els.map(e => (e as HTMLElement).style.transform));
  expect(pos[0]).not.toBe(pos[1]);
  await page.evaluate((texts) => window.postMessage({type: 'atelier-chat-pending', texts}, '*'), [sent[0].text]);
  await expect(page.locator('#chatnums i')).toHaveCount(1);
  await page.evaluate(() => window.postMessage({type: 'atelier-chat-pending', texts: []}, '*'));
  await expect(page.locator('#chatnums i')).toHaveCount(0);
  // Échap referme la boîte sans rien envoyer.
  await select(page, 2, 'compromis');
  await page.locator('#selbar [aria-label="Annoter"]').click();
  await page.locator('.nbox.show textarea').press('Escape');
  await expect(page.locator('.nbox.show')).toHaveCount(0);
  expect((await page.evaluate(() => (window as unknown as {__sent: unknown[]}).__sent)).length).toBe(2);
  expect(errors).toEqual([]);
});

test('docx: panneau étroit, la fiche s\'ouvre en fenêtre sous son passage et la page garde sa taille', async ({page, project}) => {
  await page.setViewportSize({width: 820, height: 900});
  await open(page, project);
  await expect(page.locator('body')).toHaveClass(/no-lane/);
  await expect(page.locator('#cards')).toBeHidden();
  await page.locator('#paper .cmt').first().click();
  const card = page.locator('#cards .it.on');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Pourquoi 0,6');
  const [c, q] = await Promise.all([card.boundingBox(), page.locator('#paper .cmt').first().boundingBox()]);
  expect(Math.abs(c!.y - (q!.y + q!.height)) < 40 || c!.y + c!.height < q!.y).toBe(true);
  await card.locator('textarea').fill('Vu.');
  await card.locator('[data-act="reply"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.some(x => x.parent === 1 && x.text === 'Vu.')).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cards')).toBeHidden();
});

test('docx: la capsule surligne et souligne en suivi', async ({page, project}) => {
  await open(page, project);
  await select(page, 2, 'compromis');
  await page.locator('#selbar [aria-label="Choisir la couleur du surlignage"]').click();
  await page.locator('#selbar [aria-label="Surligner en vert"]').click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].segments.find(s => s.text === 'compromis')?.highlight).toBe('green');
  await expect(page.locator('.d-p[data-idx="2"] span', {hasText: /^compromis$/})).toHaveCSS('background-color', 'rgba(120, 220, 140, 0.4)');
  await select(page, 2, 'compromis');
  await page.locator('#selbar [aria-label="Souligner"]').click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].segments.find(s => s.text === 'compromis')?.u).toBe(true);
  // Même teinte une seconde fois : le surlignage part.
  await select(page, 2, 'compromis');
  await page.locator('#selbar [aria-label="Surligner"]').click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].segments.find(s => s.text === 'compromis')?.highlight ?? null).toBe(null);
  const m = await disk(page, project);
  expect(m.changes.some(c => c.author === 'Thierry' && c.kind === 'format')).toBe(true);
});

test('docx: barre de mise en forme, vues et page blanche', async ({page, project}) => {
  await open(page, project);
  await select(page, 2, 'compromis');
  await page.locator('[data-run="b"]').click();
  // Le gras se voit tout de suite, puis arrive dans le fichier en suivi.
  await expect(page.locator('.d-p[data-idx="2"] b', {hasText: 'compromis'})).toHaveCount(1);
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.author === 'Thierry' && c.kind === 'format')).toBe(true);
  let m = await disk(page, project);

  await caretAfter(page, 2, 'pureté');
  await page.locator('#btnAlign').click();
  await page.locator('.menu.show .mi', {hasText: 'Justifier'}).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].align).toBe('both');
  await expect(page.locator('.d-p[data-idx="2"]')).toHaveClass(/a-both/);

  await caretAfter(page, 2, 'pureté');
  await page.locator('#ddStyle').click();
  await page.locator('.menu .mi', {hasText: 'Titre 2'}).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].heading).toBe(2);

  // Lecture : les suppressions disparaissent ; Original : lecture seule.
  const view = async (label: string) => { await page.locator('#revMenu').click(); await page.locator('.menu.show .mi', {hasText: label}).click(); };
  await page.locator('#vRead').click();
  await expect(page.locator('#vRead')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.d-p[data-idx="1"] .del').first()).toBeHidden();
  // Le texte nu : ni trait dans la marge, ni passage commenté peint ; les fiches restent.
  await expect(page.locator('#cbars')).toHaveCount(0);
  const cmt = page.locator('.cmt:not(.on):not(.done)').first();
  await expect(cmt).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('#cards .it').first()).toBeAttached();
  await view('Original');
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'false');
  await page.locator('#vReview').click();
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'true');

  // Page Thème, gardée côté serveur.
  await view("Thème de l'app");
  await expect(page.locator('body')).not.toHaveClass(/blanche/);
  await expect.poll(async () => (await (await page.request.get(`${project.url}/docx/prefs`)).json()).page).toBe('theme');

  // Sans suivi, la frappe s'écrit directement.
  await page.locator('#btnTrack').click();
  await expect(page.locator('#btnTrack')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#toast')).toContainText('Suivi désactivé');
  m = await disk(page, project);
  const before = m.changes.length;
  await caretAfter(page, 13, 'exposant');
  await page.keyboard.type('s');
  await expect.poll(async () => (await disk(page, project)).paragraphs[13].text).toContain('exposants');
  expect((await disk(page, project)).changes.length).toBe(before);
});

test("docx: une retouche de l'agent apparaît sans recharger", async ({page, project}) => {
  await open(page, project);
  const m = await disk(page, project);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Claude', op: {op: 'replace', find: 'compromis', with: 'équilibre'}}});
  expect(r.ok()).toBe(true);
  await expect(page.locator('.d-p[data-idx="2"] .ins', {hasText: 'équilibre'})).toBeVisible({timeout: 6000});
  const agent = (await disk(page, project)).changes.filter(c => c.author === 'Claude').map(c => c.id);
  expect(agent.length).toBeGreaterThan(0);
  await expect(page.locator(`#cards .it.grp[data-ids~="${agent[0]}"]`)).toBeVisible();
  await expect(page.locator('#foot')).toContainText('de Claude en attente');
});

/** Fichier des brouillons de réponse de l'agent (atelier_docx::drafts) :
 *  dossier temporaire, nommé d'après le chemin canonique du document. */
async function draftsFile(doc: string): Promise<string> {
  const canon = await realpath(doc);
  return path.join(tmpdir(), `atelier-docx-${createHash('sha256').update(canon).digest('hex').slice(0, 16)}.drafts.json`);
}

test("docx: Proposer demande au chat un brouillon de réponse, que l'on relit et envoie sous son nom", async ({page, project}) => {
  await open(page, project);
  // Le chat d'Atelier, simulé : on garde ce que le panneau lui envoie.
  await page.evaluate(() => {
    const w = window as unknown as {__atelierPost: () => void; __sent?: Record<string, unknown>; AtelierStudioCore?: Record<string, unknown>};
    w.__atelierPost = () => {};
    // Le noyau d'Atelier est gelé : on le remplace par une copie.
    w.AtelierStudioCore = {...(w.AtelierStudioCore || {}), requestChatAttachment: (o: {payload: Record<string, unknown>}) => { w.__sent = o.payload; return Promise.resolve(); }};
  });
  const thread = page.locator('#cards .it[data-key="c1"]');
  await thread.locator('.cc').click();
  // Champ vide : le robot seul ; du texte : la flèche d'envoi apparaît, le robot reste.
  await expect(thread.locator('[data-act="reply"]')).toBeHidden();
  await thread.locator('textarea').fill('réponds que le seuil vient de la littérature');
  await expect(thread.locator('[data-act="reply"]')).toBeVisible();
  await expect(thread.locator('[data-act="propose"]')).toBeVisible();
  // Le texte tapé part comme consigne, puis s'efface.
  await thread.locator('[data-act="propose"]').click();
  await expect(thread.locator('.c-wait')).toBeVisible();
  await expect(thread.locator('[data-act="reply"]')).toHaveCount(0);
  const sent = await page.evaluate(() => (window as unknown as {__sent: {text: string; direct: boolean; path: string}}).__sent);
  expect(sent.text).toContain('Ma consigne pour cette réponse : « réponds que le seuil vient de la littérature »');
  expect(sent.direct).toBe(true);
  expect(sent.path).toBe(project.doc);
  expect(sent.text).toContain('draft_reply (comment=1)');
  expect(sent.text).toContain('Pourquoi 0,6');

  // L'agent corrige aussi la phrase, en suivi signé (un retrait + un ajout)…
  const m0 = await disk(page, project);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m0.revision, author: 'Claude', op: {op: 'replace', paragraph: 'p2', find: 'compromis', with: 'équilibre'}}});
  expect(r.ok()).toBe(true);
  // … et pose son brouillon hors du document (ce que fait atelier_docx draft_reply).
  const before = (await disk(page, project)).revision;
  const file = await draftsFile(project.doc);
  await writeFile(file, JSON.stringify({1: {text: "Bonne remarque, j'ajoute l'analyse en annexe B.", author: 'Claude', at: Date.now()}}));
  const field = thread.locator('textarea');
  await expect(field).toHaveValue("Bonne remarque, j'ajoute l'analyse en annexe B.", {timeout: 6000});
  await expect(thread.locator('.c-by')).toContainText('Brouillon de Claude, à relire');
  await expect(thread.locator('.c-wait')).toHaveCount(0);
  expect((await disk(page, project)).revision).toBe(before);
  await expect(thread.locator('.c-fix')).toContainText('1 correction en suivi');

  // Relu et retouché, il part signé Thierry ; le brouillon disparaît.
  await field.fill("Bonne remarque, j'ajoute l'analyse en annexe B. Merci !");
  await thread.locator('[data-act="reply"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.parent === 1 && c.author === 'Thierry' && c.text.endsWith('annexe B. Merci !'))).toBe(true);
  expect((await disk(page, project)).comments.some(c => c.author === 'Claude')).toBe(false);
  await expect.poll(() => existsSync(file)).toBe(false);
  await expect(thread.locator('.c-by')).toHaveCount(0);
  await expect(thread.locator('[data-act="propose"]')).toBeVisible();
});

test('docx: notes, en-tête, pied de page et figures se retouchent dans la page', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await writeFile(path.join(project.root, 'albedo.png'), PNG);
  await open(page, project);
  // En-tête, pied de page, note de Christophe et sa révision.
  await expect(page.locator('.d-hdr')).toContainText('Albédo des glaciers tropicaux');
  await expect(page.locator('.d-ftr')).toContainText('Page');
  await expect(page.locator('.d-note')).toContainText('Seuil appliqué');
  await page.locator('#cards .it.grp[data-ids~="120"] [data-act="acceptAll"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 120)).toBe(false);
  // La figure du document s'affiche.
  const img = page.locator('.chip.fig img').first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // Insérer une note après « MODIS » : le curseur passe dans la note.
  await caretAfter(page, 1, 'pixel MODIS');
  await page.locator('#btnInsert').click();
  await page.locator('.menu.show .mi', {hasText: 'Note de bas de page'}).click();
  await expect.poll(async () => (await disk(page, project)).notes.length).toBe(2);
  await page.keyboard.type('MOD10A1 v6.1.');
  await expect.poll(async () => (await disk(page, project)).notes[0].paragraphs[0].text).toBe(' MOD10A1 v6.1.');
  await expect(page.locator('.d-note').first()).toContainText('MOD10A1');

  // Écrire dans l'en-tête, en suivi.
  await page.evaluate(() => {
    const t = document.querySelector('.d-hdr .d-p span')!.firstChild!;
    const r = document.createRange();
    r.setStart(t, 0);
    r.collapse(true);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.keyboard.type('Thèse – ');
  await expect.poll(async () => (await disk(page, project)).headers[0].paragraphs[0].text).toMatch(/^Thèse – Chapitre 2/);

  // Insérer une figure du projet, puis l'effacer d'un retour arrière.
  await caretAfter(page, 2, 'glaciaire.');
  await page.locator('#btnInsert').click();
  await page.locator('.menu.show .mi', {hasText: 'Figure du projet'}).click();
  await page.locator('.menu.show .mi', {hasText: 'albedo.png'}).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].segments.filter(s => s.media).length).toBe(1);
  await expect(page.locator('.d-p[data-idx="2"] .chip.fig img')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].segments.filter(s => s.media && s.rev !== 'del').length).toBe(0);
  expect(errors).toEqual([]);
});

test('docx: lignes et colonnes de tableau depuis la barre', async ({page, project}) => {
  await open(page, project);
  const cells = async () => (await disk(page, project)).paragraphs.filter(p => (p as {cell?: number[]}).cell).length;
  await caretAfter(page, 6, 'Zone');
  await page.locator('#btnInsert').click();
  await page.locator('.menu.show .mi', {hasText: 'Insérer une ligne en dessous'}).click();
  await expect.poll(cells).toBe(6);
  // Le curseur est dans la nouvelle ligne : on y écrit, en suivi.
  await page.keyboard.type('Z4');
  await expect.poll(async () => (await disk(page, project)).paragraphs[8].text).toBe('Z4');
  const m = await disk(page, project);
  expect(m.changes.some(c => c.kind === 'row-ins' && c.author === 'Thierry')).toBe(true);
  const row = m.changes.find(c => c.kind === 'row-ins' && c.author === 'Thierry')!;
  await expect(page.locator(`#cards .it.grp[data-ids~="${row.id}"]`)).toHaveCount(1);

  await caretAfter(page, 8, 'Z4');
  await page.locator('#btnInsert').click();
  await page.locator('.menu.show .mi', {hasText: 'Insérer une colonne à droite'}).click();
  await expect.poll(cells).toBe(9);
  await expect(page.locator('#toast')).toContainText('Word ne suit pas les colonnes');
  await page.locator('#btnInsert').click();
  await page.locator('.menu.show .mi', {hasText: 'Supprimer la colonne'}).click();
  await expect.poll(cells).toBe(6);
});

test('docx: la page suit les styles de Word, ses marges et ses numéros de ligne', async ({page, project}) => {
  await open(page, project);
  const title = page.locator('.d-p[data-idx="0"]');
  await expect(title).toHaveCSS('font-weight', '700');
  // Légende : italique et centrée par son style.
  const caption = page.locator('.d-p', {hasText: 'Figure 2.4 – Fraction'});
  await expect(caption).toHaveCSS('font-style', 'italic');
  await expect(caption).toHaveCSS('text-align', 'center');
  // Numéros continus dans la marge de gauche, à gauche du texte.
  await expect(page.locator('#lnums span').first()).toHaveText('1');
  const [num, text] = await Promise.all([page.locator('#lnums span').first().boundingBox(), title.boundingBox()]);
  expect(num!.x + num!.width).toBeLessThan(text!.x);
  // La page suit la largeur du panneau, proportions gardées (Lettre US).
  const wide = (await page.locator('#paper').boundingBox())!;
  await page.setViewportSize({width: 700, height: 900});
  await expect.poll(async () => (await page.locator('#paper').boundingBox())!.width).toBeLessThan(wide.width);
  const narrow = (await page.locator('#paper').boundingBox())!;
  expect(narrow.x).toBeGreaterThanOrEqual(0);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(700);
});

test('docx: le texte se coupe en pages comme dans Word, numéros de ligne repris à chaque page', async ({page, project}) => {
  // Le panneau défile pendant qu'on insère les intervalles (ancrage du
  // défilement de WebKit) : la coupe doit rester la même.
  await page.addInitScript(() => {
    const drift = (n: any) => { if (n && n.classList && n.classList.contains('d-gap')) { const sc = document.getElementById('scroll'); if (sc) sc.scrollTop += 37; } };
    const ib = Node.prototype.insertBefore; Node.prototype.insertBefore = function (n: any, r: any) { const x = ib.call(this, n, r); drift(n); return x; } as any;
    const bf = Element.prototype.before; Element.prototype.before = function (...a: any[]) { bf.apply(this, a); drift(a[0]); };
  });
  await open(page, project);
  const m = await disk(page, project);
  const long = 'Les glaciers tropicaux perdent leur masse plus vite que la moyenne mondiale, et leur albédo baisse à chaque saison sèche. ';
  const ops = Array.from({length: 10}, (_, k) => ({op: "insert_paragraph", after: "p2", text: `${k + 1}. ${long.repeat(6)}`}));
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Thierry', tracked: false, op: {op: 'batch', ops}}});
  expect(r.ok()).toBe(true);
  await expect.poll(async () => page.locator('#sheets .sheet').count(), {timeout: 6000}).toBeGreaterThanOrEqual(2);
  const sheets = await page.locator('#sheets .sheet').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({top: r.top, bottom: r.bottom})));
  // L'en-tête et le pied de page se répètent sur la deuxième feuille.
  await expect(page.locator('#sheets .sheet').nth(1).locator('.d-hdr')).toContainText('Albédo des glaciers tropicaux');
  await expect(page.locator('#sheets .sheet').nth(1).locator('.d-ftr')).toContainText('Page');
  // Chaque numéro de ligne tombe dans une feuille, et la numérotation repart à 1 sur la deuxième.
  const nums = await page.locator('#lnums span').evaluateAll(els => els.map(e => ({n: e.textContent, top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom})));
  for (const n of nums) expect(sheets.some(s => n.top >= s.top && n.bottom <= s.bottom)).toBe(true);
  const second = nums.find(n => n.top >= sheets[1].top);
  expect(second?.n).toBe('1');
  // On écrit juste après la coupure d'un paragraphe à cheval sur deux feuilles.
  const cut = await page.evaluate(() => {
    const gap = document.querySelector('#paper span.d-gap')!;
    const p = gap.closest('.d-p') as HTMLElement;
    const t = gap.nextSibling as Text;
    const r = document.createRange();
    r.setStart(t, 0);
    r.collapse(true);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
    return {idx: Number(p.dataset.idx), next: t.data.slice(0, 12)};
  });
  await page.keyboard.type('§');
  await expect.poll(async () => (await disk(page, project)).paragraphs[cut.idx].text).toContain(`§${cut.next}`);
  expect((await disk(page, project)).paragraphs.length).toBe(m.paragraphs.length + 10);
  // La frappe ne recoupe qu'à partir de sa feuille : le résultat doit être
  // celui d'une mise en page complète (rechargement).
  const late = (await disk(page, project)).paragraphs.findIndex(p => p.text.startsWith('1. '));
  expect(await page.evaluate(i => document.querySelector(`.d-p[data-idx="${i}"]`)!.getBoundingClientRect().top - document.querySelectorAll('#sheets .sheet')[2].getBoundingClientRect().top, late)).toBeGreaterThan(0);
  await caretAfter(page, late, '1. Les glaciers');
  await page.keyboard.type(' — une incise assez longue pour ajouter une ligne au paragraphe et décaler toute la suite du document', {delay: 5});
  await expect.poll(async () => (await disk(page, project)).paragraphs[late].text).toContain('toute la suite du document');
  const layout = () => page.evaluate(() => Array.from(document.querySelectorAll('#lnums span')).map(e => `${e.textContent}@${Math.round((e as HTMLElement).offsetTop)}`).join(' '));
  await page.waitForTimeout(300);
  const typed = await layout();
  await page.reload();
  await expect(page.locator('#sheets .sheet').nth(1)).toBeAttached();
  await page.waitForTimeout(300);
  expect(await layout()).toBe(typed);
});

test('docx: feuilles et numéros de ligne suivent la page quand le panneau change de taille ou revient', async ({page, project}) => {
  await page.setViewportSize({width: 1400, height: 900});
  await open(page, project);
  await expect(page.locator('#lnums span').first()).toHaveText('1');
  // Zoom fixé : la largeur de la page ne bouge plus, seule sa position change.
  await page.locator('#foot [data-z="out"]').click();
  const aligned = () => page.evaluate(() => {
    const paper = document.getElementById('paper')!.getBoundingClientRect();
    const sheet = document.querySelector('#sheets .sheet')!.getBoundingClientRect();
    const num = document.querySelector('#lnums span')!.getBoundingClientRect();
    const text = document.querySelector('.d-p[data-idx="0"]')!.getBoundingClientRect();
    return {dx: Math.abs(sheet.left - paper.left), dw: Math.abs(sheet.width - paper.width), numIn: num.left >= sheet.left && num.right < text.left};
  });
  const ok = {dx: expect.any(Number), dw: expect.any(Number), numIn: true};
  const check = async () => {
    await expect.poll(async () => { const a = await aligned(); return a.dx < 1 && a.dw < 1 && a.numIn; }).toBe(true);
    expect(await aligned()).toEqual(ok);
  };
  await check();
  // Panneau rétréci puis élargi (surface partagée avec le chat, puis seule).
  await page.setViewportSize({width: 900, height: 900});
  await check();
  await page.setViewportSize({width: 1600, height: 900});
  await check();
  // Surface masquée pendant une mise en page (autre onglet), puis ré-affichée.
  await page.evaluate(() => { document.getElementById('scroll')!.style.display = 'none'; });
  await page.locator('#foot [data-z="in"]').click();
  await page.setViewportSize({width: 1100, height: 900});
  await page.evaluate(() => { document.getElementById('scroll')!.style.display = ''; });
  await check();
  await expect.poll(() => page.locator('#sheets .sheet').count()).toBeGreaterThanOrEqual(1);
});

test('docx: pendant que le panneau change de taille, la page s\'étire sans se recouper, puis se recoupe une fois à la même place', async ({page, project}) => {
  await page.setViewportSize({width: 1400, height: 900});
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(path.join(project.root, 'Bibliographie.docx'))}`);
  await expect(page.locator('#sheets .sheet').nth(1)).toBeAttached();
  await page.waitForTimeout(300);
  const state = () => page.evaluate(() => {
    const sc = document.getElementById('scroll')!;
    const top = sc.getBoundingClientRect().top;
    const p = Array.from(document.querySelectorAll<HTMLElement>('#paper .d-p')).find((b) => b.getBoundingClientRect().bottom > top)!;
    const paper = document.getElementById('paper')!;
    const sheet = document.querySelector('#sheets .sheet')!.getBoundingClientRect();
    const pr = paper.getBoundingClientRect();
    return {
      pt: getComputedStyle(document.documentElement).getPropertyValue('--pt').trim(),
      stretching: document.body.classList.contains('stretching'),
      transform: paper.style.transform,
      gaps: document.querySelectorAll('#paper .d-gap').length,
      top: p.textContent!.slice(0, 40),
      y: p.getBoundingClientRect().top - top,
      aligned: Math.abs(sheet.left - pr.left) < 1 && Math.abs(sheet.width - pr.width) < 1,
    };
  });
  await page.evaluate(() => { const sc = document.getElementById('scroll')!; sc.scrollTop = sc.scrollHeight / 2; });
  await page.waitForTimeout(100);
  const before = await state();
  // L'app signale qu'on tire un séparateur ; plusieurs largeurs de suite.
  const drag = (on: boolean) => page.evaluate((v) => postMessage({type: 'atelier-pane-resize', on: v}, '*'), on);
  await drag(true);
  for (const width of [1300, 1180, 1060, 960]) await page.setViewportSize({width, height: 900});
  const during = await state();
  expect(during.stretching).toBe(true);
  expect(during.transform).toContain('scale(');
  expect(during.pt).toBe(before.pt);
  // Lâcher : une seule vraie mise à l'échelle, le passage lu reste en haut.
  await drag(false);
  await expect.poll(async () => (await state()).stretching).toBe(false);
  await expect.poll(async () => (await state()).aligned).toBe(true);
  const after = await state();
  expect(after.transform).toBe('');
  expect(after.pt).not.toBe(before.pt);
  expect(after.top).toBe(before.top);
  expect(Math.abs(after.y - before.y)).toBeLessThan(6);
  // Un changement de taille isolé (sans séparateur tiré) se met en page tout de suite.
  await page.waitForTimeout(300);
  await page.setViewportSize({width: 1200, height: 900});
  await expect.poll(async () => (await state()).pt).not.toBe(after.pt);
  expect((await state()).stretching).toBe(false);
});

test('docx: la marge des commentaires se resserre à la poignée, la page en profite et la largeur tient au rechargement', async ({page, project}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await open(page, project);
  await expect(page.locator('#cards .it').first()).toBeVisible();
  const state = () => page.evaluate(() => ({
    cards: document.getElementById('cards')!.offsetWidth,
    paper: document.getElementById('paper')!.offsetWidth,
    stored: localStorage.getItem('docxLaneW'),
  }));
  const before = await state();
  expect(before.cards).toBe(312);
  const grip = (await page.locator('#laneGrip').boundingBox())!;
  const x = grip.x + grip.width / 2, y = grip.y + 200;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 10, y);
  await page.mouse.up();
  await expect.poll(async () => (await state()).cards).toBe(252);
  await expect.poll(async () => (await state()).paper).toBeGreaterThan(before.paper);
  expect((await state()).stored).toBe('252');
  // La poignée suit le bord des fiches.
  const moved = (await page.locator('#laneGrip').boundingBox())!;
  expect(moved.x).toBeCloseTo(grip.x + 60, 0);
  await page.reload();
  await expect(page.locator('#cards .it').first()).toBeVisible();
  expect((await state()).cards).toBe(252);
  // Double-clic : largeur d'origine.
  await page.locator('#laneGrip').dblclick();
  await expect.poll(async () => (await state()).cards).toBe(312);
});

test('docx: une bibliographie Zotero passe à la ligne et se coupe en feuilles pleines', async ({page, project}) => {
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(path.join(project.root, 'Bibliographie.docx'))}`);
  await expect(page.locator('#sheets .sheet').nth(1)).toBeAttached();
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const paper = document.getElementById('paper')!;
    const cs = getComputedStyle(paper);
    const mt = parseFloat(cs.paddingTop), mb = parseFloat(cs.paddingBottom);
    const areas = Array.from(document.querySelectorAll('#sheets .sheet')).map(s => s.getBoundingClientRect()).map(b => [b.top + mt, b.bottom - mb]);
    // Chaque ligne affichée tombe dans la zone de texte d'une feuille.
    const out: string[] = [];
    const range = document.createRange();
    for (const el of Array.from(paper.querySelectorAll(':scope > .d-p'))) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        range.selectNodeContents(t);
        for (const q of Array.from(range.getClientRects())) if (q.height && !areas.some(([a, z]) => q.top >= a - 1 && q.bottom <= z + 1)) out.push((t as Text).data.slice(0, 30));
      }
    }
    const entry = Array.from(paper.querySelectorAll('.d-p')).find(p => p.textContent!.startsWith('Pavlovic')) as HTMLElement;
    return {sheets: areas.length, out, wraps: entry.offsetHeight / parseFloat(getComputedStyle(entry).lineHeight), italic: !!entry.querySelector('i'), wide: entry.scrollWidth <= entry.clientWidth + 1};
  });
  expect(r.out).toEqual([]);
  // Les entrées passent à la ligne (titre de revue en italique) au lieu de déborder.
  expect(r.wraps).toBeGreaterThan(2);
  expect(r.italic).toBe(true);
  expect(r.wide).toBe(true);
  // La chaîne, plus longue qu'une feuille, se coupe comme du texte courant :
  // pas une feuille par entrée.
  expect(r.sheets).toBeLessThanOrEqual(10);
  // Le pied de page porte le numéro de chaque feuille.
  await expect(page.locator('#sheets .sheet').nth(1).locator('.d-ftr')).toHaveText('2');
});

test('docx: zoom au curseur et aux touches, retour à la largeur du panneau', async ({page, project}) => {
  await open(page, project);
  const pt = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pt')));
  const label = page.locator('#foot .z-pct');
  await expect(label).toHaveText(/\d+ %/);
  await page.locator('#foot [data-z="in"]').click();
  const before = Number((await label.textContent())!.replace(/\D/g, ''));
  await page.locator('#foot [data-z="in"]').click();
  await expect(label).toHaveText(`${before + 10} %`);
  expect(await pt()).toBeCloseTo((4 / 3) * (before + 10) / 100, 3);
  await page.keyboard.press('ControlOrMeta+Minus');
  await expect(label).toHaveText(`${before} %`);
  // Le pourcentage remet la page à la largeur du panneau.
  await label.click();
  await expect(label).toHaveClass(/on/);
});

test('docx: au zoom, seule la page change de taille, la marge de revue reste en place', async ({page, project}) => {
  await page.setViewportSize({width: 1400, height: 900});
  await open(page, project);
  const cards = page.locator('#cards');
  await expect(cards).toBeVisible();
  const box = async () => (await cards.boundingBox())!;
  const pageWidth = () => page.locator('#paper').evaluate((el) => el.getBoundingClientRect().width);
  await page.locator('#foot .z-pct').click();
  await page.locator('#foot [data-z="out"]').click();
  const before = await box();
  const w0 = await pageWidth();
  for (let i = 0; i < 3; i++) await page.locator('#foot [data-z="out"]').click();
  await expect.poll(pageWidth).toBeLessThan(w0 * 0.8);
  const after = await box();
  // La marge garde sa largeur et sa place : le dézoom ne la fait pas grandir.
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.x).toBeCloseTo(before.x, 0);
  // Et elle reste collée au bord droit du panneau.
  const right = await page.locator('#scroll').evaluate((el) => el.getBoundingClientRect().left + el.clientWidth);
  expect(right - (after.x + after.width)).toBeCloseTo(24, 0);
});

test('docx: le bouton Commentaires ferme la marge, le choix tient au rechargement, et faute d\'app la rouvre par-dessus la page', async ({page, project}) => {
  await page.setViewportSize({width: 1400, height: 900});
  await open(page, project);
  const btn = page.locator('#btnLane');
  const body = page.locator('body');
  await expect(body).not.toHaveClass(/no-lane/);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn.locator('.n')).toHaveText(/^\d+$/);
  await btn.click();
  await expect(body).toHaveClass(/no-lane/);
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#cards')).toBeHidden();
  await page.reload();
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  await expect(body).toHaveClass(/no-lane/);
  // Panneau étroit, sans app pour l'élargir : la marge passe par-dessus la page.
  await page.setViewportSize({width: 820, height: 900});
  // Un redimensionnement juste après le chargement peut passer pour une
  // rafale (page étirée puis remise en page) : on mesure la page posée.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(body).not.toHaveClass(/stretching/);
  const w0 = await page.locator('#paper').evaluate((p) => (p as HTMLElement).offsetWidth);
  await page.keyboard.press('ControlOrMeta+Shift+KeyM');
  await expect(body).toHaveClass(/lane-over/);
  await expect(body).not.toHaveClass(/no-lane/);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#cards .it').first()).toBeVisible();
  expect(Math.abs(await page.locator('#paper').evaluate((p) => (p as HTMLElement).offsetWidth) - w0)).toBeLessThan(2);
  const [cards, scroll] = await Promise.all([page.locator('#cards').boundingBox(), page.locator('#scroll').boundingBox()]);
  expect(cards!.x + cards!.width).toBeLessThanOrEqual(scroll!.x + scroll!.width);
  await btn.click();
  await expect(body).toHaveClass(/no-lane/);
  await expect(body).not.toHaveClass(/lane-over/);
});

test('docx: dans l\'app, le bouton Commentaires élargit le panneau de la place de la marge et le rend en la fermant', async ({page, project}) => {
  // L'hôte joue le rôle de l'app : il élargit l'iframe de ce qu'elle demande.
  const src = `${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(project.doc)}`;
  await page.request.post(`${project.url}/docx/prefs`, {data: {author: 'Thierry'}});
  await page.setViewportSize({width: 1600, height: 900});
  await page.setContent(`<body style="margin:0"><iframe id="f" style="border:0;width:800px;height:880px"></iframe><script>
    window.asks = [];
    const f = document.getElementById('f');
    addEventListener('message', (e) => {
      if (e.data?.type !== 'atelier-docx-pane') return;
      window.asks.push(e.data);
      if (e.data.action === 'widen') { window.before = f.offsetWidth; f.style.width = (f.offsetWidth + e.data.px) + 'px'; }
      else f.style.width = window.before + 'px';
      setTimeout(() => e.source.postMessage({type: 'atelier-docx-pane-done', action: e.data.action, ok: true}, '*'), 50);
    });
  </script></body>`);
  await page.locator('#f').evaluate((f: HTMLIFrameElement, url) => { f.src = url; }, src);
  const frame = page.frameLocator('#f');
  await expect(frame.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  const body = frame.locator('body');
  await expect(body).toHaveClass(/no-lane/);
  const w0 = await frame.locator('#paper').evaluate((p) => (p as HTMLElement).offsetWidth);
  await frame.locator('#btnLane').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {asks: {action: string; px: number}[]}).asks.length)).toBe(1);
  const ask = await page.evaluate(() => (window as unknown as {asks: {action: string; px: number}[]}).asks[0]);
  expect(ask.action).toBe('widen');
  expect(ask.px).toBeGreaterThan(300);
  await expect(body).not.toHaveClass(/no-lane/);
  await expect(body).not.toHaveClass(/lane-over|lane-in/);
  await expect(frame.locator('#btnLane')).toHaveAttribute('aria-pressed', 'true');
  // La page garde sa taille (ou monte aux 75 % sous lesquels la marge ne tient pas).
  const w1 = await frame.locator('#paper').evaluate((p) => (p as HTMLElement).offsetWidth);
  expect(w1).toBeGreaterThanOrEqual(w0 - 2);
  // Toute la marge tient dans le panneau.
  const right = await frame.locator('#scroll').evaluate((s) => s.scrollWidth - s.clientWidth);
  expect(right).toBeLessThanOrEqual(1);
  await frame.locator('#btnLane').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {asks: {action: string}[]}).asks.map((a) => a.action).join())).toBe('widen,restore');
  await expect(body).toHaveClass(/no-lane/);
  await expect(page.locator('#f')).toHaveCSS('width', '800px');
});

// ---------------------------------------------------------------- tri des suivis
// Document synthétique (fixture `tri` d'atelier-docx, anglais et français) :
// 29 suivis de Christophe et un de Marie Dupont.
test('docx: la sélection est peinte à la hauteur des lettres, et la fiche rappelle le passage commenté', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  await expect(page.locator('#paper')).toHaveClass(/\bpg\b/);
  // Fiche de commentaire : le passage commenté, sur une ligne, avant l'auteur.
  const m = await disk(page, project);
  const c = m.comments.find(x => x.parent === undefined && !x.done && x.quote.trim())!;
  const qt = page.locator(`#cards .it[data-key="c${c.id}"] .qt`);
  await expect(qt).toContainText(c.quote.trim().split(/\s+/).slice(0, 2).join(' '));
  // Sélection : un rectangle par ligne, à la hauteur du texte (pas de la ligne).
  await page.locator('#paper').focus();
  await select(page, 0, 'Fraction de glace');
  const rects = page.locator('#selpaint > i');
  await expect(rects).toHaveCount(1);
  const g = await page.evaluate(() => {
    const r = document.querySelector('#selpaint > i')!.getBoundingClientRect();
    const t = getSelection()!.getRangeAt(0).getClientRects()[0];
    return {top: r.top, h: r.height, w: r.width, ttop: t.top, th: t.height, tw: t.width};
  });
  expect(Math.abs(g.top - g.ttop)).toBeLessThan(1.5);
  expect(Math.abs(g.h - g.th)).toBeLessThan(1.5);
  expect(Math.abs(g.w - g.tw)).toBeLessThan(2);
  // Curseur replié : plus rien de peint.
  await caretAfter(page, 0, 'Fraction');
  await expect(rects).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('docx: nouvelle version et version reçue s\'ouvrent en copies à côté, sans toucher le document', async ({page, project}) => {
  await open(page, project);
  const original = await readFile(project.doc);
  // Rien de reçu d'autre tant que le document n'a pas bougé.
  await page.locator('#revMenu').click();
  await expect(page.locator('.menu .mi-head', {hasText: 'Versions'})).toBeVisible();
  await expect(page.locator('.menu .mi', {hasText: 'Ouvrir la version reçue'})).toHaveCount(0);
  const save = page.locator('.menu .mi', {hasText: 'Enregistrer une nouvelle version'});
  await expect(save).toContainText('…_v2.docx');
  await save.click();
  const v2 = path.join(project.root, 'Chapitre 2 corrigé CK_v2.docx');
  await expect(page).toHaveURL(/CK_v2\.docx/);
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  expect((await readFile(v2)).equals(original)).toBe(true);
  expect((await readFile(project.doc)).equals(original)).toBe(true);

  // Une retouche sur l'original : sa version reçue reste rouvrable telle quelle.
  const m = await disk(page, project);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Thierry', op: {op: 'replace', find: 'compromis', with: 'équilibre'}}});
  expect(r.ok()).toBe(true);
  await open(page, project);
  await page.locator('#revMenu').click();
  const received = page.locator('.menu .mi', {hasText: 'Ouvrir la version reçue de Christophe'});
  await expect(received).toBeVisible();
  await expect(page.locator('.menu .mi', {hasText: 'Enregistrer une nouvelle version'})).toContainText('…_v3.docx');
  await received.click();
  await expect(page).toHaveURL(/CK_recu\.docx/);
  expect((await readFile(path.join(project.root, 'Chapitre 2 corrigé CK_recu.docx'))).equals(original)).toBe(true);
  expect((await readFile(project.doc)).equals(original)).toBe(false);
});

// ------------------------------------------------ gestes montrés d'avance
// Effacer, Entrée, jointure et gras s'affichent avant la réponse du serveur ;
// effacements et frappe consécutifs partent en une seule retouche.

/** Texte affiché d'un paragraphe : sans les suppressions barrées. */
const TRI = path.join(path.dirname(FIXTURE), 'tri.docx');
const triTest = base.extend<{tri: {url: string; doc: string}}>({
  tri: async ({}, use) => {
    const root = await mkdtemp(path.join(tmpdir(), 'atelier-docx-tri-'));
    await copyFile(TRI, path.join(root, 'Résultats CK.docx'));
    const port = await freePort();
    const server = spawnGalleryServer({root, port, watch: false});
    try {
      await waitForServer(port, {child: server});
      await use({url: `http://127.0.0.1:${port}`, doc: path.join(root, 'Résultats CK.docx')});
    } finally {
      await stopGalleryServer(server);
      await removeTempRoot(root);
    }
  },
});

async function openTri(page: Page, tri: {url: string; doc: string}) {
  await page.request.post(`${tri.url}/docx/prefs`, {data: {author: 'Thierry'}});
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto(`${tri.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(tri.doc)}`);
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('4 Results');
  await page.locator('#btnTri').click();
  await expect(page.locator('#tri')).toBeVisible();
  await expect(page.locator('.tri-g[data-g="fond"] .c')).toHaveText('6');
}

const changeIds = async (page: Page, tri: {url: string; doc: string}) =>
  (await disk(page, tri)).changes.map((c) => c.id).sort((a, b) => a - b);

triTest('docx: le tri range les suivis et « Accepter les mineurs » n’accepte que les mineurs', async ({page, tri}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openTri(page, tri);
  await expect(page.locator('#btnTri')).toHaveAttribute('aria-pressed', 'true');
  // La marge cède la place au panneau.
  await expect(page.locator('#cards')).toBeHidden();
  // Relecteur principal par défaut ; Marie Dupont se choisit dans le titre.
  await expect(page.locator('#triWho')).toHaveText('Suivis de Christophe');
  const count = (g: string) => page.locator(`.tri-g[data-g="${g}"] .c`);
  await expect(count('nombres')).toHaveText('3');
  await expect(count('ponctuation')).toHaveText('7');
  await expect(count('espaces')).toHaveText('3');
  await expect(page.locator('.tri-n')).toHaveText('19 en attente');
  await expect(page.locator('#triMinor')).toHaveText('Accepter les 10 mineurs');
  await expect(page.locator('.tri-bar i')).toHaveCount(4);

  await page.locator('#triMinor').click();
  await expect(count('ponctuation')).toHaveText('0');
  await expect(count('espaces')).toHaveText('0');
  await expect(page.locator('#triMinor')).toBeDisabled();
  await expect.poll(() => changeIds(page, tri)).toEqual([1, 2, 5, 6, 7, 8, 11, 12, 13, 14, 17, 18, 22, 23, 27, 28, 30]);
  const m = await disk(page, tri);
  expect(m.paragraphs[1].text).toContain('largest decline in the Coast Range, where');
  expect(m.paragraphs[1].text).toContain('uniform: glaciers above 2400 m');
  expect(m.paragraphs[3].text).toContain('L’albédo');
  // Fond et nombres intacts, le compte du fond aussi.
  await expect(count('fond')).toHaveText('6');
  await expect(count('nombres')).toHaveText('3');
  // Un seul geste, une seule annulation.
  await page.locator('#btnUndo').click();
  await expect.poll(async () => (await changeIds(page, tri)).length).toBe(30);
  await expect(count('ponctuation')).toHaveText('7');

  await page.locator('#triWho').click();
  await page.locator('.menu .mi', {hasText: 'Marie Dupont'}).click();
  await expect(page.locator('#triWho')).toHaveText('Suivis de Marie');
  await expect(count('fond')).toHaveText('1');
  await expect(page.locator('#triMinor')).toBeDisabled();
  // Refermer rend la marge.
  await page.locator('#btnTri').click();
  await expect(page.locator('#tri')).toBeHidden();
  await expect(page.locator('#cards')).toBeVisible();
  expect(errors).toEqual([]);
});

triTest('docx: revue au clavier, A et R décident et avancent, Échap ferme', async ({page, tri}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openTri(page, tri);
  await page.locator('.tri-g[data-g="fond"]').click();
  const bar = page.locator('#rbar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('.tag')).toHaveText('Fond · 1 sur 6');
  await expect(bar).toContainText('Christophe · Remplacement');
  await expect(page.locator('#paper .tri-on')).toHaveText(['almost all', 'most']);
  // Le focus quitte la page : les touches ne s'écrivent pas dans le texte.
  await expect(bar).toBeFocused();
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.tri-cur')).toContainText('« almost all » → « most »');

  await page.keyboard.press('a');
  await expect(bar.locator('.tag')).toHaveText('Fond · 2 sur 6');
  await expect(page.locator('#paper .tri-on')).toHaveText(['smoke from wildfires deposited', 'wildfire smoke deposited']);
  await page.keyboard.press('r');
  await expect(bar.locator('.tag')).toHaveText('Fond · 3 sur 6');
  await expect(bar).toContainText('Christophe · Suppression');
  await expect.poll(() => changeIds(page, tri)).not.toEqual(expect.arrayContaining([5]));
  const m = await disk(page, tri);
  expect(m.paragraphs[1].text).toContain('Summer albedo declined on most glaciers');
  expect(m.paragraphs[1].text).toContain('where smoke from wildfires deposited light-absorbing');
  expect(m.changes.map((c) => c.id)).not.toEqual(expect.arrayContaining([1, 2, 6]));
  // Aucune frappe n'est partie dans le document.
  expect(m.changes.filter((c) => c.author === 'Thierry')).toEqual([]);

  // ↑ ↓ naviguent sans décider ; le compte des décidés ne revient pas.
  await page.keyboard.press('ArrowDown');
  await expect(bar.locator('.tag')).toHaveText('Fond · 4 sur 6');
  await page.keyboard.press('ArrowUp');
  await expect(bar.locator('.tag')).toHaveText('Fond · 3 sur 6');
  await page.keyboard.press('ArrowUp');
  await expect(bar.locator('.tag')).toHaveText('Fond · 6 sur 6');
  await expect(page.locator('.tri-g[data-g="fond"] .c')).toHaveText('4');
  // Les boutons de la barre font la même chose.
  await bar.locator('[data-act="next"]').click();
  await expect(bar.locator('.tag')).toHaveText('Fond · 3 sur 6');

  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
  await expect(page.locator('#paper .tri-on')).toHaveCount(0);
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('.tri-g[data-g="fond"]')).toBeFocused();
  expect(errors).toEqual([]);
});

const shownText = (page: Page, idx: number) => page.locator(`.d-p[data-idx="${idx}"]`).evaluate(p =>
  Array.from(p.querySelectorAll(':scope > [data-off]')).filter(s => !(s as HTMLElement).dataset.del).map(s => s.textContent).join(''));

/** Premier paragraphe du corps fait seulement de texte, avec un segment
 *  d'origine (sans suivi) d'au moins `n` caractères. */
async function plainParagraph(page: Page, project: {url: string; doc: string}, n: number) {
  const m = await disk(page, project);
  const idx = m.paragraphs.findIndex(p => p.segments.every(s => (s as {kind?: string}).kind === 'text')
    && p.segments.some(s => !s.rev && [...s.text].length >= n));
  expect(idx).toBeGreaterThanOrEqual(0);
  const seg = m.paragraphs[idx].segments.find(s => !s.rev && [...s.text].length >= n)!;
  return {idx, text: m.paragraphs[idx].text, seg: seg.text};
}

/** Retient les retouches envoyées au serveur ; `release()` les laisse passer. */
async function holdOps(page: Page) {
  let opened = false;
  const waiting: (() => void)[] = [];
  let count = 0;
  await page.route('**/docx/op', async route => {
    count++;
    if (!opened) await new Promise<void>(r => waiting.push(r));
    await route.continue();
  });
  return {release: () => { opened = true; waiting.splice(0).forEach(r => r()); }, count: () => count};
}

test('docx: retour arrière maintenu puis relâché, 40 caractères de moins et plus rien ne bouge', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  await page.locator('#btnTrack').click(); // sans suivi : le texte part vraiment
  await expect(page.locator('#btnTrack')).toHaveAttribute('aria-pressed', 'false');
  const {idx, text, seg} = await plainParagraph(page, project, 50);
  const needle = [...seg].slice(0, 45).join('');
  await caretAfter(page, idx, needle);
  let posts = 0;
  page.on('request', r => { if (r.url().includes('/docx/op')) posts++; });
  // Répétition du clavier : ~30 retours arrière par seconde.
  for (let k = 0; k < 40; k++) {
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(30);
  }
  const chars = [...text];
  const at = [...text.slice(0, text.indexOf(needle) + needle.length)].length;
  const expected = chars.slice(0, at - 40).concat(chars.slice(at)).join('');
  // À l'écran dès le relâchement…
  expect(await shownText(page, idx)).toBe(expected);
  // … puis dans le fichier, en une seule retouche.
  await expect.poll(async () => (await disk(page, project)).paragraphs[idx].text).toBe(expected);
  await page.waitForTimeout(1000);
  expect(await shownText(page, idx)).toBe(expected);
  expect((await disk(page, project)).paragraphs[idx].text).toBe(expected);
  expect(posts).toBe(1);
  expect(errors).toEqual([]);
});

test("docx: Entrée s'affiche avant la réponse du serveur, sans redessiner la page", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  const n = (await disk(page, project)).paragraphs.length;
  const domCount = await page.locator('#paper .d-p').count();
  // Repère sur le dernier paragraphe : il doit rester le même élément.
  await page.locator(`.d-p[data-idx="${n - 1}"]`).evaluate(el => { (el as HTMLElement).dataset.keep = '1'; });
  const hold = await holdOps(page);
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.press('Enter');
  await expect(page.locator('#paper .d-p')).toHaveCount(domCount + 1);
  expect(await shownText(page, 2)).toMatch(/retenu ici$/);
  expect((await disk(page, project)).paragraphs.length).toBe(n);
  // La suite a seulement changé de rang.
  await expect(page.locator(`.d-p[data-idx="${n}"]`)).toHaveAttribute('data-keep', '1');
  hold.release();
  await expect.poll(async () => (await disk(page, project)).paragraphs.length).toBe(n + 1);
  const m = await disk(page, project);
  expect(m.paragraphs[2].text).toMatch(/retenu ici$/);
  await expect(page.locator('#foot')).toContainText('Enregistré');
  await expect(page.locator(`.d-p[data-idx="${n}"]`)).toHaveAttribute('data-keep', '1');
  expect(await shownText(page, 3)).toBe(m.paragraphs[3].text);
  expect(errors).toEqual([]);
});

test("docx: la frappe juste après Entrée et la jointure s'affichent tout de suite", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  const n = (await disk(page, project)).paragraphs.length;
  const domCount = await page.locator('#paper .d-p').count();
  const hold = await holdOps(page);
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ainsi');
  // Entrée encore en vol : la frappe est déjà au début du nouveau paragraphe.
  expect(await shownText(page, 3)).toMatch(/^Ainsi/);
  expect(hold.count()).toBe(1);
  hold.release();
  await expect.poll(async () => (await disk(page, project)).paragraphs[3]?.text ?? '').toMatch(/^Ainsi/);
  expect((await disk(page, project)).paragraphs.length).toBe(n + 1);
  // Retour arrière au début : on défait sa propre Entrée, la jointure se voit aussitôt.
  await caretAfter(page, 3, 'Ainsi');
  for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#paper .d-p')).toHaveCount(domCount);
  expect(await shownText(page, 2)).toMatch(/retenu iciAinsi/);
  await expect.poll(async () => (await disk(page, project)).paragraphs.length).toBe(n);
  expect((await disk(page, project)).paragraphs[2].text).toContain('retenu iciAinsi');
  expect(errors).toEqual([]);
});

test("docx: en suivi, effacer le texte d'origine le barre aussitôt ; effacer sa frappe non envoyée n'envoie rien", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  const {idx, seg} = await plainParagraph(page, project, 12);
  const needle = [...seg].slice(0, 10).join('');
  const gone = [...needle].slice(-3).join('');
  const hold = await holdOps(page);
  await caretAfter(page, idx, needle);
  for (let k = 0; k < 3; k++) await page.keyboard.press('Backspace');
  // Barré tout de suite, pas retiré.
  await expect(page.locator(`.d-p[data-idx="${idx}"] .del.pending`)).toHaveText(gone);
  // Sa propre frappe, effacée avant la pause : rien ne part pour elle.
  await page.keyboard.type('ab');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.locator(`.d-p[data-idx="${idx}"] .ins.pending`)).toHaveCount(0);
  await expect(page.locator(`.d-p[data-idx="${idx}"] .del.pending`)).toHaveText(gone);
  await page.waitForTimeout(600);
  hold.release();
  await expect.poll(async () => (await disk(page, project)).changes.filter(c => c.author === 'Thierry').map(c => [c.kind, c.text])).toEqual([['del', gone]]);
  expect(hold.count()).toBe(1);
  await expect(page.locator(`.d-p[data-idx="${idx}"] .del:not(.pending)`, {hasText: gone})).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("docx: un refus du serveur (409, Word ouvert) rend la saisie et remet l'écran à l'état du fichier", async ({page, project}) => {
  await open(page, project);
  const before = (await disk(page, project)).paragraphs[2].text;
  const n = (await disk(page, project)).paragraphs.length;
  let status = 409;
  await page.route('**/docx/op', route => route.fulfill({status, contentType: 'application/json', body: JSON.stringify({error: status === 423 ? 'Le document est ouvert dans Word' : 'révision périmée'})}));
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.type(' perdu ?');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.d-p[data-idx="2"]')).toContainText('retenu ici perdu offre');
  await expect(page.locator('#toast')).toContainText('« perdu »', {timeout: 6000});
  await expect(page.locator('#toast')).toHaveClass(/err/);
  await expect.poll(() => shownText(page, 2)).toBe(before);
  expect((await disk(page, project)).paragraphs[2].text).toBe(before);
  // Word ouvert (423) sur une Entrée suivie de frappe : même chose.
  status = 423;
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Encore');
  await expect(page.locator('#toast')).toContainText('Encore', {timeout: 6000});
  await expect.poll(() => shownText(page, 2)).toBe(before);
  expect((await disk(page, project)).paragraphs.length).toBe(n);
  expect((await disk(page, project)).paragraphs[2].text).toBe(before);
});

test("docx: délai entre la touche et l'affichage (retour arrière, Entrée, gras)", async ({page, project}) => {
  await open(page, project);
  // Chronomètre dans la page : touche (capture) → première mutation qui
  // montre le geste ; fin de la réponse /docx/op d'après Resource Timing.
  await page.evaluate(() => {
    const w = window as unknown as {__arm: (kind: string, idx: number) => void; __t: {t0: number; t1: number}};
    w.__t = {t0: 0, t1: 0};
    document.addEventListener('keydown', () => { if (!w.__t.t0) w.__t.t0 = performance.now(); }, true);
    w.__arm = (kind, idx) => {
      const p = () => document.querySelector(`.d-p[data-idx="${idx}"]`);
      const text = () => Array.from(p()?.querySelectorAll(':scope > [data-off]') || []).filter(s => !(s as HTMLElement).dataset.del).map(s => s.textContent).join('');
      const t0 = text(), n0 = document.querySelectorAll('#paper .d-p').length, b0 = p()?.querySelectorAll('b').length || 0;
      w.__t = {t0: 0, t1: 0};
      const mo = new MutationObserver(() => {
        const ok = kind === 'Backspace' ? text().length < t0.length : kind === 'Enter' ? document.querySelectorAll('#paper .d-p').length > n0 : (p()?.querySelectorAll('b').length || 0) > b0;
        if (ok) { w.__t.t1 = performance.now(); mo.disconnect(); }
      });
      mo.observe(document.getElementById('paper')!, {childList: true, subtree: true, characterData: true});
    };
  });
  const measure = async (kind: string, idx: number, key: () => Promise<void>) => {
    await page.evaluate(([k, i]) => { performance.clearResourceTimings(); (window as unknown as {__arm: (k: string, i: number) => void}).__arm(k as string, i as number); }, [kind, idx] as const);
    await key();
    await expect.poll(() => page.evaluate(() => (window as unknown as {__t: {t1: number}}).__t.t1)).toBeGreaterThan(0);
    await page.waitForTimeout(900);
    await expect(page.locator('#foot')).toContainText('Enregistré', {timeout: 8000});
    return page.evaluate(() => {
      const t = (window as unknown as {__t: {t0: number; t1: number}}).__t;
      const ops = performance.getEntriesByType('resource').filter(e => e.name.includes('/docx/op')) as PerformanceResourceTiming[];
      return {shown: Math.round(t.t1 - t.t0), saved: ops.length ? Math.round(ops[0].responseEnd - t.t0) : -1};
    });
  };
  await select(page, 2, 'compromis');
  const bold = await measure('Bold', 2, () => page.keyboard.press('Control+b'));
  await caretAfter(page, 2, 'retenu ici');
  const back = await measure('Backspace', 2, () => page.keyboard.press('Backspace'));
  await caretAfter(page, 2, 'retenu ic');
  const enter = await measure('Enter', 2, () => page.keyboard.press('Enter'));
  const out = {back, enter, bold};
  test.info().annotations.push({type: 'délais (ms)', description: JSON.stringify(out)});
  console.log('délais touche → écran / → réponse (ms)', JSON.stringify(out));
  // Montré avant la réponse du serveur, en quelques millisecondes.
  for (const r of [back, enter, bold]) {
    expect(r.shown).toBeLessThan(50);
    if (r.saved > 0) expect(r.shown).toBeLessThan(r.saved);
  }
});

type Seg = Para['segments'][number] & {latex?: string; i?: boolean; sup?: boolean; font?: string};

test('docx: une équation se lit en KaTeX et se corrige en LaTeX, en suivi signé', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  const idx = (await disk(page, project)).paragraphs.findIndex(p => p.text.startsWith("L'albédo large bande"));
  expect(idx).toBeGreaterThan(0);
  const chip = page.locator(`.d-p[data-idx="${idx}"] .chip.eq`).first();
  // Rendu KaTeX dans la police et l'encre de la page, pas le LaTeX brut.
  await expect(chip.locator('.katex')).toBeVisible();
  await expect(chip).not.toHaveClass(/\braw\b/);
  await expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
  const latex0 = await chip.getAttribute('data-latex');
  expect(latex0).toContain('0,356');

  // Le clic ouvre la fenêtre : titre court, étiquette « en suivi », source au focus.
  await chip.click();
  const pop = page.locator('#eqpop');
  await expect(pop).toHaveClass(/\bshow\b/);
  await expect(page.locator('#eqH')).toHaveText('Équation 1 · LaTeX');
  await expect(page.locator('#eqTag')).toBeVisible();
  await expect(page.locator('#eqSrc')).toHaveValue(latex0!);
  await expect(page.locator('#eqSrc')).toBeFocused();
  await expect(page.locator('#eqPrev .katex')).toBeVisible();
  // Rien d'autre que champ, aperçu et deux boutons.
  await expect(pop.locator('button')).toHaveCount(2);

  // Un LaTeX sans équivalent Word est refusé, message dans la fenêtre.
  await page.locator('#eqSrc').fill('\\mathcal{L}');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#eqErr')).toContainText('commande inconnue');
  await expect(pop).toHaveClass(/\bshow\b/);
  let m = await disk(page, project);
  expect(m.changes.filter(c => c.author === 'Thierry')).toEqual([]);

  // Échap ferme sans rien changer ; un nouveau clic rouvre.
  await page.keyboard.press('Escape');
  await expect(pop).not.toHaveClass(/\bshow\b/);
  await chip.click();
  await expect(pop).toHaveClass(/\bshow\b/);

  // L'aperçu suit la frappe, Ctrl+Entrée remplace.
  await page.locator('#eqSrc').fill('\\alpha = 0,36\\,\\rho_{1}');
  await expect(page.locator('#eqPrev')).toContainText('0,36');
  await page.keyboard.press('Control+Enter');
  await expect(pop).not.toHaveClass(/\bshow\b/);
  const p = page.locator(`.d-p[data-idx="${idx}"]`);
  await expect(p.locator('.chip.eq.del')).toHaveCount(1);
  await expect(p.locator('.chip.eq.ins .katex')).toBeVisible();
  m = await disk(page, project);
  const mine = m.changes.filter(c => c.author === 'Thierry').map(c => c.kind).sort();
  expect(mine).toEqual(['del', 'ins']);
  const segs = m.paragraphs[idx].segments as Seg[];
  expect(segs.filter(s => s.latex !== undefined && s.rev === 'ins').map(s => s.latex)).toEqual([expect.stringContaining('0,36')]);
  expect(segs.filter(s => s.latex !== undefined && s.rev === 'del').map(s => s.latex)).toEqual([latex0]);
  expect(errors).toEqual([]);
});

test('docx: le collage garde italique, exposant et équations ; la copie met du HTML', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  const paste = (data: Record<string, string>) => page.evaluate((d) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(d)) dt.setData(k, v);
    document.querySelector('#paper')!.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
  }, data);

  // HTML riche : la mise en forme utile suit, pas la police ni la couleur.
  await page.locator('#paper').focus();
  await caretAfter(page, 2, 'retenu ici');
  await paste({
    'text/html': '<meta charset="utf-8"><span style="font-family:Comic Sans MS;color:red"> selon <i>Hall</i> en m<sup>2</sup></span>',
    'text/plain': ' selon Hall en m2',
  });
  await expect(page.locator('.d-p[data-idx="2"]')).toContainText('retenu ici selon Hall en m2');
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].text).toContain('retenu ici selon Hall en m2');
  const segs = (await disk(page, project)).paragraphs[2].segments as Seg[];
  expect(segs.some(s => s.text === 'Hall' && s.i && s.rev === 'ins')).toBe(true);
  expect(segs.some(s => s.text === '2' && s.sup && s.rev === 'ins')).toBe(true);
  expect(segs.some(s => s.rev === 'ins' && s.font === 'Comic Sans MS')).toBe(false);

  // Texte avec $…$ : l'équation arrive comme une équation Word.
  await caretAfter(page, 2, 'retenu ici');
  await paste({'text/plain': ' soit $x^2$'});
  await expect(page.locator('.d-p[data-idx="2"] .chip.eq.ins .katex')).toBeVisible();
  await expect.poll(async () => ((await disk(page, project)).paragraphs[2].segments as Seg[]).filter(s => s.latex !== undefined).map(s => s.latex)).toEqual(['x^{2}']);
  const m = await disk(page, project);
  expect(new Set(m.changes.filter(c => c.author === 'Thierry').map(c => c.kind))).toEqual(new Set(['ins']));

  // Copier : text/html garde l'italique, text/plain le texte.
  await select(page, 1, 'MOD09GA');
  const copied = await page.evaluate(() => {
    const dt = new DataTransfer();
    document.querySelector('#paper')!.dispatchEvent(new ClipboardEvent('copy', {clipboardData: dt, bubbles: true, cancelable: true}));
    return {html: dt.getData('text/html'), text: dt.getData('text/plain')};
  });
  expect(copied.text).toBe('MOD09GA');
  expect(copied.html).toContain('<i>MOD09GA</i>');
  expect(errors).toEqual([]);
});

test('docx: en séance, les gestes reviennent en delta et le fichier s\'écrit d\'un coup', async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const replies: {delta: boolean; model: boolean; bytes: number}[] = [];
  page.on('response', async r => {
    if (!r.url().endsWith('/docx/op') || r.request().method() !== 'POST') return;
    const body = await r.text().catch(() => '');
    try {
      const v = JSON.parse(body);
      replies.push({delta: !!v.delta, model: 'model' in v, bytes: body.length});
    } catch { /* réponse coupée par la navigation */ }
  });
  await open(page, project);
  const original = await readFile(project.doc);
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.type(', fixé a priori,');
  await expect.poll(() => replies.length).toBeGreaterThan(0);
  await caretAfter(page, 2, 'priori');
  await page.keyboard.press('Enter');
  await expect.poll(() => replies.length).toBeGreaterThan(1);
  await expect(page.locator('.d-p[data-idx="3"]')).toContainText(', offre');
  // Réponses en delta (petites), sans modèle complet sur le fil.
  expect(replies.every(r => r.delta)).toBe(true);
  const sizes = replies.map(r => r.bytes);
  expect(Math.max(...sizes)).toBeLessThan(20000);
  // Le fichier s'écrit d'un coup (pause ou départ de la page), sans
  // relecture du modèle complet ici.
  await page.goto('about:blank');
  await expect.poll(async () => (await readFile(project.doc)).equals(original)).toBe(false);
  // Rouvert : le document montre ce qui avait été confirmé, sans perte.
  await open(page, project);
  await expect(page.locator('.d-p[data-idx="2"]')).toContainText('retenu ici, fixé a priori');
  await expect(page.locator('.d-p[data-idx="3"]')).toContainText(', offre');
  const m = await disk(page, project);
  expect(m.changes.filter(c => c.author === 'Thierry').map(c => c.kind)).toContain('ins');
  expect(errors).toEqual([]);
});
