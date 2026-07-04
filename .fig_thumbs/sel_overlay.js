function __ct(){try{return JSON.parse(localStorage.getItem('claudeTargetV1')||'null')}catch(e){return null}}
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

  var css = '#csel-pill{position:fixed;z-index:2147483000;display:none;align-items:center;gap:10px;min-width:320px;max-width:460px;'
    +'background:#1d2026;border:1px solid #343842;border-radius:24px;padding:8px 8px 8px 16px;'
    +'box-shadow:0 12px 36px rgba(0,0,0,.45);color:#e4e4e7;'
    +'font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none}'
    +'#csel-pill .nb{font-size:14px;flex:none;line-height:1}'
    +'#csel-pill textarea{flex:1;background:transparent;border:none;outline:none;color:#e4e4e7;'
    +'font-size:13px;line-height:1.45;padding:0;resize:none;font-family:inherit;height:20px;max-height:120px}'
    +'#csel-pill textarea::placeholder{color:#6d7480}'
    +'#csel-pill button{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center}'
    +'#csel-pill .go{width:32px;height:32px;border-radius:50%;background:#c96442;color:#fff;font-size:16px;flex:none}'
    +'#csel-pill .go:hover{background:#e0714a}'
    +'#csel-pill .del{width:26px;height:26px;border-radius:50%;background:none;color:#6d7480;flex:none;padding:0}'
    +'#csel-pill .del:hover{color:#ff7a76}'
    +'#csel-pill .del svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.6;'
    +'stroke-linecap:round;stroke-linejoin:round}'
    +'#csel-pill .tgt{width:28px;height:28px;border-radius:50%;background:transparent;'
    +'border:1px solid #3a4150;color:#9aa3b2;font-size:14px;flex:none}'
    +'#csel-pill .tgt:hover,#csel-pill .tgt.set{border-color:#5b9dff;color:#5b9dff}'
    +'#csel-tgmenu{position:fixed;z-index:2147483002;display:none;flex-direction:column;min-width:240px;max-width:400px;'
    +'background:rgba(24,27,34,.98);border:1px solid #3a4150;border-radius:12px;padding:6px;'
    +'box-shadow:0 14px 48px rgba(0,0,0,.55);color:#e4e4e7;'
    +'font:12.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
    +'#csel-tgmenu .hd{font-size:10.5px;color:#9aa3b2;text-transform:uppercase;letter-spacing:.05em;padding:5px 9px 3px}'
    +'#csel-tgmenu .it{display:flex;gap:8px;align-items:center;padding:7px 9px;border-radius:8px;cursor:pointer}'
    +'#csel-tgmenu .it:hover{background:rgba(255,255,255,.06)}'
    +'#csel-tgmenu .it .app{flex:none;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;'
    +'color:#8ab4ff;border:1px solid #33415e;border-radius:5px;padding:1px 5px}'
    +'#csel-tgmenu .it .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    +'#csel-tgmenu .it.on .t{color:#8ab4ff}';
  var st = document.createElement('style'); st.textContent = css;
  document.head.appendChild(st);

  // one combined bar: 💬 · comment textarea · 🗑 cancel · ◎ session picker · ↑ send
  var pill = document.createElement('div'); pill.id = 'csel-pill';
  pill.innerHTML = '<span class="nb">\u{1F4AC}</span>'
    + '<textarea rows="1" placeholder="Ajouter une annotation…"></textarea>'
    + '<button class="del" title="Annuler la sélection (Échap)">'
    + '<svg viewBox="0 0 14 14"><path d="M2 3.5h10M5.5 3.5V2.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3'
    + 'M3.5 3.5l.6 8.1c0 .5.4.9.9.9h4c.5 0 .9-.4.9-.9l.6-8.1M5.8 6v4M8.2 6v4"/></svg></button>'
    + '<button class="tgt" title="Choisir la session Claude cible">◎</button>'
    + '<button class="go" title="Envoyer la sélection à la session Claude (Entrée)">↑</button>';
  document.body.appendChild(pill);
  var pillTa = pill.querySelector('textarea');

  var tgMenu = document.createElement('div'); tgMenu.id = 'csel-tgmenu';
  document.body.appendChild(tgMenu);

  var selText = '', selRect = null, tmr = 0;

  function place(el, rect){
    el.style.display = 'flex';
    var w = el.offsetWidth, h = el.offsetHeight;
    var x = Math.min(Math.max(8, rect.left + rect.width/2 - w/2), innerWidth - w - 8);
    var y = rect.bottom + 10;
    if (y + h > innerHeight - 8) y = rect.top - h - 10;
    el.style.left = x + 'px'; el.style.top = Math.max(8, y) + 'px';
  }
  function hideAll(){ pill.style.display = 'none'; }

  function pushSel(text){
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
      place(pill, selRect);
    }, 180);
  });

  // clicks on the bar must not destroy the selection — except the textarea, which needs focus
  pill.addEventListener('mousedown', function(e){ if (e.target !== pillTa) e.preventDefault(); });
  // Mode Studio : pilule simple « Add to chat » (comme la sélection du chat) —
  // pas de commentaire ni corbeille, le texte part en puce dans le composer.
  if (EMBEDDED){
    var __go = pill.querySelector('.go');
    ['textarea','.del','.tgt','.nb'].forEach(function(sel){
      var el = pill.querySelector(sel); if (el) el.style.display = 'none';
    });
    pill.style.cssText += ';background:transparent;border:none;box-shadow:none;padding:0;min-width:0;width:auto';
    if (__go){ __go.innerHTML = '&#128172;&nbsp; Add to chat';
      __go.style.cssText = 'width:auto;min-width:0;height:auto;border-radius:999px;padding:7px 14px;font-size:13px;white-space:nowrap;background:#2c313a;color:#e6e6e6;border:1px solid #3a414d;box-shadow:0 6px 18px rgba(0,0,0,0.5);cursor:pointer'; }
  }


  var EMBEDDED = (function(){ try { return window.self !== window.top; } catch(e){ return true; } })();

  function send(){
    var go = pill.querySelector('.go');
    var comment = pillTa.value.trim();
    go.textContent = '⏳';
    fetch('/quote', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({rel: REL, page: '', text: selText, comment: comment || '', direct: true, target: __ct(), embed: EMBEDDED})})
      .then(function(r){ return r.json(); })
      .then(function(j){ if (EMBEDDED && j && j.message) window.top.postMessage({type: 'atelier-add-to-chat', text: j.message}, '*');
        go.textContent = '✓'; setTimeout(function(){ go.textContent = '↑'; pillTa.value = ''; hideAll(); }, 1200); })
      .catch(function(){ go.textContent = '!'; setTimeout(function(){ go.textContent = '↑'; }, 1600); });
  }

  function cancel(){
    selText = '';
    pillTa.value = '';
    try{ window.getSelection().removeAllRanges(); }catch(e){}
    hideAll();
    pushSel('');
  }

  pill.querySelector('.go').addEventListener('click', function(){ send(); });
  pill.querySelector('.del').addEventListener('click', function(e){ e.stopPropagation(); cancel(); });
  pillTa.addEventListener('input', function(){ pillTa.style.height = '20px'; pillTa.style.height = Math.min(120, pillTa.scrollHeight) + 'px'; });
  pillTa.addEventListener('keydown', function(e){
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    else if (e.key === 'Escape'){ e.preventDefault(); cancel(); }
  });

  /* ---- Claude-session target picker (stores localStorage 'claudeTargetV1') ---- */
  (function(){
    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }
    var tgtBtn = pill.querySelector('.tgt');
    if (EMBEDDED) tgtBtn.style.display = 'none';
    function markTgt(){ tgtBtn.classList.toggle('set', !!__ct()); }
    markTgt();
    tgMenu.addEventListener('mousedown', function(e){ e.preventDefault(); });   // keep selection
    tgtBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var cur = __ct();
      var html = '<div class="hd">Envoyer vers</div>'
        + '<div class="it' + (cur ? '' : ' on') + '" data-i="-1"><span class="app">auto</span>'
        + '<span class="t">Session du projet (auto)</span></div>';
      fetch('/claude-targets').then(function(r){ return r.json(); }).then(function(j){
        (j.targets || []).forEach(function(t, i){
          var on = cur && cur.app === t.app && cur.id === t.id;
          html += '<div class="it' + (on ? ' on' : '') + '" data-i="' + i + '"><span class="app">'
            + esc(t.app) + '</span><span class="t">' + esc(t.title || t.id)
            + (t.inProject ? '' : ' — ' + esc(String(t.cwd || '').split('/').pop())) + '</span></div>';
        });
        tgMenu.innerHTML = html;
        tgMenu.style.display = 'flex';
        var r = tgtBtn.getBoundingClientRect();
        tgMenu.style.left = Math.max(8, Math.min(r.left - 120, innerWidth - tgMenu.offsetWidth - 8)) + 'px';
        tgMenu.style.top = Math.max(8, r.top - tgMenu.offsetHeight - 10) + 'px';
        tgMenu.querySelectorAll('.it').forEach(function(it){
          it.addEventListener('click', function(ev){
            ev.stopPropagation();
            var i = +it.dataset.i;
            if (i < 0) localStorage.removeItem('claudeTargetV1');
            else localStorage.setItem('claudeTargetV1', JSON.stringify(
              { app: j.targets[i].app, id: j.targets[i].id, title: j.targets[i].title }));
            markTgt(); tgMenu.style.display = 'none';
          });
        });
        document.addEventListener('click', function h(){ tgMenu.style.display = 'none'; document.removeEventListener('click', h); });
      }).catch(function(err){ console.warn('claude-targets failed', err); });
    });
  })();
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') cancel(); });

  /* ---- drawn-annotation mode (shared AnnotKit over the whole document) ---- */
  var akBtnCss = '#csel-annot-btn{position:fixed;right:16px;bottom:16px;z-index:901;width:40px;height:40px;'
    +'border-radius:50%;border:1px solid #3a4150;background:rgba(24,27,34,.97);color:#e4e4e7;'
    +'font-size:18px;line-height:1;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.45);'
    +'display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}'
    +'#csel-annot-btn:hover{border-color:#5b6575}'
    +'#csel-annot-btn.on{background:#5b9dff;color:#fff;border-color:#5b9dff}'
    +'#csel-annot-overlay{position:absolute;left:0;top:0;z-index:900;pointer-events:none;background:transparent}';
  var akSt = document.createElement('style'); akSt.textContent = akBtnCss;
  document.head.appendChild(akSt);

  var akBtn = document.createElement('button');
  akBtn.id = 'csel-annot-btn';
  akBtn.title = 'Dessiner des annotations sur ce document';
  akBtn.textContent = '✎';                 // ✎
  document.body.appendChild(akBtn);

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
          .then(function(blob){ return new Promise(function(res, rej){
            var img = new Image();
            img.onload = function(){ res({ src: img, w: img.naturalWidth, h: img.naturalHeight }); };
            img.onerror = rej;
            img.src = URL.createObjectURL(blob);
          }); });
      }
    };
  }

  function loadKit(){
    return new Promise(function(res, rej){
      if (window.AnnotKit) return res();
      var s = document.createElement('script');
      s.src = '/.fig_thumbs/annot_kit.js';       // absolute: reports live anywhere in the tree
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('annot_kit load failed')); };
      document.head.appendChild(s);
    });
  }

  akBtn.addEventListener('click', function(){
    loadKit().then(function(){
      if (!annot){
        sizeOverlay();
        annot = window.AnnotKit.create(makeHost());
      }
      var on = annot.toggle();
      akBtn.classList.toggle('on', on);
      if (on){ hideAll(); sizeOverlay(); }         // don't fight the text-selection pill
    }).catch(function(){ akBtn.textContent = '!'; setTimeout(function(){ akBtn.textContent = '✎'; }, 1600); });
  });

  window.addEventListener('resize', function(){ if (annot && annot.enabled) sizeOverlay(); });
})();
