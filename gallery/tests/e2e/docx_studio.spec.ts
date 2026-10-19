import {test as base, expect, type Page} from '@playwright/test';
import {copyFile, mkdtemp, writeFile} from 'node:fs/promises';
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
  await expect(page.locator('.card')).toHaveCount(11);

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
  // Remplacement de Christophe : une carte, deux suivis.
  const repl = page.locator('.card', {hasText: 'Remplacement'});
  await repl.locator('[data-act="accept"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 101 || c.id === 102)).toBe(false);
  await expect(page.locator('.d-p[data-idx="1"] .del')).toHaveCount(0);

  // Annuler (⌘Z) rend les deux suivis.
  await page.locator('#paper').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await disk(page, project)).changes.filter(c => c.id === 101 || c.id === 102).length).toBe(2);

  // Refuser la mise en forme de « 0,04 ».
  await page.locator('.card', {hasText: 'Mise en forme'}).filter({hasText: '0,04'}).locator('[data-act="reject"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 104)).toBe(false);

  // Répondre au commentaire de Christophe puis le résoudre.
  const thread = page.locator('.card', {hasText: 'Pourquoi 0,6'});
  await thread.locator('[data-act="reply"]').click();
  await thread.locator('textarea').fill('Analyse ajoutée en annexe B.');
  await thread.locator('[data-x="send"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.parent === 1 && c.text === 'Analyse ajoutée en annexe B.' && c.author === 'Thierry')).toBe(true);
  await page.locator('.card', {hasText: 'Pourquoi 0,6'}).locator('[data-act="resolve"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.find(c => c.id === 1)?.done).toBe(true);

  // Commenter une sélection depuis la capsule commune d'Atelier (bulle de note).
  await select(page, 4, "fin d'été");
  await expect(page.locator('#selbar.atelier-selection')).toBeVisible();
  await page.locator('#selbar [aria-label="Annoter"]').click();
  await page.locator('.d-note-editor textarea.atelier-note-input').fill('Préciser la date.');
  await page.locator('.d-note-editor textarea.atelier-note-input').press('Enter');
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.quote === "fin d'été" && c.text === 'Préciser la date.')).toBe(true);
  await expect(page.locator('.d-note-editor')).toBeHidden();
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
  await expect(page.locator('.d-p[data-idx="2"] b', {hasText: 'compromis'})).toHaveCount(1);
  let m = await disk(page, project);
  expect(m.changes.some(c => c.author === 'Thierry' && c.kind === 'format')).toBe(true);

  await caretAfter(page, 2, 'pureté');
  await page.locator('[data-align="both"]').click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].align).toBe('both');
  await expect(page.locator('.d-p[data-idx="2"]')).toHaveClass(/a-both/);

  await caretAfter(page, 2, 'pureté');
  await page.locator('#ddStyle').click();
  await page.locator('.menu .mi', {hasText: 'Titre 2'}).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].heading).toBe(2);

  // Vue Final : les suppressions disparaissent ; Original : lecture seule.
  await page.locator('[data-view="final"]').click();
  await expect(page.locator('.d-p[data-idx="1"] .del').first()).toBeHidden();
  await page.locator('[data-view="original"]').click();
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'false');
  await page.locator('[data-view="revue"]').click();

  // Page Thème, gardée côté serveur.
  await page.locator('[data-page="theme"]').click();
  await expect(page.locator('body')).not.toHaveClass(/blanche/);
  await expect.poll(async () => (await (await page.request.get(`${project.url}/docx/prefs`)).json()).page).toBe('theme');

  // Sans suivi, la frappe s'écrit directement.
  await page.locator('#btnTrack').click();
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
  await expect(page.locator('.card', {hasText: 'Claude'})).toHaveCount(1);
  await expect(page.locator('#foot')).toContainText('de Claude en attente');
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
  await page.locator('.card', {hasText: 'Sentinel-2'}).locator('[data-act="accept"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(c => c.id === 120)).toBe(false);
  // La figure du document s'affiche.
  const img = page.locator('.chip.fig img').first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // Insérer une note après « MODIS » : le curseur passe dans la note.
  await caretAfter(page, 1, 'pixel MODIS');
  await page.locator('#btnNote').click();
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
  await page.locator('#btnFigure').click();
  await page.locator('.menu .mi', {hasText: 'albedo.png'}).click();
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
  await page.locator('#btnTable').click();
  await page.locator('.menu.show .mi', {hasText: 'Insérer une ligne en dessous'}).click();
  await expect.poll(cells).toBe(6);
  // Le curseur est dans la nouvelle ligne : on y écrit, en suivi.
  await page.keyboard.type('Z4');
  await expect.poll(async () => (await disk(page, project)).paragraphs[8].text).toBe('Z4');
  const m = await disk(page, project);
  expect(m.changes.some(c => c.kind === 'row-ins' && c.author === 'Thierry')).toBe(true);
  await expect(page.locator('.card', {hasText: 'Ligne ajoutée'}).filter({hasText: 'Thierry'})).toHaveCount(1);

  await caretAfter(page, 8, 'Z4');
  await page.locator('#btnTable').click();
  await page.locator('.menu.show .mi', {hasText: 'Insérer une colonne à droite'}).click();
  await expect.poll(cells).toBe(9);
  await expect(page.locator('#foot')).toContainText('Word ne suit pas les colonnes');
  await page.locator('#btnTable').click();
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
