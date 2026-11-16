import {test as base, expect, type Page} from '@playwright/test';
import {copyFile, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
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
// La même copie, où l'auteur a posé des zones de texte sur la figure (deux
// cadres orange, valeurs inventées), un cadre de l'ancien Word (VML seul) et
// une flèche dans un paragraphe de texte.
const ZONES = path.join(path.dirname(FIXTURE), 'zones.docx');
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
type Model = {revision: string; paragraphs: Para[]; notes: {paragraphs: Para[]}[]; headers: {paragraphs: Para[]}[]; changes: {id: number; kind: string; author: string; text: string; date: string}[]; comments: {id: number; author: string; date: string; text: string; parent?: number; done: boolean; quote: string}[]; unreadComments?: number[]; bookmark?: {marks?: {id: number; color: string}[]; last?: number}};

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

test("docx: les zones de texte posées sur une figure se voient à leur place, par-dessus l'image", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const doc = path.join(project.root, 'Zones.docx');
  await copyFile(ZONES, doc);
  const zones = {url: project.url, doc};
  await open(page, zones);
  const pt = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pt')));
  expect(pt).toBeGreaterThan(0.5);

  // Sur la figure : deux cadres, à leur place en points depuis le coin du
  // paragraphe, avec leur bordure orange, leur fond blanc et leur texte.
  const fig = page.locator('.d-p', {has: page.locator('.chip.fig, img')}).filter({has: page.locator('.d-sh.shf')}).first();
  await expect(fig.locator('.d-sh.shf')).toHaveCount(2);
  const seen = await fig.evaluate(el => {
    const o = el.getBoundingClientRect();
    const img = el.querySelector('img')!.getBoundingClientRect();
    return {
      len: (el as HTMLElement).dataset.len,
      img: {x: img.left - o.left, y: img.top - o.top, w: img.width, h: img.height},
      boxes: Array.from(el.querySelectorAll<HTMLElement>('.d-sh.shf')).map(b => {
        const r = b.getBoundingClientRect();
        const part = b.querySelector<HTMLElement>('.sh-part')!;
        const cs = getComputedStyle(part);
        return {
          x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height,
          text: Array.from(b.querySelectorAll('.sh-p')).map(p => p.textContent),
          border: cs.borderTopColor, borderWidth: parseFloat(cs.borderTopWidth), background: cs.backgroundColor,
          ink: getComputedStyle(b.querySelector('.sh-p span') || b.querySelector('.sh-p')!).color,
          events: getComputedStyle(b).pointerEvents,
          z: getComputedStyle(b).zIndex,
        };
      }),
    };
  });
  const [value, level] = seen.boxes;
  expect(value.text).toEqual(['H = 0,4 m']);
  expect(level.text).toEqual(['Niveau initial', '= 12,5 m']);
  expect(Math.abs(value.x - 190 * pt)).toBeLessThan(1.5);
  expect(Math.abs(value.y - 20 * pt)).toBeLessThan(1.5);
  expect(Math.abs(value.w - 100 * pt)).toBeLessThan(1.5);
  expect(Math.abs(level.x)).toBeLessThan(1.5);
  expect(Math.abs(level.y - 60 * pt)).toBeLessThan(1.5);
  expect(Math.abs(level.w - 150 * pt)).toBeLessThan(1.5);
  for (const b of seen.boxes) {
    expect(b.border).toBe('rgb(247, 150, 70)');
    expect(b.borderWidth).toBeGreaterThan(0.5);
    expect(b.background).toBe('rgb(255, 255, 255)');
    // Par-dessus l'image, sans prendre les clics du texte.
    expect(b.events).toBe('none');
    expect(Number(b.z)).toBeGreaterThanOrEqual(1);
    // Le cadre grandit s'il le faut : tout son texte se lit.
    expect(b.h).toBeGreaterThan(20 * pt);
  }
  // Le vert choisi par l'auteur est gardé.
  expect(value.ink).toBe('rgb(0, 176, 80)');
  // Les cadres recouvrent bien l'image de la figure.
  expect(value.x + value.w).toBeGreaterThan(seen.img.x);
  expect(value.x).toBeLessThan(seen.img.x + seen.img.w);
  expect(value.y + value.h).toBeGreaterThan(seen.img.y);
  expect(value.y).toBeLessThan(seen.img.y + seen.img.h);
  // Ils n'occupent aucun caractère : le paragraphe ne compte que son image.
  const m = await disk(page, zones);
  const figure = m.paragraphs.find(p => p.segments.some(s => s.media) && (p as {shapes?: unknown[]}).shapes?.length === 2)!;
  expect(seen.len).toBe(String(Array.from(figure.text).length));

  // Dans un paragraphe de texte : le cadre de l'ancien Word et la flèche.
  const prose = page.locator('.d-p', {hasText: 'Ces valeurs sont'}).first();
  await expect(prose.locator('.d-sh.shf')).toHaveCount(2);
  await expect(prose.locator('.d-sh.shf', {hasText: 'Ancien Word'})).toHaveCount(1);
  const arrow = prose.locator('.d-sh.shf svg path').first();
  await expect(arrow).toHaveAttribute('stroke', /^#?[0-9a-fA-F]{6}$|^rgb/);
  const drawn = await prose.locator('.d-sh.shf svg').first().evaluate(el => el.getBoundingClientRect().width);
  expect(drawn).toBeGreaterThan(50);

  // Écrire à côté ne déplace ni n'efface rien : les formes restent dans le
  // fichier et à l'écran.
  const idx = Number(await prose.getAttribute('data-idx'));
  await caretAfter(page, idx, 'Ces valeurs');
  await page.keyboard.type(' mesurées');
  await expect.poll(async () => (await disk(page, zones)).paragraphs[idx].text).toContain('Ces valeurs mesurées sont');
  await expect(page.locator(`.d-p[data-idx="${idx}"] .d-sh.shf`)).toHaveCount(2);
  await expect(fig.locator('.d-sh.shf')).toHaveCount(2);
  const after = await disk(page, zones);
  expect(((after.paragraphs[idx] as {shapes?: unknown[]}).shapes || []).length).toBe(2);
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
  await expect(page.locator('#tabComN')).toHaveText('');
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

// Projecteur (Thierry, 2026-11-16) : une fiche ouverte, les autres de la marge
// reculent à 50 % ; Échap rend tout.
test('docx: la fiche ouverte ressort, les autres reculent, Échap rend tout', async ({page, project}) => {
  await open(page, project);
  const thread = page.locator('#cards .it[data-key="c1"]');
  const other = page.locator('#cards .it:not([data-key="c1"])').first();
  const opacity = (l: typeof other) => l.evaluate(el => getComputedStyle(el).opacity);
  await expect(page.locator('body')).not.toHaveClass(/\bc-spot\b/);
  await thread.locator('.cc').click();
  await expect(thread).toHaveClass(/\bon\b/);
  await expect(page.locator('body')).toHaveClass(/\bc-spot\b/);
  await expect.poll(() => opacity(other)).toBe('0.5');
  await expect.poll(() => opacity(thread)).toBe('1');
  await page.locator('body').press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/\bc-spot\b/);
  await expect.poll(() => opacity(other)).toBe('1');
});

// Thierry, 2026-11-15 : la bulle de SA modification n'offrait qu'un ✕
// (« Retirer »), qu'il prenait pour « fermer ». Elle porte maintenant
// ✕ et ✓, comme celle des autres.
test("docx: sa propre modification s'accepte depuis sa bulle", async ({page, project}) => {
  const c = (await disk(page, project)).changes.find(x => x.id === 120)!;
  await page.request.post(`${project.url}/docx/prefs`, {data: {author: c.author}});
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(project.doc)}`);
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  await page.locator('#paper .ins[data-ch="120"]').click();
  const bub = page.locator('#bub');
  await expect(bub).toContainText('Toi');
  await expect(bub.locator('[data-act="reject"]')).toBeVisible();
  await expect(bub.locator('[data-act="accept"]')).toHaveAttribute('aria-label', 'Accepter');
  // Échap ferme la bulle sans rien décider.
  await page.keyboard.press('Escape');
  await expect(bub).not.toHaveClass(/\bshow\b/);
  expect((await disk(page, project)).changes.some(x => x.id === 120)).toBe(true);
  await page.locator('#paper .ins[data-ch="120"]').click();
  await bub.locator('[data-act="accept"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.some(x => x.id === 120)).toBe(false);
  await expect(page.locator('#paper .ins[data-ch="120"]')).toHaveCount(0);
});

// Thierry, 2026-11-14 : il résolvait et répondait pendant que l'agent
// posait d'autres bulles dans le même TP ; ces gestes, calculés sur la
// révision d'avant l'agent, partaient en conflit et se perdaient. Ils
// arrivent maintenant dans le fichier et s'y retrouvent à la réouverture.
test("docx: résoudre et répondre pendant que l'agent écrit, puis rouvrir : tout est là", async ({page, project}) => {
  await open(page, project);
  // Le panneau ne voit pas encore l'écriture de l'agent (sondage coupé).
  await page.route('**/docx/stat**', (r) => r.abort());
  const thread = page.locator('#cards .it[data-key="c1"]');
  await thread.locator('.cc').click();
  await expect(thread).toHaveClass(/\bon\b/);
  // L'agent pose une bulle par un autre chemin (sans la révision du panneau).
  const agent = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, author: 'Thierry Laurent', op: {op: 'comment', paragraph: 'p4', find: "fin d'été", text: 'Date ?'}}});
  expect(agent.ok()).toBe(true);

  await thread.locator('textarea').fill('Corrigé, merci.');
  await thread.locator('[data-act="reply"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.parent === 1 && c.text === 'Corrigé, merci.')).toBe(true);
  await thread.locator('[data-act="resolve"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.find(c => c.id === 1)?.done).toBe(true);

  // Réouverture : le fichier (relu par un autre client) et le panneau.
  await page.unroute('**/docx/stat**');
  await page.reload();
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  const m = await disk(page, project);
  expect(m.comments.find(c => c.id === 1)?.done).toBe(true);
  expect(m.comments.some(c => c.parent === 1 && c.text === 'Corrigé, merci.' && c.author === 'Thierry')).toBe(true);
  expect(m.comments.some(c => c.text === 'Date ?')).toBe(true);
  await expect(page.locator('#cards .it[data-key="c1"] .cc.dn')).toBeVisible();
});

// Thierry, 2026-11-15 (revCK, commentaire 760) : résolu, puis rouvert 4 s
// plus tard sans un mot. La carte « Réglé » redéployée met « Rouvrir » là
// où était « Résoudre » : le clic de trop rouvrait le fil en silence. Un
// « Rouvrir » cliqué dans l'instant où la carte s'ouvre est ignoré, un
// vrai « Rouvrir » le dit, et la résolution tient à la réouverture.
test("docx: un fil résolu ne se rouvre pas d'un clic de trop, et reste résolu à la réouverture", async ({page, project}) => {
  await open(page, project);
  const thread = page.locator('#cards .it[data-key="c1"]');
  await thread.locator('.cc').click();
  await thread.locator('[data-act="resolve"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.find(c => c.id === 1)?.done).toBe(true);
  await expect(thread.locator('.cc.dn')).toBeVisible();

  // Clic sur « Réglé » puis tout de suite sur « Rouvrir » : rien ne change.
  await thread.locator('.cc.dn').click();
  await thread.locator('[data-act="reopen"]').click();
  await page.waitForTimeout(400);
  expect((await disk(page, project)).comments.find(c => c.id === 1)?.done).toBe(true);
  await expect(thread.locator('[data-act="reopen"]')).toBeVisible();

  // Fermer et rouvrir le document : le fil est toujours résolu.
  await page.goto('about:blank');
  await open(page, project);
  expect((await disk(page, project)).comments.find(c => c.id === 1)?.done).toBe(true);
  await expect(thread.locator('.cc.dn')).toBeVisible();

  // Un « Rouvrir » voulu rouvre, et le dit.
  await thread.locator('.cc.dn').click();
  await page.waitForTimeout(700);
  await thread.locator('[data-act="reopen"]').click();
  await expect(page.locator('#toast')).toContainText('Commentaire rouvert');
  await expect.poll(async () => (await disk(page, project)).comments.find(c => c.id === 1)?.done).toBe(false);
});

// Thierry, 2026-11-14 (suite) : ses retouches de texte disparaissaient
// aussi. Une frappe ou un commentaire posé dans un paragraphe que l'agent
// venait de retoucher partait en conflit, et le panneau ne le rejouait que
// si le texte du paragraphe était resté le même : la frappe finissait dans
// le presse-papiers, le commentaire était jeté. Ils sont maintenant replacés
// autour de la retouche de l'agent, et tout est là à la réouverture.
test("docx: taper et commenter pendant que l'agent retouche le même paragraphe, puis rouvrir : tout est là", async ({page, project}) => {
  await open(page, project);
  // Le panneau ne voit pas encore l'écriture de l'agent (sondage coupé) :
  // l'agent écrit juste avant que le geste du panneau n'arrive.
  await page.route('**/docx/stat**', (r) => r.abort());
  let agentOp: unknown = null;
  await page.route('**/docx/op', async (route) => {
    if (agentOp) {
      const op = agentOp;
      agentOp = null;
      const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, author: 'Claude', op}});
      expect(r.ok(), await r.text()).toBe(true);
    }
    await route.continue();
  });

  // Deux retouches de l'agent dans le paragraphe où l'on tape, une avant
  // le curseur et une après.
  agentOp = {op: 'batch', ops: [
    {op: 'replace', paragraph: 'p2', find: 'seuil', with: 'palier'},
    {op: 'replace', paragraph: 'p2', find: 'compromis', with: 'équilibre'},
  ]};
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.type(' a priori');
  await expect.poll(async () => (await disk(page, project)).paragraphs[2].text).toBe('Le palier de 0,6 retenu ici a priori offre un équilibre entre le nombre de pixels retenus et la pureté du signal glaciaire.');
  await expect(page.locator('#toast.err')).toHaveCount(0);

  // Un commentaire sur un passage pendant que l'agent retouche plus tôt
  // dans le même paragraphe : il s'ancre toujours sur « fin d'été ».
  agentOp = {op: 'replace', paragraph: 'p4', find: 'atteignant', with: 'qui atteint'};
  await select(page, 4, "fin d'été");
  await page.locator('#selbar [aria-label="Annoter"]').click();
  const note = page.locator('.nbox.show textarea');
  await note.fill('Préciser la date.');
  await note.press('ControlOrMeta+Enter');
  await expect.poll(async () => (await disk(page, project)).comments.find(c => c.text === 'Préciser la date.')?.quote).toBe("fin d'été");

  // Réouverture : le fichier et le panneau ont tout.
  await page.unroute('**/docx/op');
  await page.unroute('**/docx/stat**');
  await page.goto('about:blank');
  await open(page, project);
  const m = await disk(page, project);
  expect(m.paragraphs[2].text).toContain('retenu ici a priori offre un équilibre');
  expect(m.paragraphs[4].text).toContain("qui atteint 0,04 en fin d'été");
  expect(m.changes.some(c => c.author === 'Thierry' && c.kind === 'ins' && c.text.includes('a priori'))).toBe(true);
  expect(m.comments.some(c => c.text === 'Préciser la date.' && c.author === 'Thierry' && c.quote === "fin d'été")).toBe(true);
  await expect(page.locator('.d-p[data-idx="2"]')).toContainText('retenu ici a priori');
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

test("docx: le texte d'une bulle s'annote comme la page : au chat avec son repère, ou en réponse qui cite le passage", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, project);
  await page.evaluate(() => {
    const w = window as unknown as {__atelierPost: () => void; __sent?: Record<string, unknown>[]; AtelierStudioCore?: Record<string, unknown>};
    w.__atelierPost = () => {};
    w.__sent = [];
    w.AtelierStudioCore = {...(w.AtelierStudioCore || {}), requestChatAttachment: (o: {payload: Record<string, unknown>}) => { w.__sent!.push(o.payload); return Promise.resolve(); }};
  });
  const thread = page.locator('#cards .it[data-key="c1"]');
  await thread.locator('.cc').click();
  await expect(thread).toHaveClass(/\bon\b/);
  // Un glisser à la souris dans sa propre réponse la sélectionne, sans la passer en modification.
  const mine = thread.locator('.tx.mine').first();
  await expect(mine).toHaveText("D'accord, je l'ajoute en annexe.");
  // La fiche ouverte glisse en face de son passage : on attend qu'elle soit posée.
  let last = '';
  await expect.poll(async () => { const now = JSON.stringify(await mine.boundingBox()); const still = now === last; last = now; return still; }, {intervals: [100]}).toBe(true);
  const box = await mine.evaluate((el) => {
    const t = el.firstChild as Text;
    const k = t.data.indexOf('je');
    const r = document.createRange();
    r.setStart(t, k); r.setEnd(t, k + 1);
    const a = r.getBoundingClientRect();
    r.setStart(t, t.data.indexOf('annexe') + 5); r.setEnd(t, t.data.indexOf('annexe') + 6);
    const b = r.getBoundingClientRect();
    return {x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2};
  });
  await page.mouse.move(box.x1, box.y1);
  await page.mouse.down();
  await page.mouse.move((box.x1 + box.x2) / 2, box.y2, {steps: 4});
  await page.mouse.move(box.x2, box.y2, {steps: 4});
  await page.mouse.up();
  await expect(thread.locator('textarea.c-edit')).toHaveCount(0);
  const bar = page.locator('#bubbar.atelier-selection');
  await expect(bar).toBeVisible();
  await expect(page.locator('#selbar')).toBeHidden();
  // Ni surligneur ni soulignement : une bulle n'est pas le texte du document.
  await expect(bar.locator('[aria-label="Surligner"], [data-mark]')).toHaveCount(0);
  await bar.locator('[aria-label="Ajouter au chat"]').click();
  const note = page.locator('.nbox.show textarea');
  await expect(note).toBeFocused();
  await expect(page.locator('.nbox .nb-src')).toContainText('Bulle de Thierry');
  await expect(page.locator('.nbox .nb-src')).toContainText("« je l'ajoute en annexe »");
  await note.fill('Quelle annexe ?');
  await note.press('Enter');
  await expect(page.locator('.nbox.show')).toHaveCount(0);
  const sent = await page.evaluate(() => (window as unknown as {__sent: {text: string; path: string}[]}).__sent);
  expect(sent).toHaveLength(1);
  expect(sent[0].path).toBe(project.doc);
  expect(sent[0].text).toMatch(/\(p\d+, bulle de Thierry\) : « je l'ajoute en annexe »\nCommentaire : Quelle annexe \?$/);
  // Le passage garde son numéro dans la bulle tant qu'il attend dans la boîte du chat.
  await expect(page.locator('#chatnums i')).toHaveText(['1']);
  await page.evaluate(() => window.postMessage({type: 'atelier-chat-pending', texts: []}, '*'));
  await expect(page.locator('#chatnums i')).toHaveCount(0);

  // Dans la bulle de Christophe : ⌘Entrée répond dans le fil en citant le passage.
  const before = (await disk(page, project)).comments.length;
  await thread.locator('.cc > .tx').evaluate((el) => {
    const t = el.firstChild as Text;
    const k = t.data.indexOf('0,6 et pas 0,5');
    const r = document.createRange();
    r.setStart(t, k); r.setEnd(t, k + '0,6 et pas 0,5'.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await bar.locator('[aria-label="Annoter"]').click();
  await expect(page.locator('.nbox .nb-src')).toContainText('Bulle de Christophe');
  await page.locator('.nbox.show textarea').fill('Testé : 0,5 garde trop de pixels mixtes.');
  await page.locator('.nbox.show textarea').press('ControlOrMeta+Enter');
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.parent === 1 && c.author === 'Thierry' && c.text.trim() === '« 0,6 et pas 0,5 » : Testé : 0,5 garde trop de pixels mixtes.')).toBe(true);
  expect((await disk(page, project)).comments.length).toBe(before + 1);
  expect((await page.evaluate(() => (window as unknown as {__sent: unknown[]}).__sent)).length).toBe(1);
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
  const view = async (label: string) => { await page.locator('#ddView').click(); await page.locator('.menu.show .mi', {hasText: label}).click(); };
  await view('Lecture');
  await expect(page.locator('#ddView')).toContainText('Lecture');
  await expect(page.locator('.d-p[data-idx="1"] .del').first()).toBeHidden();
  // Le texte nu : ni trait dans la marge, ni passage commenté peint ; les fiches restent.
  await expect(page.locator('#cbars')).toHaveCount(0);
  const cmt = page.locator('.cmt:not(.on):not(.done)').first();
  await expect(cmt).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('#cards .it').first()).toBeAttached();
  await view('Original');
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'false');
  await view('Révision');
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'true');

  // Page Thème, gardée côté serveur.
  await view("Thème de l'app");
  await expect(page.locator('body')).not.toHaveClass(/blanche/);
  await expect.poll(async () => (await (await page.request.get(`${project.url}/docx/prefs`)).json()).page).toBe('theme');

  // L'interrupteur garde sa piste de 28 px : la pastille de ruban (.sw) ne
  // l'écrase plus, et son bouton rond reste dedans, à gauche du libellé.
  const sw = await page.evaluate(() => {
    const t = document.getElementById('btnTrack')!;
    const box = (el: Element) => el.getBoundingClientRect();
    const r = document.createRange();
    r.selectNodeContents(t.lastChild!);
    const track = box(t.querySelector('.sw')!), knob = box(t.querySelector('.sw i')!), label = r.getBoundingClientRect();
    return {w: track.width, knobIn: knob.left >= track.left - 0.5 && knob.right <= track.right + 0.5, gap: label.left - track.right};
  });
  expect(sw.w).toBe(28);
  expect(sw.knobIn).toBe(true);
  expect(sw.gap).toBeGreaterThanOrEqual(6);

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

/** Fichier des retouches de l'agent signées du nom de l'utilisateur
 *  (atelier_docx::marks) : même dossier et même nom que les brouillons. */
async function marksFile(doc: string): Promise<string> {
  const canon = await realpath(doc);
  return path.join(tmpdir(), `atelier-docx-${createHash('sha256').update(canon).digest('hex').slice(0, 16)}.agent.json`);
}

test("docx: une retouche de Claude signée Thierry reste marquée « proposé par Claude » dans le panneau", async ({page, project}) => {
  await open(page, project);
  const m = await disk(page, project);
  // Ce que fait l'outil de l'agent : suivi au nom de Thierry, signature notée à part.
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Thierry', op: {op: 'replace', find: 'compromis', with: 'équilibre'}}});
  expect(r.ok()).toBe(true);
  const after = await disk(page, project);
  const known = new Set(m.changes.map(c => c.id));
  const mine = after.changes.filter(c => !known.has(c.id));
  expect(mine.length).toBeGreaterThan(0);
  expect(mine.every(c => c.author === 'Thierry')).toBe(true);
  await writeFile(await marksFile(project.doc), JSON.stringify([{agent: 'Claude', author: 'Thierry', date: mine[0].date}]));
  try {
    await page.reload();
    await expect(page.locator('.d-p[data-idx="2"] .ins', {hasText: 'équilibre'})).toBeVisible();
    await expect(page.locator('#foot')).toContainText('de Claude en attente');
    // La teinte de l'agent, pas celle de Thierry ; l'infobulle dit les deux.
    const tint = await page.locator('.d-p[data-idx="2"] .ins', {hasText: 'équilibre'}).evaluate(el => (el as HTMLElement).style.getPropertyValue('--rev-color'));
    expect(tint).toContain('--doc-agent');
    const row = page.locator(`#cards .it.grp[data-ids~="${mine[0].id}"]`);
    await row.locator('.row').click();
    await expect(row.locator(`.cr[data-ch="${mine[0].id}"]`)).toHaveAttribute('data-tooltip', /^Thierry · proposé par Claude · /);
  } finally {
    await writeFile(await marksFile(project.doc), '[]');
  }
});

test("docx: une bulle que Claude a touchée porte un point jusqu'à ce qu'on l'ouvre", async ({page, project}) => {
  await open(page, project);
  const m0 = await disk(page, project);
  // Une bulle au nom de Thierry (comme celles que l'agent écrit pour lui)…
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m0.revision, author: 'Thierry', op: {op: 'comment', paragraph: 'p2', find: 'compromis', text: 'Exposants −4 et −6.'}}});
  expect(r.ok()).toBe(true);
  const c = (await disk(page, project)).comments.find(x => x.text === 'Exposants −4 et −6.')!;
  // … que l'outil de l'agent note « non lue » (atelier_docx::unread), à part du .docx.
  const file = await draftsFile(project.doc, 'unread');
  await writeFile(file, JSON.stringify([{author: c.author, date: c.date}]));
  try {
    await page.reload();
    const card = page.locator(`#cards .it[data-key="c${c.id}"]`);
    await expect(card.locator('.qt .nl')).toBeVisible();
    // Le point ne montre plus l'auteur : la bulle de Christophe n'en a pas.
    await expect(page.locator('#cards .it[data-key="c1"] .qt .nl')).toHaveCount(0);
    await expect(page.locator('#btnLane')).toHaveClass(/\bunread\b/);
    await expect(page.locator('#btnLane')).toHaveAttribute('data-tooltip', /1 pas encore lu/);
    // Ouverte : le point s'efface, ici et sur le serveur.
    await card.locator('.cc').click();
    await expect(card.locator('.nl')).toHaveCount(0);
    await expect(page.locator('#btnLane')).not.toHaveClass(/\bunread\b/);
    await expect.poll(async () => (await disk(page, project)).unreadComments).toEqual([]);
    await page.reload();
    await expect(page.locator(`#cards .it[data-key="c${c.id}"]`)).toBeVisible();
    await expect(page.locator('#cards .nl')).toHaveCount(0);
  } finally {
    await writeFile(file, '[]');
  }
});

test("docx: des rubans de couleur sur les cartes, gardés à la réouverture, filtrés dans la liste et parcourus au clavier", async ({page, project}) => {
  await open(page, project);
  const m0 = await disk(page, project);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m0.revision, author: 'Christophe', op: {op: 'comment', paragraph: 'p5', find: 'large bande', text: 'Vérifier les coefficients de bande.'}}});
  expect(r.ok()).toBe(true);
  const c2 = (await disk(page, project)).comments.find(x => x.text === 'Vérifier les coefficients de bande.')!;
  await page.reload();
  const first = page.locator('#cards .it[data-key="c1"]');
  const second = page.locator(`#cards .it[data-key="c${c2.id}"]`);
  const marks = async () => (await disk(page, project)).bookmark?.marks ?? [];
  // Aucun ruban : seulement un contour qui apparaît au survol.
  await expect(page.locator('#cards .rb.on')).toHaveCount(0);
  await first.locator('.cc').hover();
  await expect.poll(() => first.locator('.rb').evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
  // Un clic sur le ruban fantôme pose un ruban gris, sans ouvrir la carte.
  await first.locator('.rb').click();
  await expect(first.locator('.rb')).toHaveClass(/\bon\b/);
  await expect(first).not.toHaveClass(/\bon\b/);
  await expect.poll(marks).toEqual([{id: 1, color: 'gris'}]);
  // Un clic sur le ruban posé ouvre ses couleurs : rouge.
  await first.locator('.rb').click();
  const menu = page.locator('.menu.show');
  await expect(menu.locator('.mi-cell:not(.danger)')).toHaveCount(5);
  await expect(menu.locator('.mi-cell.danger')).toHaveAttribute('aria-label', 'Retirer le ruban (⌘D)');
  await menu.locator('.mi-cell[aria-label^="Rouge"]').click();
  await expect(first.locator('.rb')).toHaveAttribute('data-tab', 'rouge');
  await expect.poll(marks).toEqual([{id: 1, color: 'rouge'}]);
  // ⌘D puis ⌥⌘5 sur une autre carte ouverte : un second ruban, bleu ; le premier reste.
  await second.locator('.cc').click();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(second.locator('.rb')).toHaveAttribute('data-tab', 'gris');
  await page.keyboard.press('ControlOrMeta+Alt+Digit5');
  await expect(second.locator('.rb')).toHaveAttribute('data-tab', 'bleu');
  await expect(first.locator('.rb')).toHaveAttribute('data-tab', 'rouge');
  await expect.poll(marks).toEqual([{id: 1, color: 'rouge'}, {id: c2.id, color: 'bleu'}]);
  // Rien dans le .docx : les rubans vivent dans l'historique d'Atelier.
  expect((await readFile(project.doc)).includes(Buffer.from('rouge'))).toBe(false);
  // Réouverture : les rubans sont là ; la liste les rappelle et filtre par couleur.
  await page.reload();
  await expect(first.locator('.rb')).toHaveAttribute('data-tab', 'rouge');
  await expect(second.locator('.rb')).toHaveAttribute('data-tab', 'bleu');
  await page.locator('#tabCom').click();
  await expect(page.locator('#pane .cl[data-key="c1"] .sgl')).toHaveAttribute('data-tab', 'rouge');
  await expect(page.locator('#pane .tf .f')).toHaveCount(3);
  await page.locator('#pane .tf .f[data-tab="bleu"]').click();
  await expect(page.locator('#pane .cl')).toHaveCount(1);
  await expect(page.locator(`#pane .cl[data-key="c${c2.id}"]`)).toBeVisible();
  await page.locator('#pane .tf .f[data-tab=""]').click();
  await expect(page.locator('#pane .cl')).toHaveCount(2);
  // ⇧⌘D passe d'un ruban au suivant, dans l'ordre du document.
  await page.keyboard.press('ControlOrMeta+Shift+d');
  await expect(first).toHaveClass(/\bon\b/);
  await page.keyboard.press('ControlOrMeta+Shift+d');
  await expect(second).toHaveClass(/\bon\b/);
  // ⌘D sur la carte ouverte retire son ruban ; « Retirer » du menu, l'autre.
  await page.keyboard.press('ControlOrMeta+d');
  await expect(second.locator('.rb')).not.toHaveClass(/\bon\b/);
  await page.keyboard.press('Escape');
  await first.locator('.rb').click();
  await page.locator('.menu.show .mi-cell.danger').click();
  await expect(page.locator('#cards .rb.on')).toHaveCount(0);
  await expect(page.locator('#pane .tf')).toHaveCount(0);
  await expect.poll(marks).toEqual([]);
});

/** Fichier des brouillons de réponse de l'agent (atelier_docx::drafts), ou de
 *  ses vérifications finies (`checks`) : dossier temporaire, nommé d'après le
 *  chemin canonique du document. */
async function draftsFile(doc: string, kind = 'drafts'): Promise<string> {
  const canon = await realpath(doc);
  return path.join(tmpdir(), `atelier-docx-${createHash('sha256').update(canon).digest('hex').slice(0, 16)}.${kind}.json`);
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
  // Arrêter : un bouton icône (carré), plus de mot, et il ne chevauche pas les trois points.
  const stop = thread.locator('.c-wait [data-act="stop"]');
  await expect(stop).toBeVisible();
  await expect(stop).toHaveAttribute('aria-label', 'Arrêter le brouillon');
  await expect(thread.locator('.c-wait')).not.toContainText('Arrêter');
  const [dots, sq] = await Promise.all([thread.locator('.c-wait .dots').boundingBox(), stop.boundingBox()]);
  expect(dots!.x + dots!.width).toBeLessThanOrEqual(sq!.x);
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
  // Le brouillon est simplement dans le champ : aucune ligne de plus autour.
  await expect(field).toHaveAttribute('aria-label', 'Brouillon de Claude à relire, réponse à Christophe');
  await expect(thread.locator('.c-by, .c-fix')).toHaveCount(0);
  await expect(thread.locator('.c-field.ad [data-act="redo"]')).toHaveAttribute('aria-label', 'Demander une autre formulation');
  await expect(thread.locator('.c-wait')).toHaveCount(0);
  expect((await disk(page, project)).revision).toBe(before);
  // La correction en suivi : un crayon et son nombre au bout de la rangée du bas.
  const fx = thread.locator('.ac [data-act="see-fix"]');
  await expect(fx).toHaveText('1');
  await expect(fx).toHaveAttribute('aria-label', '1 correction de Claude en suivi · voir');

  // Un passage du brouillon s'annote comme le texte des bulles : même capsule.
  const pick = async (word: string) => field.evaluate((ta: HTMLTextAreaElement, w) => {
    ta.focus();
    const k = ta.value.indexOf(w);
    ta.setSelectionRange(k, k + w.length);
  }, word);
  const bar = page.locator('#bubbar.atelier-selection');
  await pick('annexe B');
  await expect(bar).toBeVisible();
  await expect(page.locator('#selbar')).toBeHidden();
  // La capsule se pose au-dessus du champ, pas ailleurs dans la page.
  const [bb, fb] = await Promise.all([bar.boundingBox(), field.boundingBox()]);
  expect(bb!.y + bb!.height).toBeLessThanOrEqual(fb!.y + fb!.height);
  expect(bb!.y + bb!.height).toBeGreaterThan(fb!.y - 48);
  await bar.locator('[aria-label="Ajouter au chat"]').click();
  // Une ligne et deux icônes : ni ligne d'origine ni boutons écrits.
  const line = page.locator('.nbox.line.show');
  await expect(line).toBeVisible();
  await expect(line.locator('.nb-src, .btn, kbd')).toHaveCount(0);
  await expect(line.locator('textarea')).toHaveAttribute('aria-label', 'Ta note sur « annexe B »');
  await expect(line.locator('[data-act="doc"]')).toHaveAttribute('aria-label', 'Faire retoucher par Claude');
  // La ligne se pose sous le champ du brouillon, sans le couvrir.
  const [lb, fb2] = await Promise.all([line.boundingBox(), field.boundingBox()]);
  expect(lb!.y).toBeGreaterThanOrEqual(fb2!.y + fb2!.height);
  expect(lb!.height).toBeLessThanOrEqual(40);
  // Le passage noté reste marqué dans le brouillon pendant qu'on écrit.
  await expect(page.locator('#draftmarks i')).toHaveCount(1);
  await line.locator('textarea').fill('Laquelle exactement ?');
  await line.locator('[data-act="chat"]').click();
  await expect(page.locator('#draftmarks i')).toHaveCount(0);
  await expect(page.locator('.nbox.show')).toHaveCount(0);
  const toChatSent = await page.evaluate(() => (window as unknown as {__sent: {text: string}}).__sent);
  expect(toChatSent.text).toMatch(/brouillon de réponse à Christophe\) : « annexe B »\nCommentaire : Laquelle exactement \?$/);
  await expect(field).toHaveValue("Bonne remarque, j'ajoute l'analyse en annexe B.");
  // Entrée (le robot) : l'agent retouche son brouillon selon la note sur le passage.
  await pick('annexe B');
  await bar.locator('[aria-label="Annoter"]').click();
  await page.locator('.nbox.show textarea').fill('cite plutôt la section 4.2');
  await page.locator('.nbox.show textarea').press('Enter');
  await expect(thread.locator('.c-wait')).toBeVisible();
  const redo = await page.evaluate(() => (window as unknown as {__sent: {text: string; direct: boolean}}).__sent);
  expect(redo.direct).toBe(true);
  expect(redo.text).toContain("Bonne remarque, j'ajoute l'analyse en annexe B.");
  expect(redo.text).toContain('Dans ton brouillon, le passage « annexe B » : cite plutôt la section 4.2');
  await writeFile(file, JSON.stringify({1: {text: "Bonne remarque, j'ajoute l'analyse en annexe B.", author: 'Claude', at: Date.now() + 1}}));
  await expect(field).toHaveValue("Bonne remarque, j'ajoute l'analyse en annexe B.", {timeout: 6000});

  // Relu et retouché, il part signé Thierry ; le brouillon disparaît.
  await field.fill("Bonne remarque, j'ajoute l'analyse en annexe B. Merci !");
  await thread.locator('[data-act="reply"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.parent === 1 && c.author === 'Thierry' && c.text.endsWith('annexe B. Merci !'))).toBe(true);
  expect((await disk(page, project)).comments.some(c => c.author === 'Claude')).toBe(false);
  await expect.poll(() => existsSync(file)).toBe(false);
  await expect(thread.locator('.c-field.ad')).toHaveCount(0);
  await expect(thread.locator('[data-act="propose"]')).toBeVisible();
});

test("docx: l'icône à côté de son commentaire le fait vérifier dans le chat, et l'agent le corrige à son nom", async ({page, project}) => {
  await open(page, project);
  await page.evaluate(() => {
    const w = window as unknown as {__atelierPost: () => void; __sent?: Record<string, unknown>; AtelierStudioCore?: Record<string, unknown>};
    w.__atelierPost = () => {};
    w.AtelierStudioCore = {...(w.AtelierStudioCore || {}), requestChatAttachment: (o: {payload: Record<string, unknown>}) => { w.__sent = o.payload; return Promise.resolve(); }};
  });
  // Un commentaire de Thierry sur un chiffre du texte.
  const m0 = await disk(page, project);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m0.revision, author: 'Thierry', op: {op: 'comment', paragraph: 'p2', find: 'compromis', text: 'Ici tu écris 0,000697 mais en haut 0,00618'}}});
  expect(r.ok()).toBe(true);
  const id = (await disk(page, project)).comments.find(c => c.text === 'Ici tu écris 0,000697 mais en haut 0,00618')!.id;
  const card = page.locator(`#cards .it[data-key="c${id}"]`);
  await expect(card).toBeVisible({timeout: 6000});
  await card.locator('.cc').click();
  // Sur le sien, une icône à côté du texte le fait vérifier dans le chat.
  const vf = card.locator('.c-line > .vf[data-act="check"]');
  await expect(vf).toHaveAttribute('aria-label', 'Vérifier dans le chat');
  await vf.click();
  await expect(vf.locator('.dots')).toBeVisible();
  const sent = await page.evaluate(() => (window as unknown as {__sent: {text: string; direct: boolean; path: string}}).__sent);
  expect(sent.direct).toBe(true);
  expect(sent.path).toBe(project.doc);
  expect(sent.text).toContain('mon commentaire sur « compromis » : Ici tu écris 0,000697 mais en haut 0,00618');
  expect(sent.text).toContain(`edit_comment (comment=${id})`);
  expect(sent.text).toContain(`checked (comment=${id})`);
  // Juste : l'agent dit avoir fini (atelier_docx checked) et l'icône revient.
  await writeFile(await draftsFile(project.doc, 'checks'), JSON.stringify({[id]: Date.now()}));
  await expect(vf.locator('.dots')).toHaveCount(0, {timeout: 6000});
  await expect(vf).toHaveAttribute('aria-label', 'Vérifier dans le chat');
  // À revoir : l'agent le corrige (atelier_docx edit_comment), toujours signé Thierry ;
  // le chiffre changé luit, l'icône revient.
  await vf.click();
  await expect(vf.locator('.dots')).toBeVisible();
  const m1 = await disk(page, project);
  const e = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m1.revision, author: 'Thierry', op: {op: 'edit_comment', id, text: 'Ici tu écris 0,0000697 mais en haut 0,00618'}}});
  expect(e.ok()).toBe(true);
  await expect(card.locator('.c-line > .tx')).toHaveText('Ici tu écris 0,0000697 mais en haut 0,00618', {timeout: 6000});
  await expect(card.locator('.c-line > .tx .chg')).toHaveText('0,0000697');
  await expect(vf.locator('.dots')).toHaveCount(0);
  await expect(card.locator('.c-line > .tx .chg')).toHaveCount(0, {timeout: 4000});
  const c1 = page.locator('#cards .it[data-key="c1"]');
  await c1.locator('.cc').click();
  // Commentaire de Christophe : pas de vérification ; « Envoyer au chat » est au survol de son en-tête.
  await c1.locator('.cc > .hd').hover();
  await expect(c1.locator('.cc > .hd [data-act="ask"]')).toBeVisible();
  await expect(c1.locator('[data-act="check"]')).toHaveCount(0);
  await rm(await draftsFile(project.doc, 'checks'), {force: true});
});

test('docx: au survol d\'un message, ses icônes l\'effacent seul ou tout le fil, et le toast annule', async ({page, project}) => {
  await open(page, project);
  const before = await disk(page, project);
  const c1 = before.comments.find(c => c.id === 1)!;
  const reply = before.comments.find(c => c.parent === 1)!;
  expect(reply).toBeTruthy();
  const card = page.locator('#cards .it[data-key="c1"]');
  await card.locator('.cc').click();
  // Plus de poubelle ni de bulle dans la rangée du bas : Résoudre seul.
  await expect(card.locator('.ac [data-act="delete"], .ac [data-act="ask"]')).toHaveCount(0);
  // Champ de réponse : vide, une ligne avec ses icônes à droite ; avec du
  // texte, toute la largeur, les icônes en bas à droite.
  const field = card.locator('.c-field textarea');
  await expect(field).toHaveCSS('padding-right', '44px');
  await field.fill('Une réponse assez longue pour passer à la ligne dans la carte de commentaire.');
  await expect(field).toHaveCSS('padding-right', '8px');
  const fb = (await field.boundingBox())!, ib = (await card.locator('.c-field .in.ic').boundingBox())!;
  expect(ib.y + ib.height).toBeGreaterThan(fb.y + fb.height - 8);
  await field.fill('');
  // Les icônes sont invisibles au repos, posées sur la date au survol ; rien ne bouge.
  const rp = card.locator('.rp').first();
  const more = rp.locator('.mo');
  const dt = rp.locator('.dt');
  const gap = async () => (await rp.boundingBox())!.x + (await rp.boundingBox())!.width - (await dt.boundingBox())!.x;
  await page.mouse.move(5, 5);
  await expect(more).toHaveCSS('opacity', '0');
  await page.waitForTimeout(400); // la carte finit de se placer
  const g0 = await gap();
  await rp.hover();
  await expect(more).toHaveCSS('opacity', '1');
  expect(await gap()).toBe(g0);
  // Sa propre réponse : crayon et poubelle, pas de bulle (elle est au commentaire de tête).
  await expect(more.locator('[data-act]')).toHaveCount(2);
  await expect(more.locator('[data-act="del-msg"]')).toHaveAttribute('aria-label', 'Supprimer cette réponse');
  await more.locator('[data-act="del-msg"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.map(c => c.id)).not.toContain(reply.id);
  expect((await disk(page, project)).comments.some(c => c.id === 1)).toBe(true);
  await expect(card.locator('.rp')).toHaveCount(0);
  // Le toast annule : la réponse revient.
  const toast = page.locator('#toast.show');
  await expect(toast).toContainText('Réponse supprimée');
  await toast.locator('.ub').click();
  await expect.poll(async () => (await disk(page, project)).comments.map(c => c.id)).toContain(reply.id);
  // La poubelle du commentaire de tête supprime tout le fil (l'infobulle dit combien).
  await card.locator('.cc').click();
  const hd = card.locator('.cc > .hd');
  await hd.hover();
  const n = 1 + before.comments.filter(c => c.parent === 1).length;
  await expect(hd.locator('[data-act="del-msg"]')).toHaveAttribute('aria-label', `Supprimer le fil · ${n} messages`);
  await hd.locator('[data-act="del-msg"]').click();
  await expect.poll(async () => (await disk(page, project)).comments.filter(c => c.id === 1 || c.parent === 1).length).toBe(0);
  await expect(page.locator('#toast.show')).toContainText('Fil supprimé');
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await disk(page, project)).comments.some(c => c.id === c1.id)).toBe(true);
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

test("docx: une figure remplacée par l'agent : l'ancienne barrée, la nouvelle à sa place et à sa largeur, puis seule une fois acceptée", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await writeFile(path.join(project.root, 'barres.png'), PNG);
  await open(page, project);
  const m = await disk(page, project);
  const idx = m.paragraphs.findIndex(p => p.segments.some(s => s.media));
  const old = page.locator(`.d-p[data-idx="${idx}"] .chip.fig img`);
  await expect(old).toHaveCount(1);
  const width = await old.evaluate(i => i.getBoundingClientRect().width);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Claude', op: {op: 'replace_image', paragraph: `p${idx}`, index: 0, path: 'barres.png'}}});
  expect(r.ok(), await r.text()).toBe(true);
  // Même paragraphe : l'ancienne barrée, la nouvelle ajoutée juste après.
  const gone = page.locator(`.d-p[data-idx="${idx}"] .chip.fig.del img`);
  const added = page.locator(`.d-p[data-idx="${idx}"] .chip.fig.ins img`);
  await expect(gone).toBeVisible({timeout: 6000});
  await expect(added).toBeVisible();
  expect(await added.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2);
  // Largeur de l'ancienne, proportions de la nouvelle (2:1).
  const box = await added.evaluate(i => { const b = i.getBoundingClientRect(); return {w: b.width, h: b.height}; });
  expect(Math.abs(box.w - width)).toBeLessThan(1);
  expect(Math.abs(box.h - width / 2)).toBeLessThan(1.5);
  // Un seul geste dans la marge : accepter le tout ne garde que la nouvelle.
  const agent = (await disk(page, project)).changes.filter(c => c.author === 'Claude');
  expect(agent.map(c => c.kind).sort()).toEqual(['del', 'ins']);
  await page.locator(`#cards .it.grp[data-ids~="${agent[0].id}"] [data-act="acceptAll"]`).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[idx].segments.filter(s => s.media).map(s => s.rev ?? '')).toEqual(['']);
  await expect(page.locator(`.d-p[data-idx="${idx}"] .chip.fig img`)).toHaveCount(1);
  await expect(page.locator(`.d-p[data-idx="${idx}"] .chip.fig.del`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Figure à la main : la copie de Christophe porte une retouche en attente
// dans la légende ; on règle tout d'abord, comme avant de bouger une figure.
async function settled(page: Page, project: {url: string; doc: string}) {
  const m = await disk(page, project);
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Thierry', tracked: false, op: {op: 'accept_all'}}});
  expect(r.ok(), await r.text()).toBe(true);
  await open(page, project);
  return disk(page, project);
}
const figAt = (m: Model, live = true) => m.paragraphs.findIndex(p => p.segments.some(s => s.media && (live ? s.rev !== 'del' : s.rev === 'del')));

test("docx: une figure se déplace à la main avec sa légende, en suivi, et se règle d'un seul geste", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const m0 = await settled(page, project);
  const from = figAt(m0);
  expect(m0.paragraphs[from + 1].text).toContain('Figure 2.4');
  expect(m0.changes).toEqual([]);

  // Un clic la prend : cadre, poignées, capsule « Figure et légende ».
  await page.locator(`.d-p[data-idx="${from}"] .chip.fig img`).click();
  await expect(page.locator('body')).toHaveClass(/fig-on/);
  await expect(page.locator('#figui .fg-cap')).toContainText('Figure et légende');
  await expect(page.locator('#figui .fg-h')).toHaveCount(4);

  // ⌥↑ : un paragraphe plus haut, la légende suit, l'ancienne place reste barrée.
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(async () => figAt(await disk(page, project))).toBeLessThan(from);
  let m = await disk(page, project);
  const to = figAt(m);
  expect(m.paragraphs[to + 1].text).toContain('Figure 2.4');
  expect(figAt(m, false)).toBeGreaterThan(to);
  expect(m.changes.length).toBe(4);
  expect(new Set(m.changes.map(c => (c as {group?: number}).group)).size).toBe(1);
  // Une seule fiche dans la marge, une seule modification au compteur.
  await expect(page.locator('#cards .ch.mv')).toHaveCount(1);
  await expect(page.locator('#cards .ch.mv')).toContainText('Figure déplacée');
  await expect(page.locator('#cards .it.grp')).toHaveCount(1);
  await expect(page.locator('#ftOpen')).toContainText('1 modification');
  // Elle reste prise à sa nouvelle place.
  await expect(page.locator('body')).toHaveClass(/fig-on/);
  await expect(page.locator(`.d-p[data-idx="${to}"] .chip.fig.ins img`)).toBeVisible();

  // Lecture : l'ancienne place ne laisse ni figure ni ligne vide.
  await page.locator('#ddView').click();
  await page.locator('.menu.show .mi', {hasText: 'Lecture'}).click();
  await expect(page.locator('#paper .d-p.mv-old').first()).toBeHidden();
  await expect(page.locator('#paper .chip.fig img:visible')).toHaveCount(1);
  await page.locator('#ddView').click();
  await page.locator('.menu.show .mi', {hasText: 'Révision'}).click();
  await expect(page.locator('#paper .d-p.mv-old').first()).toBeVisible();

  // Refuser la fiche la remet à sa place, sans trace.
  await page.locator('#cards .ch.mv [data-act="rejectAll"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.length).toBe(0);
  m = await disk(page, project);
  expect(figAt(m)).toBe(from);
  expect(m.paragraphs.map(p => p.text)).toEqual(m0.paragraphs.map(p => p.text));

  // Glisser à la souris : la barre d'atterrissage suit, le lâcher la pose.
  const img = page.locator(`.d-p[data-idx="${from}"] .chip.fig img`);
  await expect(img).toBeVisible();
  await page.locator('#scroll').evaluate(el => { el.scrollTop = 0; });
  const a = (await img.boundingBox())!;
  const dest = (await page.locator('.d-p[data-idx="1"]').boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 20, {steps: 4});
  await page.mouse.move(dest.x + 80, dest.y + 4, {steps: 8});
  await expect(page.locator('body')).toHaveClass(/fig-drag/);
  await expect(page.locator('.fg-ghost')).toHaveClass(/on/);
  await expect(page.locator('#figui .fg-bar')).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => figAt(await disk(page, project))).toBe(1);
  await expect(page.locator('body')).not.toHaveClass(/fig-drag/);
  // Accepter : la figure et sa légende à la nouvelle place, plus rien à l'ancienne.
  await page.locator('#cards .ch.mv [data-act="acceptAll"]').click();
  await expect.poll(async () => (await disk(page, project)).changes.length).toBe(0);
  m = await disk(page, project);
  expect(figAt(m)).toBe(1);
  expect(m.paragraphs[2].text).toContain('Figure 2.4');
  expect(m.paragraphs.filter(p => p.segments.some(s => s.media)).length).toBe(1);
  expect(m.paragraphs.length).toBe(m0.paragraphs.length);
  await expect(page.locator('#paper .chip.fig img')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("docx: une figure prise à la main : taille par un coin, texte de remplacement, alignement, suppression", async ({page, project}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const m0 = await settled(page, project);
  const idx = figAt(m0);
  const seg = async () => (await disk(page, project)).paragraphs[idx].segments.find(s => s.media && s.rev !== 'del') as {width?: number; height?: number; alt?: string} | undefined;
  const w0 = (await seg())!.width!;
  const h0 = (await seg())!.height!;
  const img = page.locator(`.d-p[data-idx="${idx}"] .chip.fig:not(.del) img`);
  await img.click();
  await expect(page.locator('body')).toHaveClass(/fig-on/);

  // Tirer le coin bas-droit vers l'intérieur : plus petite, mêmes proportions.
  const h = (await page.locator('#figui .fg-h.br').boundingBox())!;
  const b = (await img.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 - b.width / 4, h.y + h.height / 2 - b.height / 4, {steps: 6});
  await expect(page.locator('.fg-tip')).toHaveClass(/on/);
  await expect(page.locator('.fg-tip')).toContainText('cm');
  await page.mouse.up();
  await expect.poll(async () => (await seg())!.width!).toBeLessThan(w0 - 4);
  const s1 = (await seg())!;
  expect(Math.abs(s1.width! / s1.height! - w0 / h0)).toBeLessThan(0.05);
  await expect(page.locator('body')).toHaveClass(/fig-on/);
  // Échap pendant un geste l'annule : la taille ne bouge pas.
  const h2 = (await page.locator('#figui .fg-h.br').boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x + 40, h2.y + 40, {steps: 4});
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await seg())!.width).toBe(s1.width);

  // Menu de la figure : texte de remplacement.
  await page.locator('#figui .fg-cap [data-act="more"]').click();
  await expect(page.locator('.menu.show .mi')).toHaveCount(6);
  await page.locator('.menu.show .mi', {hasText: 'Texte de remplacement'}).click();
  await page.getByRole('textbox', {name: /Texte de remplacement/}).fill('Fraction de glace par zone, 2019');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await seg())!.alt).toBe('Fraction de glace par zone, 2019');
  await expect(img).toHaveAttribute('alt', 'Fraction de glace par zone, 2019');

  // Alignement : la coche suit.
  await page.locator('#figui .fg-cap [data-act="more"]').click();
  await page.locator('.menu.show .mi', {hasText: 'Aligner à droite'}).click();
  await expect.poll(async () => (await disk(page, project)).paragraphs[idx].align).toBe('right');
  await page.locator('#figui .fg-cap [data-act="more"]').click();
  await expect(page.locator('.menu.show .mi', {has: page.locator('svg')})).toHaveText('Aligner à droite');
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu.show')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/fig-on/);

  // Retour arrière : supprimée en suivi, plus rien de pris.
  await page.keyboard.press('Backspace');
  await expect.poll(async () => figAt(await disk(page, project))).toBe(-1);
  expect(figAt(await disk(page, project), false)).toBe(idx);
  await expect(page.locator('body')).not.toHaveClass(/fig-on/);
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

// Numéros de ligne et figures hors de toute feuille (texte qui déborde dans
// le pied de page, figure à cheval sur deux feuilles).
const overflowing = (page: Page) => page.evaluate(() => {
  const sheets = Array.from(document.querySelectorAll('#sheets .sheet')).map(e => e.getBoundingClientRect());
  const inside = (r: DOMRect) => sheets.some(s => r.top >= s.top - 1 && r.bottom <= s.bottom + 1);
  const bad: string[] = [];
  for (const e of Array.from(document.querySelectorAll('#lnums span'))) if (!inside(e.getBoundingClientRect())) bad.push(`ligne ${e.textContent}`);
  for (const e of Array.from(document.querySelectorAll('#paper .chip.fig img'))) if (!inside(e.getBoundingClientRect())) bad.push('figure');
  return bad;
});

test("docx: accepter une modification loin d'un tableau coupé en deux feuilles ne fait déborder ni le texte ni les figures", async ({page, project}) => {
  // Manuscrit de Thierry (2026-11-16) : après « accepter », au fil des
  // pages 30-31, le texte passait sous le pied de page et une figure
  // chevauchait l'intervalle entre deux feuilles. La rangée d'intervalle du
  // tableau, retirée par la mise en page complète, était mesurée hors de la
  // page : sa « position » valait le défilement, et la coupe sautait d'un
  // coup à la feuille affichée.
  await page.setViewportSize({width: 1400, height: 900});
  const m0 = await settled(page, project);
  const table = m0.paragraphs.findIndex(p => (p as {cell?: unknown}).cell);
  const fig = figAt(m0);
  expect(table).toBeGreaterThan(0);
  expect(fig).toBeGreaterThan(table);
  const long = 'Les glaciers tropicaux perdent leur masse plus vite que la moyenne mondiale, et leur albédo baisse à chaque saison sèche. ';
  const post = async (op: object, who = 'Thierry', tracked = false) => {
    const m = await disk(page, project);
    const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: who, tracked, op}});
    expect(r.ok(), await r.text()).toBe(true);
  };
  // Beaucoup de texte après le tableau, et la figure (avec sa légende) déplacée loin, page 8 environ.
  await post({op: 'batch', ops: Array.from({length: 24}, (_, k) => ({op: 'insert_paragraph', after: `p${fig + 1}`, text: `${24 - k}. ${long.repeat(4)}`}))});
  await post({op: 'move_figure', paragraph: `p${fig}`, to: `p${fig + 22}`, after: true});
  expect(figAt(await disk(page, project))).toBeGreaterThan(fig + 18);
  // Des lignes avant le tableau jusqu'à ce qu'une de ses rangées passe à la feuille suivante.
  await open(page, project);
  // Attendre que la page montre chaque ligne avant d'en ajouter une autre :
  // sinon (WebKit lent en CI) la vue saute plusieurs lignes d'un coup et le
  // tableau passe d'une feuille à l'autre sans jamais être vu à cheval.
  for (let k = 0; k < 40 && !(await page.locator('#paper tr.d-gap').count()); k++) {
    await post({op: 'insert_paragraph', after: 'p2', text: `Ligne ${k + 1}.`});
    await page.waitForFunction(t => Array.from(document.querySelectorAll('#paper .d-p')).some(e => e.textContent!.trim() === t), `Ligne ${k + 1}.`);
    await page.waitForTimeout(150);
  }
  await expect(page.locator('#paper tr.d-gap')).toHaveCount(1);
  // Christophe propose un ajout juste avant la figure.
  const m1 = await disk(page, project);
  const before = figAt(m1) - 1;
  await post({op: 'insert', paragraph: `p${before}`, at: 0, with: long.repeat(2)}, 'Christophe', true);
  await open(page, project);
  await expect(page.locator('#paper tr.d-gap')).toHaveCount(1);
  expect(await overflowing(page)).toEqual([]);
  // Thierry va à la modification (loin du tableau) et l'accepte.
  await page.locator('#btnAccept').click();
  await expect.poll(() => page.evaluate(() => document.getElementById('scroll')!.scrollTop)).toBeGreaterThan(3000);
  if ((await disk(page, project)).changes.length) await page.locator('#btnAccept').click();
  await expect.poll(async () => (await disk(page, project)).changes.length).toBe(0);
  await page.waitForTimeout(400);
  expect(await overflowing(page)).toEqual([]);
  // Changer de vue refait toute la mise en page, défilée au même endroit.
  await page.locator('#ddView').click();
  await page.locator('.menu.show .mi', {hasText: 'Lecture'}).click();
  await page.waitForTimeout(400);
  expect(await overflowing(page)).toEqual([]);
  const layout = () => page.evaluate(() => Array.from(document.querySelectorAll('#lnums span')).map(e => `${e.textContent}@${Math.round((e as HTMLElement).offsetTop)}`).join(' '));
  const live = await layout();
  await page.reload();
  await expect(page.locator('#sheets .sheet').nth(4)).toBeAttached();
  await page.waitForTimeout(400);
  expect(await layout()).toBe(live);
});

test("docx: la barre de marge d'un paragraphe retouché coupé sur deux feuilles s'arrête à chaque feuille", async ({page, project}) => {
  // Thierry (2026-11-16) : la barre mauve d'un paragraphe en suivi traversait
  // le saut de page, par-dessus l'intervalle entre deux feuilles.
  await open(page, project);
  const m = await disk(page, project);
  const long = 'Les glaciers tropicaux perdent leur masse plus vite que la moyenne mondiale, et leur albédo baisse à chaque saison sèche. ';
  const ops = Array.from({length: 10}, (_, k) => ({op: 'insert_paragraph', after: 'p2', text: `${k + 1}. ${long.repeat(6)}`}));
  const r = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m.revision, author: 'Thierry', tracked: false, op: {op: 'batch', ops}}});
  expect(r.ok()).toBe(true);
  await expect(page.locator('#paper .d-p span.d-gap').first()).toBeAttached({timeout: 6000});
  const idx = await page.evaluate(() => Number((document.querySelector('#paper .d-p span.d-gap')!.closest('.d-p') as HTMLElement).dataset.idx));
  // Christophe retouche ce paragraphe en suivi : il porte la barre.
  const m2 = await disk(page, project);
  const r2 = await page.request.post(`${project.url}/docx/op`, {data: {path: project.doc, revision: m2.revision, author: 'Christophe', tracked: true, op: {op: 'insert', paragraph: `p${idx}`, at: 3, with: 'très '}}});
  expect(r2.ok(), await r2.text()).toBe(true);
  const para = page.locator(`.d-p[data-idx="${idx}"]`);
  await expect(para).toHaveClass(/changed/, {timeout: 6000});
  await expect(para.locator('span.d-gap')).toHaveCount(1);
  // Trait mauve hors de l'intervalle entre les feuilles, de chaque côté.
  const bar = await para.evaluate(el => {
    const g = getComputedStyle(el, '::before');
    const box = el.getBoundingClientRect();
    const top = box.top + 4;
    const sheets = Array.from(document.querySelectorAll('#sheets .sheet')).map(s => s.getBoundingClientRect());
    const k = sheets.findIndex(s => s.top <= box.top && s.bottom > box.top);
    // Forme calculée : « couleur position » deux fois par segment.
    const pts = Array.from(g.backgroundImage.matchAll(/(rgba?\([^)]*\)) ([\d.]+)px/g)).map(x => ({c: x[1], y: top + Number(x[2])}));
    const stops: {c: string; a: number; b: number}[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) stops.push({c: pts[i].c, a: pts[i].y, b: pts[i + 1].y});
    return {img: g.backgroundImage, stops, gapTop: sheets[k].bottom, gapBottom: sheets[k + 1].top};
  });
  expect(bar.img).toContain('linear-gradient');
  const painted = bar.stops.filter(x => !/rgba\(0, 0, 0, 0\)/.test(x.c));
  expect(painted.length).toBe(2);
  for (const seg of painted) expect(seg.b <= bar.gapTop + 0.5 || seg.a >= bar.gapBottom - 0.5).toBe(true);
  expect(painted[0].b).toBeLessThanOrEqual(bar.gapTop + 0.5);
  expect(painted[1].a).toBeGreaterThanOrEqual(bar.gapBottom - 0.5);
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

test('docx: un lien du chat vers file.docx:N ouvre le document sur le paragraphe pN', async ({page, project}) => {
  // Le bilan des commentaires de l'agent renvoie chaque ligne à son paragraphe.
  await page.setViewportSize({width: 1200, height: 800});
  const doc = path.join(project.root, 'Bibliographie.docx');
  const model = await (await page.request.get(`${project.url}/docx/model?path=${encodeURIComponent(doc)}`)).json() as Model;
  const target = model.paragraphs.length - 3;
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(doc)}&line=${target}`);
  const para = page.locator(`.d-p[data-idx="${target}"]`);
  await expect(para).toBeAttached();
  await expect.poll(() => page.evaluate((i) => {
    const r = document.querySelector(`.d-p[data-idx="${i}"]`)!.getBoundingClientRect();
    const v = document.getElementById('scroll')!.getBoundingClientRect();
    return r.top >= v.top && r.top < v.top + v.height / 2;
  }, target)).toBe(true);
  // Sans line, le document s'ouvre en haut.
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(doc)}`);
  await expect(page.locator('.d-p[data-idx="0"]')).toBeAttached();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.getElementById('scroll')!.scrollTop)).toBe(0);
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
  type Asks = {asks: {action: string; px: number}[]};
  const asks = () => page.evaluate(() => (window as unknown as Asks).asks.map((a) => a.action).join());
  // Document annoté : à l'ouverture, la marge s'ouvre d'elle-même et le
  // panneau s'élargit pour la page à 85 % et les fiches côte à côte.
  await expect.poll(asks).toBe('widen');
  const auto = await page.evaluate(() => (window as unknown as Asks).asks[0]);
  expect(auto.px).toBeGreaterThan(200);
  await expect(body).not.toHaveClass(/no-lane/);
  await expect(body).not.toHaveClass(/lane-over|lane-in/);
  await expect(frame.locator('#btnLane')).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.locator('.z-pct')).toHaveText('85 %');
  await expect(frame.locator('.z-pct')).toHaveClass(/on/);
  expect(await frame.locator('#scroll').evaluate((s) => s.scrollWidth - s.clientWidth)).toBeLessThanOrEqual(1);
  await frame.locator('#btnLane').click();
  await expect.poll(asks).toBe('widen,restore');
  await expect(body).toHaveClass(/no-lane/);
  await expect(page.locator('#f')).toHaveCSS('width', '800px');
  await page.evaluate(() => { (window as unknown as Asks).asks = []; });
  // Au bouton : la page garde sa taille (ou monte aux 75 % sous lesquels la marge ne tient pas).
  const w0 = await frame.locator('#paper').evaluate((p) => (p as HTMLElement).offsetWidth);
  await frame.locator('#btnLane').click();
  await expect.poll(asks).toBe('widen');
  const ask = await page.evaluate(() => (window as unknown as Asks).asks[0]);
  expect(ask.px).toBeGreaterThan(300);
  await expect(body).not.toHaveClass(/no-lane/);
  await expect(body).not.toHaveClass(/lane-over|lane-in/);
  await expect(frame.locator('#btnLane')).toHaveAttribute('aria-pressed', 'true');
  const w1 = await frame.locator('#paper').evaluate((p) => (p as HTMLElement).offsetWidth);
  expect(w1).toBeGreaterThanOrEqual(w0 - 2);
  // Toute la marge tient dans le panneau.
  const right = await frame.locator('#scroll').evaluate((s) => s.scrollWidth - s.clientWidth);
  expect(right).toBeLessThanOrEqual(1);
  await frame.locator('#btnLane').click();
  await expect.poll(asks).toBe('widen,restore');
  await expect(body).toHaveClass(/no-lane/);
  await expect(page.locator('#f')).toHaveCSS('width', '800px');
});

test('docx: dans l\'app, une marge fermée par Thierry ne se rouvre pas seule à l\'ouverture', async ({page, project}) => {
  // Hôte servi par la galerie elle-même : l'iframe garde son stockage (sous
  // about:blank, il lui est refusé).
  await page.setViewportSize({width: 1600, height: 900});
  await page.goto(`${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(project.doc)}`);
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  const src = page.url();
  const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('docxLaneOff:')) || '');
  expect(key).toBe('');
  await page.evaluate((p) => { localStorage.setItem(`docxLaneOff:${p}`, '1'); }, project.doc);
  await page.evaluate((url) => {
    document.body.innerHTML = '<iframe id="f" style="border:0;width:800px;height:880px"></iframe>';
    (window as unknown as {asks: string[]}).asks = [];
    addEventListener('message', (e) => { if (e.data?.type === 'atelier-docx-pane') (window as unknown as {asks: string[]}).asks.push(e.data.action); });
    (document.getElementById('f') as HTMLIFrameElement).src = url;
  }, src);
  const frame = page.frameLocator('#f');
  await expect(frame.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  await expect(frame.locator('body')).toHaveClass(/no-lane/);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as {asks: string[]}).asks)).toEqual([]);
  await expect(frame.locator('body')).toHaveClass(/no-lane/);
});

test('docx: dans l\'app, un seul panneau : Plan et Commentaires suivent la surface Documents', async ({page, project}) => {
  const src = `${project.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(project.doc)}&panel=host`;
  await page.setViewportSize({width: 1440, height: 900});
  await page.setContent(`<body style="margin:0"><iframe id="f" style="border:0;width:1200px;height:880px"></iframe><script>
    window.got = [];
    addEventListener('message', (e) => { if (String(e.data?.type).startsWith('atelier-docs-')) window.got.push(e.data); });
  </script></body>`);
  await page.locator('#f').evaluate((f: HTMLIFrameElement, url) => { f.src = url; }, src);
  const frame = page.frameLocator('#f');
  await expect(frame.locator('.d-p[data-idx="0"]')).toContainText('2.2 Fraction de glace');
  const body = frame.locator('body');
  await expect(body).toHaveClass(/\bhosted\b/);
  // Pas de seconde icône de panneau dans la barre ; panneau fermé tant que l'hôte n'a rien dit.
  await expect(frame.locator('#btnNav')).toBeHidden();
  await expect(body).toHaveClass(/\bno-side\b/);
  const tell = (open: boolean, tab: string) => page.locator('#f').evaluate((f: HTMLIFrameElement, d) => f.contentWindow!.postMessage({type: 'atelier-docs-panel', ...d}, '*'), {open, tab});
  await tell(true, 'docs');
  await expect(body).toHaveClass(/\bno-side\b/);
  await tell(true, 'com');
  await expect(body).not.toHaveClass(/\bno-side\b/);
  await expect(frame.locator('#tabCom')).toHaveAttribute('aria-selected', 'true');
  await expect(frame.locator('#tabDocs')).toBeVisible();
  // Le panneau a la largeur de la liste des documents (264 px).
  expect((await frame.locator('#side').boundingBox())!.width).toBe(264);
  // Documents, choisi ici, revient à la surface ; le compte des commentaires aussi.
  await frame.locator('#tabDocs').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {got: {type: string; tab?: string}[]}).got.some((m) => m.type === 'atelier-docs-panel-tab' && m.tab === 'docs'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as {got: {type: string}[]}).got.some((m) => m.type === 'atelier-docs-panel-count'))).toBe(true);
  await tell(false, 'plan');
  await expect(body).toHaveClass(/\bno-side\b/);
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
  // Le tri s'ouvre depuis le menu du compteur de révision.
  await page.locator('#revMenu').click();
  await page.locator('.menu.show .mi', {hasText: 'Trier les suivis'}).click();
  await expect(page.locator('#tri')).toBeVisible();
  await expect(page.locator('.tri-g[data-g="fond"] .c')).toHaveText('6');
}

const changeIds = async (page: Page, tri: {url: string; doc: string}) =>
  (await disk(page, tri)).changes.map((c) => c.id).sort((a, b) => a - b);

triTest('docx: le tri range les suivis et « Accepter les mineurs » n’accepte que les mineurs', async ({page, tri}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openTri(page, tri);
  await expect(page.locator('body')).toHaveClass(/\btriage\b/);
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
  await page.locator('#triClose').click();
  await expect(page.locator('#tri')).toBeHidden();
  await expect(page.locator('#cards')).toBeVisible();
  expect(errors).toEqual([]);
});

triTest('docx: la barre parcourt les modifications, accepte et refuse en passant à la suivante', async ({page, tri}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.request.post(`${tri.url}/docx/prefs`, {data: {author: 'Thierry'}});
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto(`${tri.url}/.fig_thumbs/docx_studio.html?path=${encodeURIComponent(tri.doc)}`);
  await expect(page.locator('.d-p[data-idx="0"]')).toContainText('4 Results');
  const counter = page.locator('#revMenu');
  // Rien de courant : « – » sur le total, comme Word avant la première.
  await expect(counter).toHaveText(/^– \/ \d+$/);
  const total = Number((await counter.textContent())!.split('/')[1].trim());
  expect(total).toBeGreaterThan(20);
  await page.locator('#navNext').click();
  await expect(counter).toHaveText(`1 / ${total}`);
  await expect(page.locator('#paper .nav-on').first()).toBeVisible();
  await page.locator('#navNext').click();
  await expect(counter).toHaveText(`2 / ${total}`);
  // ⌥⌘↑ revient d'un cran.
  await page.keyboard.press('Meta+Alt+ArrowUp');
  await expect(counter).toHaveText(`1 / ${total}`);
  const first = Number(await page.locator('#paper .nav-on').first().getAttribute('data-ch'));
  // ✓ accepte la courante et passe à la suivante.
  await page.locator('#btnAccept').click();
  await expect.poll(async () => (await changeIds(page, tri)).includes(first)).toBe(false);
  await expect(counter).toHaveText(`1 / ${total - 1}`);
  const second = Number(await page.locator('#paper .nav-on').first().getAttribute('data-ch'));
  expect(second).not.toBe(first);
  // ✕ refuse.
  await page.locator('#btnReject').click();
  await expect.poll(async () => (await changeIds(page, tri)).includes(second)).toBe(false);
  await expect(counter).toHaveText(`1 / ${total - 2}`);
  // Parcourir les commentaires : ✕ n'a plus de sens, ✓ règle.
  await counter.click();
  await page.locator('.menu.show .mi', {hasText: 'Commentaires'}).click();
  await expect(page.locator('#btnReject')).toBeDisabled();
  await expect(page.locator('#btnAccept')).toHaveAttribute('aria-label', 'Régler le commentaire');
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
  // Le refus n'arrive qu'une fois la frappe finie : sinon il peut tomber au
  // milieu d'un mot, qui part alors en deux lots et deux avis.
  let release = () => {};
  let gate = Promise.resolve();
  const hold = () => { gate = new Promise<void>(r => { release = r; }); };
  await page.route('**/docx/op', async route => {
    await gate;
    await route.fulfill({status, contentType: 'application/json', body: JSON.stringify({error: status === 423 ? 'Le document est ouvert dans Word' : 'révision périmée'})});
  });
  hold();
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.type(' perdu ?');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.d-p[data-idx="2"]')).toContainText('retenu ici perdu offre');
  release();
  await expect(page.locator('#toast')).toContainText('« perdu »', {timeout: 6000});
  await expect(page.locator('#toast')).toHaveClass(/err/);
  await expect.poll(() => shownText(page, 2)).toBe(before);
  expect((await disk(page, project)).paragraphs[2].text).toBe(before);
  // Word ouvert (423) sur une Entrée suivie de frappe : même chose.
  status = 423;
  hold();
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Encore');
  release();
  await expect(page.locator('#toast')).toContainText('Encore', {timeout: 6000});
  await expect.poll(() => shownText(page, 2)).toBe(before);
  expect((await disk(page, project)).paragraphs.length).toBe(n);
  expect((await disk(page, project)).paragraphs[2].text).toBe(before);
});

test("docx: Ouvrir dans Word écrit d'abord la frappe, passe une copie de lecture et laisse la page modifiable", async ({page, project}) => {
  await open(page, project);
  // Pas de Word ici : la route est simulée ; le fichier doit déjà porter la
  // frappe quand Atelier en tire la copie pour Word.
  let handed = '';
  await page.route('**/docx/open-word', async route => {
    handed = (await disk(page, project)).paragraphs[2].text;
    await route.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'});
  });
  await caretAfter(page, 2, 'retenu ici');
  await page.keyboard.type(' neige');
  await expect(page.locator('#ftWord')).toHaveText('Ouvrir dans Word');
  await page.locator('#ftWord').click();
  await expect.poll(() => handed).toContain('retenu ici neige');
  await expect(page.locator('#toast')).toContainText('Copie de lecture ouverte dans Word');
  await expect(page.locator('#notice')).toBeHidden();
  await expect(page.locator('#paper')).toHaveAttribute('contenteditable', 'true');
  // Word absent : message clair.
  await page.unroute('**/docx/open-word');
  await page.route('**/docx/open-word', route => route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({error: "Microsoft Word n'est pas installé sur ce Mac"})}));
  await page.locator('#ftWord').click();
  await expect(page.locator('#toast')).toContainText('pas installé');
  await expect(page.locator('#toast')).toHaveClass(/err/);
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
  await expect(page.locator('#eqH')).toHaveText('Équation 1');
  await expect(page.locator('#eqTag')).toBeVisible();
  await expect(page.locator('#eqSrc')).toHaveValue(latex0!);
  await expect(page.locator('#eqSrc')).toBeFocused();
  await expect(page.locator('#eqPrev .katex')).toBeVisible();
  // Rien d'autre que l'aperçu, le champ et la coche (variante « Ligne »).
  await expect(pop.locator('button')).toHaveCount(1);
  await expect(page.locator('#eqOk')).toHaveAttribute('aria-label', 'Remplacer');

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

  // Frappe inachevée : le dernier aperçu valide reste, estompé (katex.render
  // vidait la cible avant de lever).
  await page.locator('#eqSrc').fill('\\frac{1}{');
  await expect(page.locator('#eqPrev')).toHaveClass(/\bbad\b/);
  await expect(page.locator('#eqPrev .katex')).toBeVisible();

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
