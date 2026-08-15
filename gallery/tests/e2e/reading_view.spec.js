import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function freePort(){return new Promise((res,rej)=>{const s=net.createServer();s.unref();s.on('error',rej);s.listen(0,'127.0.0.1',()=>{const{port}=s.address();s.close(()=>res(port));});});}

test('vue Lecture : plein cadre, pas de préambule, sélection annotable', async ({page}) => {
  const root = mkdtempSync(path.join(tmpdir(), 'read-'));
  const file = path.join(root, 'methods.tex');
  writeFileSync(file, [
    '% !TEX root = main.tex',
    '\\makeatletter',
    '\\def\\Loader{\\ifx\\input@path\\@undefined\\def\\input@path{}\\fi}',
    '\\makeatother',
    '\\ifdefined\\Root\\else\\expandafter\\Loader\\fi',
    '\\section{Study area}',
    'The study area covers the glaciers of western North America with more than 80\\,\\% cloud cover \\cite{rgi7consortium2023} over 22 melt seasons.',
    '',
    'At 500~m these surfaces cannot be separated from snow.',
  ].join('\n'));
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(GALLERY,'server','main.mjs')], {cwd: root, env:{...process.env, FIG_PORT:String(port), GALLERY_ROOT:root}, stdio:'ignore'});
  try {
    await expect.poll(()=>fetch(`http://127.0.0.1:${port}/ping`).then(r=>r.ok).catch(()=>false)).toBe(true);
    await page.setViewportSize({width: 1100, height: 800});
    writeFileSync(path.join(root,'host.html'),
      `<!doctype html><meta charset="utf-8"><style>body{margin:0}#f{width:100vw;height:100vh;border:0}</style>`+
      `<iframe id="f" src="/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(file)}&embedded=atelier"></iframe>`);
    await page.goto(`http://127.0.0.1:${port}/host.html`);
    const fr = () => page.frames().find(f => f.url().includes('latex_studio'));
    await expect.poll(()=>fr()?.evaluate(()=>!!window.cm).catch(()=>false)).toBe(true);
    await fr().click('#readBtn');
    await page.waitForTimeout(400);

    const vue = await fr().evaluate(() => ({
      pleinCadre: getComputedStyle(document.getElementById('left')).display === 'none',
      largeurDroite: Math.round(document.getElementById('right').getBoundingClientRect().width),
      prose: (document.getElementById('texread').textContent || '').trim().slice(0, 60),
      preambule: /@path|@undefined|Loader|input@path/.test(document.getElementById('texread').textContent || ''),
      survol: getComputedStyle(document.querySelector('#texread [data-line]')).backgroundColor,
    }));
    console.log('VUE ' + JSON.stringify(vue));

    // sélectionner « western North America » dans la prose
    await fr().evaluate(() => {
      const p = [...document.querySelectorAll('#texread p')].find(e => e.textContent.includes('western North America'));
      const node = p.firstChild;
      // Sélection qui TRAVERSE la citation rendue : « [rgi7consortium2023] »
      // n'existe pas dans le source, l'ancrage doit passer par la prose.
      // Démarre sur la prose TRANSFORMÉE : le rendu affiche « 80\,% » là où
      // le source dit « 80\,\% » — le fragment entier ne peut pas s'ancrer.
      const start = node.textContent.indexOf('with more than');
      const fin = p.lastChild;
      const r = document.createRange();
      r.setStart(node, start); r.setEnd(fin, (fin.textContent || '').indexOf('melt') + 4);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      p.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
    });
    await page.waitForTimeout(300);
    const pill = await fr().evaluate(() => {
      const el = document.getElementById('selPill');
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // `display` ment sous un parent masqué et `offsetParent` ment sur un
      // élément fixed : on vérifie la géométrie ET ce que le point central
      // renvoie réellement à l'écran.
      const centre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {visible: st.display, position: st.position, w: Math.round(r.width), h: Math.round(r.height),
              vraimentVisible: r.width > 0 && r.height > 0 && st.visibility !== 'hidden'
                && !!centre && (centre === el || el.contains(centre)),
              gauche: Math.round(r.left),
              haut: Math.round(el.getBoundingClientRect().top),
              boutons: [...el.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean),
              plage: el.dataset.page || null};
    });
    console.log('PASTILLE ' + JSON.stringify(pill));
    expect(pill.visible).toBe('flex');
    // `display` reste « flex » même sous un parent masqué : c'est offsetParent
    // qui dit si la pastille est réellement à l'écran.
    expect(pill.vraimentVisible).toBe(true);
    expect(pill.boutons).toContain('Commenter');
    expect(pill.boutons).toContain('Add to chat');
    expect(vue.pleinCadre).toBe(true);
    expect(vue.preambule).toBe(false);
    expect(vue.survol).toBe('rgba(0, 0, 0, 0)');
    // Preuve du ré-ancrage : « Add to chat » envoie la citation avec sa plage
    // de lignes SOURCE. La prose rendue ayant perdu les commandes LaTeX, la
    // plage ne peut venir que de la recherche par contenu.
    const [requete] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/quote') && r.method() === 'POST'),
      fr().evaluate(() => [...document.querySelectorAll('#selPill button')]
        .find(b => (b.textContent||'').includes('Add to chat')).dispatchEvent(
          new MouseEvent('click', {bubbles: true}))),
    ]);
    const envoi = JSON.parse(requete.postData() || '{}');
    console.log('ENVOI ' + JSON.stringify({page: envoi.page, text: envoi.text, rel: envoi.rel}));
    expect(envoi.page).toBe('L7-7');
    // Le texte envoyé est le SOURCE (avec \cite), pas le rendu : c'est lui qui
    // permettra de ré-ancrer un commentaire.
    expect(envoi.text).toContain('with more than');
    expect(envoi.text).toContain('80\\,\\%');
    expect(envoi.text).toContain('\\cite{rgi7consortium2023}');
    expect(envoi.text).toContain('melt');
    await fr().locator('header').screenshot({path: '/tmp/barre-lecture.png'});

    // Un commentaire posé depuis la Lecture doit s'y VOIR : surlignage via
    // l'API CSS Custom Highlight (aucun nœud ajouté, data-line intact).
    await fr().evaluate(() => {
      const p = [...document.querySelectorAll('#texread p')].find(e => e.textContent.includes('western North America'));
      const node = p.firstChild;
      const start = node.textContent.indexOf('covers the glaciers');
      const r = document.createRange();
      r.setStart(node, start); r.setEnd(node, start + 'covers the glaciers'.length);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      p.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
    });
    await fr().waitForTimeout(200);
    await fr().evaluate(() => [...document.querySelectorAll('#selPill button')]
      .find(b => (b.textContent||'').includes('Commenter')).dispatchEvent(
        new MouseEvent('mousedown', {bubbles: true})));
    await fr().waitForTimeout(150);
    const [annotSave] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/pdfannot') && r.method() === 'POST'),
      fr().evaluate(() => {
        const pop = document.getElementById('texcPop');
        pop.querySelector('textarea').value = 'à revoir';
        pop.querySelector('.tc-save').click();
      }),
    ]);
    const sauvegarde = JSON.parse(annotSave.postData() || '{}');
    console.log('ANNOTATION ' + JSON.stringify({n: sauvegarde.annots?.length, text: sauvegarde.annots?.[0]?.text}));
    expect(sauvegarde.annots?.[0]?.text).toBe('covers the glaciers');
    await fr().waitForTimeout(200);
    const surlignage = await fr().evaluate(() => {
      const reg = CSS.highlights;
      const noms = [...reg.keys()].filter(n => n.startsWith('texc-read-'));
      let etendue = 0;
      for (const n of noms) for (const r of reg.get(n)) etendue += String(r.toString()).length;
      return {noms, etendue};
    });
    console.log('SURLIGNAGE ' + JSON.stringify(surlignage));
    expect(surlignage.noms.length).toBeGreaterThan(0);
    expect(surlignage.etendue).toBeGreaterThan(10);

    // Édition sur place : double-clic → le paragraphe expose son SOURCE
    // (\cite compris), ⌘⏎ applique au buffer et déclenche la sauvegarde.
    await fr().evaluate(() => {
      const p = [...document.querySelectorAll('#texread p')].find(e => e.textContent.includes('western North America'));
      p.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    });
    const zone = fr().locator('#texread .texread-edit');
    await zone.waitFor({state: 'visible'});
    const sourceEdite = await zone.inputValue();
    expect(sourceEdite).toContain('\\cite{rgi7consortium2023}');
    expect(sourceEdite).toContain('80\\,\\%');
    await zone.focus();
    await fr().evaluate(() => {
      const a = document.querySelector('#texread .texread-edit');
      a.value = a.value.replace('22 melt seasons', '23 melt seasons');
    });
    const [ecrit] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/codesave') && r.method() === 'POST'),
      zone.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter'),
    ]);
    console.log('EDITION ' + JSON.stringify({sauve: !!ecrit}));
    await expect.poll(() => fr().evaluate(() => cm.getValue())).toContain('23 melt seasons');
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('23 melt seasons');
    // Et la vue re-rend la prose à jour, textarea disparue.
    await expect(fr().locator('#texread .texread-edit')).toHaveCount(0);
    await expect(fr().locator('#texread')).toContainText('23 melt seasons');

    // Taille de police : A+ grossit la prose ET persiste côté serveur —
    // le localStorage du WebView ne survit pas au redémarrage (piège n°1).
    const avantFs = await fr().evaluate(() => getComputedStyle(document.getElementById('texread')).fontSize);
    const [persiste] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/state') && r.method() === 'POST'),
      fr().evaluate(() => document.querySelector('#texreadFs button[aria-label*="Agrandir"]').click()),
    ]);
    const apresFs = await fr().evaluate(() => getComputedStyle(document.getElementById('texread')).fontSize);
    const etatServeur = JSON.parse(persiste.postData() || '{}');
    console.log('POLICE ' + JSON.stringify({avant: avantFs, apres: apresFs, serveur: etatServeur.texReadFontSize}));
    expect(parseFloat(apresFs)).toBe(parseFloat(avantFs) + 1);
    expect(etatServeur.texReadFontSize).toBe(parseFloat(apresFs));

    // Sélection courte DANS une substitution du rendu : « 500 m » ← « 500~m ».
    await fr().evaluate(() => {
      // « ~ » est rendu en espace INSÉCABLE (\u00A0) — toute comparaison à
      // l'espace simple rate silencieusement.
      const CIBLE = '500\u00A0m';
      const p = [...document.querySelectorAll('#texread p')].find(e => e.textContent.includes(CIBLE));
      const node = p.firstChild;
      const start = node.textContent.indexOf(CIBLE);
      const r = document.createRange();
      r.setStart(node, start); r.setEnd(node, start + CIBLE.length);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      p.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
    });
    await fr().waitForTimeout(300);
    const pilluleCourte = await fr().evaluate(() => {
      const el = document.getElementById('selPill');
      const r = el.getBoundingClientRect();
      const centre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.width > 0 && !!centre && (centre === el || el.contains(centre));
    });
    expect(pilluleCourte).toBe(true);
    const [envoiCourt] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/quote') && r.method() === 'POST'),
      // `.go` et non le libellé : pendant 1,2 s après un envoi le bouton
      // affiche « ✓ » — c'est le même bouton, il envoie la sélection courante.
      fr().evaluate(() => document.querySelector('#selPill .go').dispatchEvent(
          new MouseEvent('click', {bubbles: true}))),
    ]);
    const courtPayload = JSON.parse(envoiCourt.postData() || '{}');
    console.log('COURT ' + JSON.stringify({text: courtPayload.text, page: courtPayload.page}));
    expect(courtPayload.text).toBe('500~m');

    // Fond de lecture : sépia change le fond ET persiste ; « chat » aligne la
    // Lecture sur --surface-app, le noir du chat de l'app.
    const fondAvant = await fr().evaluate(() => getComputedStyle(document.getElementById('right')).backgroundColor);
    const [persisteTheme] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/state') && r.method() === 'POST'),
      fr().evaluate(() => document.querySelector('#texreadFs .tr-sw[data-theme="sepia"]').click()),
    ]);
    const fondSepia = await fr().evaluate(() => getComputedStyle(document.getElementById('right')).backgroundColor);
    expect(JSON.parse(persisteTheme.postData() || '{}').texReadTheme).toBe('sepia');
    expect(fondSepia).not.toBe(fondAvant);
    expect(fondSepia).toBe('rgb(239, 231, 212)');
    await fr().evaluate(() => document.querySelector('#texreadFs .tr-sw[data-theme="chat"]').click());
    const fondChat = await fr().evaluate(() => ({
      fond: getComputedStyle(document.getElementById('right')).backgroundColor,
      attendu: getComputedStyle(document.getElementById('right')).getPropertyValue('--surface-app').trim(),
    }));
    console.log('FOND ' + JSON.stringify({avant: fondAvant, sepia: fondSepia, chat: fondChat}));
    // Hors app, --surface-app est absente : le repli #1e2124 (le noir du chat)
    // s'applique. Dans l'app, atelier_theme.js fournit la variable exacte.
    expect(fondChat.fond).toBe('rgb(30, 33, 36)');

    // La barre d'état (Ln/Col, wrap, compile) décrit l'éditeur : en Lecture
    // elle disparaît, et revient avec lui.
    await expect(fr().locator('#statusbar')).toBeHidden();
    await fr().evaluate(() => document.getElementById('editBtn').click());
    await expect(fr().locator('#statusbar')).toBeVisible();
    await fr().evaluate(() => document.getElementById('readBtn').click());
    await expect(fr().locator('#statusbar')).toBeHidden();
  } finally { server.kill('SIGKILL'); }
});
