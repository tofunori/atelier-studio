import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
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
    'The study area covers the glaciers of western North America over 22 melt seasons.',
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
      const start = node.textContent.indexOf('western North America');
      const r = document.createRange();
      r.setStart(node, start); r.setEnd(node, start + 'western North America'.length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      p.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
    });
    await page.waitForTimeout(300);
    const pill = await fr().evaluate(() => {
      const el = document.getElementById('selPill');
      const st = getComputedStyle(el);
      return {visible: st.display, gauche: Math.round(el.getBoundingClientRect().left),
              haut: Math.round(el.getBoundingClientRect().top),
              boutons: [...el.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean),
              plage: el.dataset.page || null};
    });
    console.log('PASTILLE ' + JSON.stringify(pill));
    expect(pill.visible).toBe('flex');
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
    expect(envoi.text).toBe('western North America');
    await fr().locator('header').screenshot({path: '/tmp/barre-lecture.png'});
  } finally { server.kill('SIGKILL'); }
});
