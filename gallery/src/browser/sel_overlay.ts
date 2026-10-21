(function(){
  try{ var m=(location.hash||'').match(/atelier_nonce=([\w-]+)/); if(m){ sessionStorage.setItem('atelier_nonce', m[1]); window.__atelierNonce = m[1]; } }catch(e){}
  /* nonce IPC : inclus dans chaque message vers l'app hôte ; l'app rejette sans lui */
  window.__atelierPost = function(p){
    try{ p = Object.assign({}, p, {nonce: (window.__atelierNonce || sessionStorage.getItem('atelier_nonce') || '')}); }catch(e){}
    try{ window.top.postMessage(p, '*'); }catch(e){}
  };
})();
function __ct(){try{return JSON.parse(localStorage.getItem('claudeTargetV1')||'null')}catch(e){return null}}
  var EMBEDDED = (function(){ try { return window.self !== window.top; } catch(e){ return true; } })();
/* sel_overlay.js — select text in a project HTML report → annotate → send to Claude.
   Injected by fig_annotate_server into project .html files (never the gallery index
   or the /.fig_thumbs viewers, which have their own selection systems).
   Selecting text: (1) feeds ~/.claude/fig-selection.json via /selinfo (the "ma
   sélection" flow), (2) shows a pill near the selection: [💬 Annoter] [↑ send].
   ↑ sends `path : « text »` (+ optional comment) into the Claude surface and
   auto-submits (/quote with direct:true). No animations by design. */
(function(){
  if (window.__claudeSelOverlay) return; window.__claudeSelOverlay = true;
  var REL = decodeURIComponent(location.pathname.replace(/^\//,''));
  var NAME = REL.split('/').pop();

  /* PDF-23 : jetons d'Atelier avec repli, plus de palette sombre en dur. Le
     rapport n'a pas le pont de thème (il peindrait SES variables) : le thème
     en cache de la galerie est posé sur nos seuls éléments (themeScope). */
  var css = '#csel-pill{position:fixed;z-index:2147483000;display:none;align-items:center;gap:8px;min-width:320px;max-width:460px;'
    +'background:var(--surface-overlay,#24282d);border:0;border-radius:999px;padding:8px 8px 8px 16px;'
    +'box-shadow:var(--elevation-overlay,0 4px 16px rgba(0,0,0,.25));color:var(--text-primary,#dadee3);'
    +'font:var(--fs-body, 13px) var(--ui-font,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);user-select:none;-webkit-user-select:none}'
    +'#csel-pill .nb{flex:none;line-height:1;display:flex;align-items:center;color:var(--text-muted,#90969d)}'
    +'#csel-pill svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}'
    +'#csel-pill textarea{flex:1;background:transparent;border:none;outline:none;color:var(--text-primary,#dadee3);'
    +'font-size:var(--fs-body, 13px);line-height:1.45;padding:0;resize:none;font-family:inherit;min-height:1lh;height:max(20px,1lh);max-height:120px}'
    +'#csel-pill textarea::placeholder{color:var(--text-muted,#90969d)}'
    +'#csel-pill button{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}'
    +'#csel-pill .go{width:32px;height:32px;border-radius:999px;background:var(--fill-primary,#43474c);color:var(--on-fill-primary,#dadee3);flex:none}'
    +'#csel-pill .go:hover{background:var(--fill-primary-hover,var(--fill-primary,#4d5156))}'
    +'#csel-pill .del{width:24px;height:24px;border-radius:999px;background:none;color:var(--text-muted,#90969d);flex:none}'
    +'#csel-pill .del:hover{color:var(--status-error,#e06c75)}'
    +'#csel-pill .tgt{width:28px;height:28px;border-radius:999px;background:transparent;color:var(--text-muted,#90969d);flex:none}'
    +'#csel-pill .tgt:hover,#csel-pill .tgt.set{background:color-mix(in srgb,var(--text-primary,#dadee3) 12%,transparent);color:var(--text-primary,#dadee3)}'
    +'#csel-tgmenu{position:fixed;z-index:2147483002;display:none;flex-direction:column;min-width:240px;max-width:400px;'
    +'background:var(--surface-overlay,#24282d);border:none;border-radius:10px;padding:4px;'
    +'box-shadow:var(--elevation-overlay,0 4px 16px rgba(0,0,0,.25));color:var(--text-primary,#dadee3);'
    +'font:400 12px var(--ui-font,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)}'
    +'#csel-tgmenu .hd{font-size:var(--fs-caption, 10px);font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted,#90969d);padding:4px 8px}'
    +'#csel-tgmenu .it{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer}'
    +'#csel-tgmenu .it:hover{background:var(--surface-hover,#2c2f34)}'
    +'#csel-tgmenu .it .app{flex:none;font-size:var(--fs-caption, 10px);font-weight:500;letter-spacing:.06em;text-transform:uppercase;'
    +'color:var(--text-secondary,#b9bec4);background:color-mix(in srgb,var(--text-primary,#dadee3) 8%,transparent);border-radius:6px;padding:0 4px}'
    +'#csel-tgmenu .it .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    +'#csel-tgmenu .it.on .t{color:var(--accent,#e77f3e)}';
  var st = document.createElement('style'); st.textContent = css;
  document.head.appendChild(st);

  // one combined bar: 💬 · comment textarea · 🗑 cancel · ◎ session picker · ↑ send
  var pill = document.createElement('div'); pill.id = 'csel-pill';
  pill.innerHTML = '<span class="nb"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z"/></svg></span>'
    + '<textarea rows="1" placeholder="Ajouter une annotation…"></textarea>'
    + '<button class="del" title="Annuler la sélection (Échap)">'
    + '<svg viewBox="0 0 14 14"><path d="M2 3.5h10M5.5 3.5V2.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3'
    + 'M3.5 3.5l.6 8.1c0 .5.4.9.9.9h4c.5 0 .9-.4.9-.9l.6-8.1M5.8 6v4M8.2 6v4"/></svg></button>'
    + '<button class="tgt" title="Choisir la session Claude cible" aria-label="Choisir la session Claude cible"><svg viewBox="0 0 16 16" aria-hidden="true" style="stroke-width:1.5"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg></button>'
    + '<button class="go" title="Envoyer la sélection à la session Claude (Entrée)" aria-label="Envoyer la sélection à la session Claude"><svg viewBox="0 0 16 16" aria-hidden="true" style="stroke-width:1.5"><path d="M8 13V3M4 7l4-4 4 4"/></svg></button>';
  document.body.appendChild(pill);
  var pillTa = pill.querySelector<HTMLTextAreaElement>('textarea');

  var tgMenu = document.createElement('div'); tgMenu.id = 'csel-tgmenu';
  document.body.appendChild(tgMenu);

  var selText = '', selRect = null, tmr: ReturnType<typeof setTimeout> | number = 0;
  var api: { placeAt: (arg0: DOMRect) => void; cancel: () => void; } = null;

  function hideAll(){ pill.style.display = 'none'; }

  // Thème d'Atelier en cache (même origine que la galerie) posé sur nos seuls
  // éléments : setProperty, jamais une feuille construite à partir du cache.
  function themeScope(els: HTMLElement[]){
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('atelier-theme-cache') || 'null'); } catch(e){}
    var vars = cached && cached.vars;
    if (!vars || typeof vars !== 'object') return;
    els.forEach(function(el){
      Object.keys(vars).forEach(function(name){
        if (/^--[a-z0-9-]+$/i.test(name) && typeof vars[name] === 'string') el.style.setProperty(name, vars[name]);
      });
      el.style.colorScheme = cached.colorScheme === 'light' ? 'light' : 'dark';
    });
  }

  // comportement partagé de la pilule (restyle Studio « Add to chat », picker
  // de cible, /quote direct, Entrée/Échap) : SelPill, chargé depuis la galerie
  // comme annot_kit — les rapports vivent n'importe où dans l'arbre projet
  var sharedUiReady=new Promise<void>(function(resolve,reject){
    var css=document.createElement('link');css.rel='stylesheet';css.href='/.fig_thumbs/annotation_ui.css';document.head.appendChild(css);
    if(window.AtelierAnnotationUI){resolve();return;}
    var script=document.createElement('script');script.src='/.fig_thumbs/annotation_ui.bundle.js';script.onload=()=>resolve();script.onerror=reject;document.head.appendChild(script);
  });
  function initPill(){
    api = window.SelPill.attach({
      pill: pill, menu: tgMenu,
      getQuote: function(){ return selText ? {rel: REL, page: '', text: selText} : null; },
      onCancel: function(){
        selText = '';
        try{ window.getSelection().removeAllRanges(); }catch(e){}
        hideAll();
        pushSel('');
      }
    });
  }
  if (window.SelPill) initPill();
  else {
    var ps = document.createElement('script');
    ps.src = '/.fig_thumbs/sel_pill.js';
    ps.onload = initPill;
    ps.onerror = function(){ console.warn('sel_pill load failed'); };
    document.head.appendChild(ps);
  }

  function pushSel(text: string){
    try{
      fetch('/selinfo', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(text
          ? {text: text.slice(0, 4000), rel: REL, name: NAME, page: 'html',
             lines: 1, words: text.split(/\s+/).length}
          : {lines: 0, words: 0})});
    }catch(e){}
  }

  document.addEventListener('selectionchange', function(){
    clearTimeout(tmr);
    tmr = setTimeout(function(){
      // typing a comment (textarea focused or already has text): freeze the bar
      if (pill.style.display === 'flex' && (document.activeElement === pillTa || pillTa.value)) return;
      var s = window.getSelection(), t = s ? String(s).trim() : '';
      if (!t || !s.rangeCount){ selText = ''; hideAll(); pushSel(''); return; }
      selText = t;
      selRect = s.getRangeAt(0).getBoundingClientRect();
      pushSel(t);
      if (api) api.placeAt(selRect);
    }, 180);
  });

  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && api) api.cancel(); });

  /* ---- drawn-annotation mode (shared AnnotKit over the whole document) ---- */
  // bouton de dessin : 32 px, sans bordure, surface élevée ; actif en graphite
  var akBtnCss = '#csel-annot-btn{position:fixed;right:16px;bottom:16px;z-index:901;width:32px;height:32px;padding:0;'
    +'border-radius:999px;border:0;background:var(--surface-overlay,#24282d);color:var(--text-secondary,#b9bec4);'
    +'line-height:1;cursor:pointer;box-shadow:var(--elevation-overlay,0 4px 16px rgba(0,0,0,.25));'
    +'display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;'
    +'transition:background 120ms ease-out,color 120ms ease-out}'
    +'#csel-annot-btn:hover{color:var(--text-primary,#dadee3)}'
    +'#csel-annot-btn.on{background:var(--surface-hover,#2c2f34);color:var(--text-primary,#dadee3)}'
    +'#csel-annot-btn:focus-visible{outline:var(--focus-ring-width,1px) solid var(--focus-ring-color,var(--accent));outline-offset:var(--focus-ring-offset,1px)}'
    +'@media (prefers-reduced-motion:reduce){#csel-annot-btn{transition:none}}'
    +'#csel-annot-overlay{position:absolute;left:0;top:0;z-index:900;pointer-events:none;background:transparent}';
  var akSt = document.createElement('style'); akSt.textContent = akBtnCss;
  document.head.appendChild(akSt);

  var akBtn = document.createElement('button');
  akBtn.id = 'csel-annot-btn';
  akBtn.title = 'Dessiner des annotations sur ce document';
  var PEN = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.3 2.5l2.2 2.2L5.8 12.4l-3 .8.8-3zM10 3.8l2.2 2.2"/></svg>';
  akBtn.innerHTML = PEN;
  document.body.appendChild(akBtn);
  themeScope([pill, tgMenu, akBtn]);

  var akOverlay = document.createElement('canvas');
  akOverlay.id = 'csel-annot-overlay';
  document.body.appendChild(akOverlay);

  var annot = null;                             // AnnotKit api (lazy)

  function docSize(){
    var de = document.documentElement, b = document.body;
    var w = Math.max(de.scrollWidth, b ? b.scrollWidth : 0, de.clientWidth);
    var h = Math.min(20000, Math.max(de.scrollHeight, b ? b.scrollHeight : 0, de.clientHeight));
    return { w: w, h: h };
  }
  function sizeOverlay(){
    var d = docSize();
    akOverlay.width = d.w; akOverlay.height = d.h;      // pixel space = CSS size (1:1)
    akOverlay.style.width = d.w + 'px'; akOverlay.style.height = d.h + 'px';
    if (annot && annot.enabled) annot.redraw();
  }

  function makeHost(){
    return {
      overlay: akOverlay,
      name: function(){ return NAME + '-annot'; },
      exportBase: function(){
        var d = docSize();
        return fetch('/rasterize?path=' + encodeURIComponent(REL) + '&w=' + d.w + '&h=' + d.h)
          .then(function(r){ if (!r.ok) throw new Error('rasterize ' + r.status); return r.blob(); })
          .then(function(blob){ return new Promise<{src: HTMLImageElement;w:number;h:number}>(function(res, rej){
            var img = new Image();
            img.onload = function(){ res({ src: img, w: img.naturalWidth, h: img.naturalHeight }); };
            img.onerror = rej;
            img.src = URL.createObjectURL(blob);
          }); });
      }
    };
  }

  function loadKit(){
    return new Promise<void>(function(res, rej){
      if (window.AnnotKit) return res();
      var s = document.createElement('script');
      s.src = '/.fig_thumbs/annot_kit.js';       // absolute: reports live anywhere in the tree
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('annot_kit load failed')); };
      document.head.appendChild(s);
    });
  }

  akBtn.addEventListener('click', function(){
    sharedUiReady.then(loadKit).then(function(){
      if (!annot){
        sizeOverlay();
        annot = window.AnnotKit.create(makeHost());
      }
      var on = annot.toggle();
      akBtn.classList.toggle('on', on);
      if (on){ hideAll(); sizeOverlay(); }         // don't fight the text-selection pill
    }).catch(function(){ akBtn.textContent = '!'; setTimeout(function(){ akBtn.innerHTML = PEN; }, 1600); });
  });

  window.addEventListener('resize', function(){ if (annot && annot.enabled) sizeOverlay(); });
})();
