// Retour Word d'un relecteur (Thierry 2026-11-12) : « Importer un retour Word
// (.docx)… » pose ses commentaires dans le .tex, signés de son prénom, avec le
// bilan d'import, le filtre du panneau, les états et l'ordre du jour. Le .docx
// est la fixture synthétique de rust/crates/atelier-docx (zippée ici, sans
// compression), le même cas que tests/retour_du_relecteur.rs.
import {test, expect} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer as stop} from '../gallery_server.mts';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {crc32} from 'node:zlib';
import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(GALLERY, '..', 'rust/crates/atelier-docx/tests/fixtures/retour');

const MAIN = '\\documentclass{article}\n\\begin{document}\n\\section{Methods}\n\\input{sections/methods}\n'
  + '\\begin{figure}\n\\includegraphics{fig1}\n\\caption{Observed and modelled albedo.}\n\\end{figure}\n\\end{document}\n';
const METHODS = 'Values below 0.05 or above 0.99 are removed.\n'
  + 'Following \\citet{stroeve2006}, we remove images with a solar zenith angle greater than $70^\\circ$.\n\n'
  + 'Summer albedo is the mean over June to August, by elevation zone.\n\n'
  + 'The model is $x = a + b$ fitted to all zones.\n';

/** Zip « stored » minimal : assez pour un .docx de test. */
function zipDir(dir: string): Buffer {
  const files: Array<[string, Buffer]> = [];
  const walk = (d: string) => readdirSync(d).forEach(name => {
    const p = path.join(d, name);
    if (statSync(p).isDirectory()) walk(p); else files.push([path.relative(dir, p).split(path.sep).join('/'), readFileSync(p)]);
  });
  walk(dir);
  files.sort(([a], [b]) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : a.localeCompare(b)));
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dirSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

test('reviewer .docx: comments land in the .tex, signed, with report, filter, states and agenda', async ({page}) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'atelier-reviewer-'))); // macOS : /var → /private/var
  const appDir = path.join(root, '.app');
  mkdirSync(appDir);
  mkdirSync(path.join(root, 'sections'));
  const main = path.join(root, 'main.tex');
  writeFileSync(main, MAIN);
  writeFileSync(path.join(root, 'sections', 'methods.tex'), METHODS);
  const docx = path.join(root, 'retour.docx');
  writeFileSync(docx, zipDir(FIXTURE));
  let server;
  try {
    const port = await freePort();
    server = spawnGalleryServer({root, port, watch: false, env: {ATELIER_APP_DIR: appDir}});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    const methods = path.join(root, 'sections', 'methods.tex');
    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(methods)}`);
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Entrée du menu « … » : seulement pour un .tex.
    await page.locator('#moreBtn').click();
    const entry = page.locator('#moreReviewImport');
    await expect(entry).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await entry.click();
    const imported = page.waitForResponse(r => r.url().includes('/review/import'));
    await (await chooser).setFiles(docx);
    expect((await imported).ok()).toBe(true);

    // Bilan : 5 commentaires, tous placés, la réponse de Thierry gardée.
    const report = page.locator('.texv-report-card');
    await expect(report).toContainText('Retour de Christophe importé');
    await expect(report).toContainText('5 reçus, tous placés');
    await expect(report).toContainText('1 réponse déjà écrite dans Word');
    await expect(report).toContainText('main.tex · 1');
    // Ses retouches (lot 2) : l'une s'applique, l'autre touche un passage changé depuis.
    await expect(report).toContainText('2 phrases retouchées : 1 s’applique telle quelle, 1 touche un passage que tu as changé depuis.');

    // Le store : notes signées du relecteur, une copie du .docx gardée.
    const store = JSON.parse(readFileSync(path.join(root, '.fig_thumbs', 'pdf_annots.json'), 'utf8'));
    const notes = store[`tex-comments:${methods}`];
    expect(notes).toHaveLength(6);
    expect(notes.filter((n: any) => n.review.kind === 'edit').map((n: any) => n.review.edit.status)).toEqual(['changed', 'apply']);
    expect(notes.every((n: any) => n.by === 'reviewer' && n.author === 'Christophe Kinnard' && n.review.state === 'todo')).toBe(true);
    expect(readdirSync(path.join(root, '.fig_thumbs', 'retours'))).toHaveLength(1);

    // Panneau : filtre au prénom, états ; ses commentaires de tous les
    // fichiers, fichier par fichier dans l'ordre de lecture.
    await report.locator('.texv-report-close').first().click();
    const panel = page.locator('#texcPanel');
    await expect(panel.locator('.tp-filter').getByRole('button')).toHaveText(['Toutes', 'Les miennes', 'Christophe']);
    await expect(panel.locator('.tp-chip[data-rstate="todo"]')).toHaveText('À faire · 5');
    await expect(panel.locator('.tp-sec-file')).toHaveText(['main.tex', 'methods.texouvert']);
    await expect(panel.locator('.tp-item[data-path]')).toHaveCount(1);
    await expect(panel.locator('.tp-item:not([data-path])')).toHaveCount(4);
    // Rien d'inséré dans le texte (maquette v8) : un numéro par commentaire
    // dans la marge, un crayon par retouche, l'état en couleur seule.
    const rings = page.locator('.texv-mk:not(.is-edit)');
    await expect(rings).toHaveCount(4);
    await expect(page.locator('.texv-mk.is-edit')).toHaveCount(2);
    await expect(page.locator('.cm-content .atelier-annotation-number')).toHaveCount(0);
    await expect(panel.locator('.tp-item .tp-sdot.tone-info').first()).toHaveAttribute('title', /à faire/i);
    await expect(panel.locator('.tp-edits')).toContainText('0 sur 2 phrases');
    await expect(panel.locator('.tp-edit-row[data-edits] .tp-edit-n')).toHaveText(['1', '1', '0']);

    // Ouvrir le commentaire exact : une bulle, la réponse Word de Thierry.
    await rings.first().click();
    const pop = page.locator('.texv-pop');
    await expect(pop).toHaveCount(1);
    await expect(pop).toHaveAttribute('aria-label', /Christophe/);
    await expect(pop.locator('.texv-word')).toHaveAttribute('title', /Thierry/);
    const position = await pop.locator('.texv-pos').textContent();
    expect(position).toMatch(/^\d \/ 6$/);
    // Cocher le numéro : réglé ; Suivant passe au suivant.
    await pop.locator('.texv-tick').click();
    await expect(panel.locator('.tp-chip[data-rstate="done"]')).toHaveText('Réglés · 1');
    await expect(rings.first()).toHaveClass(/is-done/);
    await page.locator('.texv-pop .texv-next').click();
    await expect(page.locator('.texv-pop .texv-pos')).not.toHaveText(position || '');

    // Réimporter le même fichier n'ajoute rien.
    await page.locator('#moreBtn').click();
    const again = page.waitForEvent('filechooser');
    await page.locator('#moreReviewImport').click();
    const second = page.waitForResponse(r => r.url().includes('/review/import'));
    await (await again).setFiles(docx);
    expect((await second).ok()).toBe(true);
    await expect(page.locator('.texv-report-card')).toContainText('rien n’a été ajouté');
    await expect(page.locator('.texv-mk')).toHaveCount(6);
    await page.locator('.texv-report-close').first().click();

    // Sa retouche prête : sa version en vert, Accepter l'écrit dans le .tex.
    await panel.locator('.tp-edit-row[data-edits="apply"]').click();
    await expect(panel.locator('.tp-item')).toHaveCount(1);
    // L'état se lit à la couleur, son nom au survol du point.
    await expect(panel.locator('.tp-item .tp-sdot')).toHaveAttribute('title', 'S’applique telle quelle');
    await panel.locator('.tp-item').click();
    const ready = page.locator('.texv-pop.is-edit');
    await expect(ready.locator('.texv-pop-note')).toContainText('Christophe');
    await expect(ready.locator('.texv-his b')).toContainText('with care');
    await expect(ready.locator('.texv-accept')).toHaveAttribute('aria-label', 'Appliquer sa version');
    await ready.locator('.texv-accept').click();
    await expect(page.locator('.cm-content')).toContainText('The model is $x = a + b$ with care fitted to all zones.');
    const editOf = (eid: number) => JSON.parse(readFileSync(path.join(root, '.fig_thumbs', 'pdf_annots.json'), 'utf8'))[`tex-comments:${methods}`]
      .find((n: any) => n.review.eid === eid).review;
    await expect.poll(() => editOf(2).state).toBe('done');
    expect(editOf(2).accepted).toBeGreaterThan(0);

    // Celle que ton texte a dépassée : sa version barrée/verte, Garder mon texte.
    await panel.locator('.tp-edit-row[data-edits="changed"]').click();
    await panel.locator('.tp-item').click();
    const changed = page.locator('.texv-pop.is-edit');
    await expect(changed.locator('.texv-his s')).toHaveText(' greater than');
    await expect(changed.locator('.texv-his b')).toHaveText(' above');
    await expect(changed.locator('.texv-chat')).toHaveAttribute('aria-label', 'Demander à Claude de fusionner');
    await expect(changed.locator('.texv-refuse')).toHaveAttribute('aria-label', 'Garder mon texte');
    await changed.locator('.texv-refuse').click();
    await expect.poll(() => editOf(1).state).toBe('done');
    expect(editOf(1).refused).toBeGreaterThan(0);
    await expect(panel.locator('.tp-edits')).toContainText('2 sur 2 phrases');
    await expect(page.locator('.cm-content')).toContainText('greater than $70^\\circ$');
    await panel.locator('.tp-edit-row[data-edits="done"]').click();
    await expect(panel.locator('.tp-item')).toHaveCount(2);
    expect(await panel.locator('.tp-item .tp-sdot').evaluateAll(dots => dots.map(d => d.getAttribute('title')).sort()))
      .toEqual(['Acceptée', 'Ton texte gardé']);
    await panel.locator('.tp-edit-row[data-edits="done"]').click();

    // Un commentaire d'un autre fichier : le clic demande d'ouvrir ce fichier,
    // et son éditeur ouvre le commentaire.
    await panel.locator('.tp-item[data-path]').click();
    const focus = await page.evaluate(() => JSON.parse(localStorage.getItem('atelier.reviewFocus') || 'null'));
    expect(focus?.path).toBe(main);
    await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(main)}`);
    await expect(page.locator('.texv-pop')).toHaveCount(1);
    await expect(page.locator('#texcPanel .tp-item.is-active')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('atelier.reviewFocus'))).toBeNull();
  } finally { await stop(server); await removeTempRoot(root); }
});

// Revue un par un dans le chat (maquette « chat-un-par-un », 2026-11-12) :
// l'éditeur, dans une iframe comme dans Atelier, envoie un commentaire au
// chat ; la barre du chat répond Réglé / Suivant et reçoit le suivant, dans
// l'ordre du document.
test('reviewer comments go to the chat one by one, and the chat bar drives the editor', async ({page}) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'atelier-reviewer-chat-'))); // macOS : /var → /private/var
  const appDir = path.join(root, '.app');
  mkdirSync(appDir);
  mkdirSync(path.join(root, 'sections'));
  writeFileSync(path.join(root, 'main.tex'), MAIN);
  writeFileSync(path.join(root, 'sections', 'methods.tex'), METHODS);
  const docx = path.join(root, 'retour.docx');
  writeFileSync(docx, zipDir(FIXTURE));
  let server;
  let host: Server | undefined;
  try {
    const port = await freePort();
    server = spawnGalleryServer({root, port, watch: false, env: {ATELIER_APP_DIR: appDir}});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    const methods = path.join(root, 'sections', 'methods.tex');
    const nonce = 'review-nonce';
    const url = `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(methods)}#atelier_nonce=${nonce}`;
    // L'hôte, d'une autre origine comme l'app : garde ce que l'éditeur envoie
    // au chat. Servi par un vrai serveur local (une page interceptée serait
    // « publique » pour Chromium, qui bloquerait l'iframe locale).
    const hostHtml = `<!doctype html><meta charset="utf-8"><body style="margin:0"><iframe id="ed" style="width:1200px;height:800px;border:0" src="${url}"></iframe>
      <script>window.__chat=[];addEventListener('message',e=>{if(e.data&&e.data.type==='atelier-review-comment')window.__chat.push(e.data);});</script>`;
    host = createServer((_request, response) => { response.writeHead(200, {'Content-Type': 'text/html'}); response.end(hostHtml); });
    await new Promise<void>(resolve => host!.listen(0, '127.0.0.1', resolve));
    await page.goto(`http://127.0.0.1:${(host.address() as AddressInfo).port}/`);
    const editor = page.frameLocator('#ed');
    await expect(editor.locator('.cm-editor')).toBeVisible();

    await editor.locator('#moreBtn').click();
    const chooser = page.waitForEvent('filechooser');
    await editor.locator('#moreReviewImport').click();
    await (await chooser).setFiles(docx);
    await expect(editor.locator('.texv-report-card')).toContainText('Retour de Christophe importé');
    await editor.locator('.texv-report-close').first().click();

    // Le panneau lance la revue : premier commentaire du document.
    const panel = editor.locator('#texcPanel');
    await panel.locator('.tp-chat-review').click();
    const sent = () => page.evaluate(() => (window as any).__chat as Array<{text: string; review: any}>);
    await expect.poll(async () => (await sent()).length).toBe(1);
    const first = (await sent())[0];
    expect(first.review.n).toBe(1);
    expect(first.review.total).toBe(5);
    expect(first.review.author).toBe('Christophe Kinnard');
    expect(first.text).toContain('Commentaire 1 sur 5 de Christophe Kinnard');
    expect(first.text).toContain('atelier_annotate');

    // La barre du chat : Réglé, puis le suivant arrive.
    const act = (action: string, review: any) => page.evaluate(([a, r, n]) => {
      (document.getElementById('ed') as HTMLIFrameElement).contentWindow!.postMessage(
        {type: 'atelier-review-action', nonce: n, action: a, id: r.id, file: r.path, mode: r.mode}, '*');
    }, [action, review, nonce] as const);
    await act('done', first.review);
    await expect.poll(async () => (await sent()).length).toBe(2);
    const second = (await sent())[1];
    expect(second.review.n).toBe(2);
    const store = () => JSON.parse(readFileSync(path.join(root, '.fig_thumbs', 'pdf_annots.json'), 'utf8'));
    const noteOf = (review: any) => store()[`tex-comments:${review.path}`].find((n: any) => n.id === review.id);
    await expect.poll(() => noteOf(first.review).review.state).toBe('done');
    expect(noteOf(second.review).review.chatAt).toBeGreaterThan(0);

    // Un nonce faux ne fait rien ; Suivant passe sans régler.
    await page.evaluate(r => {
      (document.getElementById('ed') as HTMLIFrameElement).contentWindow!.postMessage(
        {type: 'atelier-review-action', nonce: 'faux', action: 'done', id: r.id, file: r.path, mode: 'open'}, '*');
    }, second.review);
    await act('next', second.review);
    await expect.poll(async () => (await sent()).length).toBe(3);
    expect((await sent())[2].review.n).toBe(3);
    expect(noteOf(second.review).review.state).toBe('todo');

    // Sur le texte : rien d'inséré, un numéro dans la marge par commentaire.
    const inFile = (await sent()).map(m => m.review).find(r => r.path === methods);
    if (inFile) await expect(editor.locator(`.texv-mk[data-texa="${inFile.id}"]`)).toHaveCount(1);
    await expect(editor.locator('.cm-content .atelier-annotation-number')).toHaveCount(0);

    // Un seul bouton, le chat : Thierry écrit sa note, Entrée l'envoie avec
    // le commentaire de Christophe.
    await editor.locator('.texv-mk:not(.is-done):not(.is-edit)').first().click();
    const pop = editor.locator('.texv-pop');
    await expect(pop).toHaveCount(1);
    await expect(pop.locator('.texv-pop-row .texv-ib')).toHaveCount(1);
    await pop.locator('.texv-chat').click();
    const input = editor.locator('.texv-pop .texv-cmp-t');
    await expect(input).toBeFocused();
    await input.fill('Pas sûr, qu’en penses-tu ?');
    await input.press('Enter');
    await expect.poll(async () => (await sent()).length).toBe(4);
    const withNote = (await sent())[3];
    expect(withNote.review.note).toBe('Pas sûr, qu’en penses-tu ?');
    expect(withNote.text).toContain('Ma note : « Pas sûr, qu’en penses-tu ? »');
    await expect(editor.locator('.texv-pop .texv-said:not(.texv-word)')).toHaveText('Pas sûr, qu’en penses-tu ?');

    // Cocher le numéro : réglé, la couleur seule le dit.
    await editor.locator('.texv-pop .texv-tick').click();
    await expect.poll(() => noteOf(withNote.review).review.state).toBe('done');
    await expect(editor.locator(`.texv-mk[data-texa="${withNote.review.id}"]`)).toHaveClass(/is-done/);
    await expect(editor.locator('.texv-pop .texv-dot')).toHaveClass(/tone-ok/);

    // Un clic ailleurs dans le texte referme la bulle.
    await editor.locator('.cm-line').last().click();
    await expect(editor.locator('.texv-pop')).toHaveCount(0);
  } finally { host?.close(); await stop(server); await removeTempRoot(root); }
});

// Ses modifications une par une dans le chat (lot 2) : Accepter écrit sa
// version dans le .tex, même dans un fichier que l'éditeur n'a pas ouvert ;
// Refuser garde ton texte ; une retouche à fusionner refuse Accepter et le
// dit à la barre. Fixture synthétique `retouches` (tests/retouches_du_relecteur.rs).
const RETOUCHES = path.join(GALLERY, '..', 'rust/crates/atelier-docx/tests/fixtures/retouches');
const MAIN_RESULTS = '\\documentclass{article}\n\\begin{document}\n\\input{sections/results}\n\\end{document}\n';
const RESULTS = 'Glaciers darken in summer \\citep{Ren_2021}.\nValues below 0.05 are removed.\n'
  + 'The darkening is 0.003 in 2018 (Fig.~\\ref{fig:map}b).\n\nThis sentence goes away.\n'
  + 'Summer albedo is the mean over June to August.\n\nThe model is fitted to all zones.\n\n'
  + 'Snow covers the ice in June.\n\nMelt begins in May.\n';

test('reviewer edits go to the chat one by one: accept writes the .tex, decline keeps your text', async ({page}) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'atelier-reviewer-edits-'))); // macOS : /var → /private/var
  const appDir = path.join(root, '.app');
  mkdirSync(appDir);
  mkdirSync(path.join(root, 'sections'));
  const main = path.join(root, 'main.tex');
  const results = path.join(root, 'sections', 'results.tex');
  writeFileSync(main, MAIN_RESULTS);
  writeFileSync(results, RESULTS);
  const docx = path.join(root, 'retouches.docx');
  writeFileSync(docx, zipDir(RETOUCHES));
  let server;
  let host: Server | undefined;
  try {
    const port = await freePort();
    server = spawnGalleryServer({root, port, watch: false, env: {ATELIER_APP_DIR: appDir}});
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/ping`).then(r => r.ok).catch(() => false)).toBe(true);
    const nonce = 'edit-nonce';
    const url = `http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(main)}#atelier_nonce=${nonce}`;
    const hostHtml = `<!doctype html><meta charset="utf-8"><body style="margin:0"><iframe id="ed" style="width:1200px;height:800px;border:0" src="${url}"></iframe>
      <script>window.__chat=[];addEventListener('message',e=>{if(e.data&&e.data.type==='atelier-review-comment')window.__chat.push(e.data);});</script>`;
    host = createServer((_request, response) => { response.writeHead(200, {'Content-Type': 'text/html'}); response.end(hostHtml); });
    await new Promise<void>(resolve => host!.listen(0, '127.0.0.1', resolve));
    await page.goto(`http://127.0.0.1:${(host.address() as AddressInfo).port}/`);
    const editor = page.frameLocator('#ed');
    await expect(editor.locator('.cm-editor')).toBeVisible();

    await editor.locator('#moreBtn').click();
    const chooser = page.waitForEvent('filechooser');
    await editor.locator('#moreReviewImport').click();
    await (await chooser).setFiles(docx);
    const report = editor.locator('.texv-report-card');
    await expect(report).toContainText('7 phrases retouchées');
    await expect(report).toContainText('1 note tapée dans le texte devient un commentaire');
    await report.locator('.texv-report-close').first().click();

    // Toutes ses retouches sont dans results.tex : le panneau les range là.
    const panel = editor.locator('#texcPanel');
    await expect(panel.locator('.tp-edits')).toContainText('1 sur 7 phrases');
    await expect(panel.locator('.tp-edit-row[data-edits] .tp-edit-n')).toHaveText(['5', '1', '1']);
    await panel.locator('.tp-edit-walk').click();
    const sent = () => page.evaluate(() => (window as any).__chat as Array<{text: string; review: any}>);
    await expect.poll(async () => (await sent()).length).toBe(1);
    const first = (await sent())[0];
    expect(first.review).toMatchObject({mode: 'edit', kind: 'edit', edit: 'apply', ready: true, n: 1, total: 7, path: results});
    expect(first.text).toContain('Modification 1 sur 7 de Christophe Kinnard');
    expect(first.text).toContain('Sa version');

    const act = (action: string, review: any) => page.evaluate(([a, r, n]) => {
      (document.getElementById('ed') as HTMLIFrameElement).contentWindow!.postMessage(
        {type: 'atelier-review-action', nonce: n, action: a, id: r.id, file: r.path, mode: r.mode}, '*');
    }, [action, review, nonce] as const);
    const store = () => JSON.parse(readFileSync(path.join(root, '.fig_thumbs', 'pdf_annots.json'), 'utf8'));
    const noteOf = (id: string) => store()[`tex-comments:${results}`].find((n: any) => n.id === id);

    // Accepter : aucun éditeur n'a results.tex ouvert, le serveur l'écrit.
    await act('accept', first.review);
    await expect.poll(async () => (await sent()).length, {timeout: 10_000}).toBe(2);
    expect(noteOf(first.review.id).review).toMatchObject({state: 'done'});
    expect(noteOf(first.review.id).review.accepted).toBeGreaterThan(0);
    expect(readFileSync(results, 'utf8')).toContain('Values below 0.05 are discarded.');

    // Refuser : son texte reste, la retouche est rangée.
    const second = (await sent())[1];
    expect(second.review.n).toBe(2);
    const before = readFileSync(results, 'utf8');
    await act('refuse', second.review);
    await expect.poll(async () => (await sent()).length, {timeout: 10_000}).toBe(3);
    expect(noteOf(second.review.id).review.state).toBe('done');
    expect(noteOf(second.review.id).review.refused).toBeGreaterThan(0);
    expect(readFileSync(results, 'utf8')).toBe(before);

    // À fusionner : Accepter échoue et la barre le dit, sans passer au suivant.
    const changed = store()[`tex-comments:${results}`].find((n: any) => n.review.edit?.status === 'changed');
    await act('accept', {id: changed.id, path: results, mode: 'edit'});
    await expect.poll(async () => (await sent()).length, {timeout: 10_000}).toBe(4);
    const failed = (await sent())[3];
    expect(failed.text).toBe('');
    expect(failed.review.error).toContain('fusion');
    expect(noteOf(changed.id).review.state).toBe('todo');
  } finally { host?.close(); await stop(server); await removeTempRoot(root); }
});
