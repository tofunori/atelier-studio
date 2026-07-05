(function(){
  try{ var m=(location.hash||'').match(/atelier_nonce=([\w-]+)/); if(m) sessionStorage.setItem('atelier_nonce', m[1]); }catch(e){}
  /* nonce IPC : inclus dans chaque message vers l'app hôte ; l'app rejette sans lui */
  window.__atelierPost = function(p){
    try{ p = Object.assign({}, p, {nonce: sessionStorage.getItem('atelier_nonce')||''}); }catch(e){}
    try{ window.top.postMessage(p, '*'); }catch(e){}
  };
})();
/* annot_kit.js — Claude-Science-style annotation kit shared by the viewers.
   Faithful generalization of the gallery lightbox annotation (the visual and
   functional reference, which keeps its own copy): dashed ellipse / arrow /
   rect marks with numbered badges, the "Ajouter une annotation…" card, a
   counter pill, PNG composition -> POST /save (annotations/) -> Claude.

   Host contract (AnnotKit.create(host)):
     overlay     : transparent <canvas> laid over the content; its width/height
                   attributes define the working pixel space (host keeps its CSS
                   box glued to the content).
     exportBase()          -> Promise<{src, w, h}>  drawable (canvas/img) + its
                              pixel size; strokes are scaled from overlay space.
     name()                -> base name for the saved PNG (e.g. "report.pdf-p3").
     getPos(e)  (optional) -> {x,y} in overlay pixel space (default: rect scale).
     onCount(n) (optional) -> annotated-notes counter hook.
   Returned api: {enable, disable, toggle, enabled, hasNotes, send(direct)}.   */
(function(){
  'use strict';
  if (window.AnnotKit) return;

  var CSS =
    '.akBar{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:902;display:none;'
    +'gap:2px;align-items:center;background:rgba(26,29,34,.92);backdrop-filter:blur(10px);border:1px solid #333a45;'
    +'border-radius:10px;padding:4px 6px;font:13px -apple-system,system-ui,sans-serif;color:#e4e4e7}'
    +'.akBar.on{display:flex}'
    +'.akBar button{padding:0;width:26px;height:24px;font-size:12px;background:transparent;color:#8a919e;display:inline-flex;align-items:center;justify-content:center;'
    +'border:none;border-radius:6px;cursor:pointer}'
    +'.akBar button:hover{background:#2c313a;color:#e8eaed}'
    +'.akBar button.sel{background:#2c313a;color:#e8eaed;border:none}'
    +'.akBar input[type=color]{width:30px;height:28px;border:none;background:none;cursor:pointer;padding:0}'
    +'.akNote{position:fixed;z-index:903;display:none;align-items:stretch;gap:0;min-width:340px;max-width:480px;overflow:hidden;'
    +'background:#1a1d22;border:1px solid #333a45;border-radius:10px;padding:0;'
    +'box-shadow:0 12px 36px rgba(0,0,0,.45);font:13px -apple-system,system-ui,sans-serif;color:#e6e7ea}'
    +'.akNote .nb{color:#8a919e;font-size:12px;font-weight:600;flex:none;display:flex;align-items:center;padding:0 12px;background:#262b31;border-right:1px solid #333a45}'
    +'.akNote textarea{flex:1;background:transparent;border:none;outline:none;color:#e6e7ea;'
    +'font-size:13px;line-height:1.45;padding:0;resize:none;font-family:inherit;height:20px;max-height:120px}'
    +'.akNote textarea::placeholder{color:#6d7480}'
    +'.akNote .del{width:36px;border-radius:0;background:none;border:none;border-left:1px solid #333a45;color:#6b7482;'
    +'cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;padding:0}'
    +'.akNote .del:hover{background:#2c313a;color:#ff8a8a}'
    +'.akNote .del svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.6;'
    +'stroke-linecap:round;stroke-linejoin:round}'
    +'.akNote .anSave{width:36px;border-radius:0;background:none;color:#cfd4dc;border:none;border-left:1px solid #333a45;'
    +'font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;'
    +'flex:none;font-family:inherit}'
    +'.akNote .anSave:hover{background:#2c313a;color:#fff}'
    +'.akPill{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:902;display:none;'
    +'align-items:center;gap:12px;background:rgba(24,27,34,.97);border:1px solid #3a4150;border-radius:28px;'
    +'padding:7px 7px 7px 18px;box-shadow:0 10px 36px rgba(0,0,0,.5);color:#e4e4e7;font:13.5px -apple-system,system-ui,sans-serif}'
    +'.akPill.on{display:flex}'
    +'.akPill button{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit}'
    +'.akPill .x{width:28px;height:28px;border-radius:50%;background:transparent;color:#9aa3b2;'
    +'border:1px solid #3a4150;font-size:13px}'
    +'.akPill .x:hover{border-color:#5b6575;color:#fff}'
    +'.akPill .go{width:32px;height:32px;border-radius:50%;background:#c96442;color:#fff;font-size:16px}'
    +'.akPill .go:hover{background:#e0714a}'
    +'.akPill .tg{width:28px;height:28px;border-radius:50%;background:transparent;color:#9aa3b2;'
    +'border:1px solid #3a4150;font-size:13px}'
    +'.akPill .tg:hover,.akPill .tg.set{border-color:#5b9dff;color:#5b9dff}'
    +'.akTgMenu{position:fixed;z-index:904;display:none;flex-direction:column;min-width:260px;max-width:420px;'
    +'background:rgba(24,27,34,.98);border:1px solid #3a4150;border-radius:12px;padding:6px;'
    +'box-shadow:0 14px 48px rgba(0,0,0,.55);font:12.5px -apple-system,system-ui,sans-serif;color:#e4e4e7}'
    +'.akTgMenu .it{display:flex;gap:8px;align-items:center;padding:7px 9px;border-radius:8px;cursor:pointer}'
    +'.akTgMenu .it:hover{background:rgba(255,255,255,.06)}'
    +'.akTgMenu .it .app{flex:none;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;'
    +'color:#8ab4ff;border:1px solid #33415e;border-radius:5px;padding:1px 5px}'
    +'.akTgMenu .it .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    +'.akTgMenu .it.on .t{color:#8ab4ff}'
    +'.akTgMenu .hd{font-size:10.5px;color:#9aa3b2;text-transform:uppercase;letter-spacing:.05em;padding:5px 9px 3px}';

  var styleDone = false;
  function ensureStyle(){
    if (styleDone) return;
    var s = document.createElement('style'); s.textContent = CSS;
    document.head.appendChild(s); styleDone = true;
  }

  function el(html){ var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

  function create(host){
    ensureStyle();
    var overlay = host.overlay;
    var strokes = [], cur = null, tool = 'ellipse', enabled = false;

    var bar = el('<div class="akBar">'
      +'<button data-tool="ellipse" class="sel" title="Encercler (1)">&#9711;</button>'
      +'<button data-tool="arrow" title="Flèche (2)">&#8594;</button>'
      +'<button data-tool="rect" title="Rectangle (3)">&#9645;</button>'
      +'<input type="color" value="#33415e" title="Couleur">'
      +'<button class="akUndo" title="Annuler le dernier tracé">&#8630;</button>'
      +'<button class="akClear" title="Tout effacer">&#10006;</button>'
      +'</div>');
    var note = el('<div class="akNote">'
      +'<span class="nb">1</span>'
      +'<textarea rows="1" placeholder="Ajouter une annotation&hellip;"></textarea>'
      +'<button class="del" title="Supprimer cette annotation (Échap : annuler)">'
      +'<svg viewBox="0 0 14 14"><path d="M2 3.5h10M5.5 3.5V2.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3'
      +'M3.5 3.5l.6 8.1c0 .5.4.9.9.9h4c.5 0 .9-.4.9-.9l.6-8.1M5.8 6v4M8.2 6v4"/></svg></button>'
      +'<button class="anSave" title="Enregistrer (Entrée)">&#10003;</button></div>');
    var pill = el('<div class="akPill"><span>&#128172;</span><span class="n"></span>'
      +'<button class="tg" title="Choisir la session Claude cible">&#9678;</button>'
      +'<button class="x" title="Supprimer les commentaires sans envoyer">&#10005;</button>'
      +'<button class="go" title="Envoyer à la session Claude">&#8593;</button></div>');
    var tgMenu = el('<div class="akTgMenu"></div>');
    document.body.appendChild(bar); document.body.appendChild(note);
    document.body.appendChild(pill); document.body.appendChild(tgMenu);

    function getPos(e){
      if (host.getPos) return host.getPos(e);
      var r = overlay.getBoundingClientRect();
      return { x: (e.clientX - r.left) * overlay.width / r.width,
               y: (e.clientY - r.top) * overlay.height / r.height };
    }

    function redraw(ctx2, scale){
      var x = ctx2 || overlay.getContext('2d'), k = scale || 1;
      if (!ctx2) x.clearRect(0, 0, overlay.width, overlay.height);
      var lw = Math.max(2, overlay.width / 300) * k, sw = lw * 1.15;
      strokes.concat(cur ? [cur] : []).forEach(function(s){
        x.strokeStyle = s.color; x.fillStyle = s.color;
        x.lineWidth = sw; x.lineCap = 'round'; x.lineJoin = 'round';
        if (s.tool === 'ellipse'){
          x.save(); x.setLineDash([sw*4, sw*3.2]);
          x.beginPath();
          x.ellipse((s.x1+s.x2)/2*k, (s.y1+s.y2)/2*k, Math.abs(s.x2-s.x1)/2*k||1, Math.abs(s.y2-s.y1)/2*k||1, 0, 0, 2*Math.PI);
          x.stroke(); x.restore();
        } else if (s.tool === 'rect'){
          x.save(); x.setLineDash([sw*4, sw*3.2]);
          x.strokeRect(s.x1*k, s.y1*k, (s.x2-s.x1)*k, (s.y2-s.y1)*k);
          x.restore();
        } else if (s.tool === 'arrow'){
          x.beginPath(); x.moveTo(s.x1*k, s.y1*k); x.lineTo(s.x2*k, s.y2*k); x.stroke();
          var a = Math.atan2(s.y2-s.y1, s.x2-s.x1), h = sw*7;
          x.beginPath(); x.moveTo(s.x2*k, s.y2*k);
          x.lineTo(s.x2*k - h*Math.cos(a-0.45), s.y2*k - h*Math.sin(a-0.45));
          x.lineTo(s.x2*k - h*Math.cos(a+0.45), s.y2*k - h*Math.sin(a+0.45));
          x.closePath(); x.fill();
        }
        if (s.n){
          var b = badgeAnchor(s), r = lw*3.2;
          x.beginPath(); x.arc(b.bx*k, b.by*k - r*1.2, r, 0, 7); x.fillStyle = s.color; x.fill();
          x.fillStyle = '#fff'; x.font = '600 ' + (r*1.2) + 'px -apple-system,sans-serif';
          x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillText(s.n, b.bx*k, b.by*k - r*1.2);
          x.textAlign = 'start'; x.textBaseline = 'alphabetic';
        }
      });
      if (!ctx2) pillUpdate();
    }

    function badgeAnchor(s){
      if (s.tool === 'ellipse') return {bx:(s.x1+s.x2)/2, by:Math.min(s.y1,s.y2)};
      if (s.tool === 'rect') return {bx:Math.min(s.x1,s.x2), by:Math.min(s.y1,s.y2)};
      return {bx:s.x1, by:s.y1};
    }
    function badgeHit(p){
      var lw = Math.max(2, overlay.width/300), r = lw*3.2;
      for (var i = 0; i < strokes.length; i++){
        var s = strokes[i];
        if (!s.n) continue;
        var b = badgeAnchor(s);
        if (Math.hypot(p.x-b.bx, p.y-(b.by-r*1.2)) <= r*1.6) return s;
      }
      return null;
    }
    function renumber(){
      var n = 0;
      strokes.forEach(function(s){ if (s.note) s.n = ++n; else { delete s.n; delete s.note; } });
    }
    function pillUpdate(){
      var n = strokes.filter(function(s){ return s.note; }).length;
      pill.querySelector('.n').textContent = n + (n > 1 ? ' commentaires' : ' commentaire');
      pill.classList.toggle('on', enabled && n > 0);
      if (host.onCount) host.onCount(n);
    }

    function askNote(stroke, cx, cy){
      var inp = note.querySelector('textarea');
      var isEdit = !!stroke.note;
      if (!stroke.n) stroke.n = strokes.filter(function(s){ return s.n; }).length + 1;
      note.querySelector('.nb').textContent = stroke.n;
      note.style.display = 'flex';
      note.style.left = Math.min(cx, window.innerWidth - 480) + 'px';
      note.style.top = Math.min(cy + 14, window.innerHeight - 70) + 'px';
      inp.value = stroke.note || ''; inp.focus(); inp.select();
      redraw();
      var close = function(){ note.style.display = 'none'; redraw(); };
      var save = function(){
        stroke.note = inp.value.trim();
        if (!stroke.note){ delete stroke.n; delete stroke.note; renumber(); }
        close();
      };
      var cancel = function(){
        if (!isEdit){
          var i = strokes.indexOf(stroke);
          if (i >= 0) strokes.splice(i, 1);
          renumber();
        }
        close();
      };
      note.querySelector('.del').onclick = function(){
        var i = strokes.indexOf(stroke);
        if (i >= 0) strokes.splice(i, 1);
        renumber(); close();
      };
      note.querySelector('.anSave').onclick = function(e){ e.stopPropagation(); save(); };
      inp.oninput = function(){ inp.style.height = '20px'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px'; };
      inp.oninput();
      inp.onkeydown = function(e){
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); save(); }
        else if (e.key === 'Escape'){ cancel(); }
      };
    }

    overlay.addEventListener('pointerdown', function(e){
      if (!enabled) return;
      e.preventDefault();
      var p = getPos(e), col = bar.querySelector('input[type=color]').value;
      var hit = badgeHit(p);
      if (hit){ askNote(hit, e.clientX, e.clientY); return; }
      cur = {tool: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: col};
      overlay.setPointerCapture(e.pointerId);
    });
    overlay.addEventListener('pointermove', function(e){
      if (!cur) return;
      var p = getPos(e); cur.x2 = p.x; cur.y2 = p.y; redraw();
    });
    overlay.addEventListener('pointerup', function(e){
      if (!cur) return;
      var s = cur; cur = null;
      if (Math.hypot(s.x2-s.x1, s.y2-s.y1) < 4){       // click → default-size circle
        var d = overlay.width / 14;
        s.tool = 'ellipse'; s.x1 -= d/2; s.y1 -= d/2; s.x2 = s.x1 + d; s.y2 = s.y1 + d;
      }
      strokes.push(s); redraw();
      askNote(s, e.clientX, e.clientY);
    });

    bar.querySelectorAll('button[data-tool]').forEach(function(b){
      b.onclick = function(){
        tool = b.dataset.tool;
        bar.querySelectorAll('button[data-tool]').forEach(function(o){ o.classList.toggle('sel', o === b); });
      };
    });
    bar.querySelector('.akUndo').onclick = function(){ strokes.pop(); renumber(); note.style.display = 'none'; redraw(); };
    bar.querySelector('.akClear').onclick = function(){ strokes = []; shutdown(); };

    var EMBEDDED = (function(){ try { return window.self !== window.top; } catch(e){ return true; } })();
    // --- explicit Claude-session target (shared across viewers via localStorage) ---
    function getTarget(){
      try{ return JSON.parse(localStorage.getItem('claudeTargetV1') || 'null'); }catch(e){ return null; }
    }
    function markTg(){ pill.querySelector('.tg').classList.toggle('set', !!getTarget()); }
    markTg();
    if (EMBEDDED) pill.querySelector('.tg').style.display = 'none';
    pill.querySelector('.tg').onclick = async function(e){
      e.stopPropagation();
      var cur = getTarget();
      var items = '<div class="hd">Envoyer vers</div>'
        + '<div class="it' + (cur ? '' : ' on') + '" data-i="-1"><span class="app">auto</span>'
        + '<span class="t">Session du projet (auto)</span></div>';
      try{
        var j = await (await fetch('/claude-targets')).json();
        (j.targets || []).forEach(function(t, i){
          var on = cur && cur.app === t.app && cur.id === t.id;
          items += '<div class="it' + (on ? ' on' : '') + '" data-i="' + i + '">'
            + '<span class="app">' + t.app + '</span><span class="t">'
            + String(t.title || t.id).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; })
            + (t.inProject ? '' : ' — ' + String(t.cwd || '').split('/').pop()) + '</span></div>';
        });
        tgMenu.innerHTML = items;
        var r = pill.getBoundingClientRect();
        tgMenu.style.display = 'flex';
        tgMenu.style.left = Math.max(8, r.left) + 'px';
        tgMenu.style.top = Math.max(8, r.top - tgMenu.offsetHeight - 8) + 'px';
        tgMenu.querySelectorAll('.it').forEach(function(it){
          it.onclick = function(ev){
            ev.stopPropagation();
            var i = +it.dataset.i;
            if (i < 0) localStorage.removeItem('claudeTargetV1');
            else localStorage.setItem('claudeTargetV1', JSON.stringify(
              {app: j.targets[i].app, id: j.targets[i].id, title: j.targets[i].title}));
            markTg(); tgMenu.style.display = 'none';
          };
        });
        document.addEventListener('click', function h(){ tgMenu.style.display = 'none'; document.removeEventListener('click', h); });
      }catch(err){ console.warn('claude-targets failed', err); }
    };

    async function send(direct){
      var base = await host.exportBase();
      var out = document.createElement('canvas');
      out.width = base.w; out.height = base.h;
      var x = out.getContext('2d');
      x.drawImage(base.src, 0, 0, base.w, base.h);
      redraw(x, base.w / overlay.width);
      var r = await fetch('/save', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: host.name(), dataURL: out.toDataURL('image/png'), direct: !!direct,
          target: getTarget(), embed: EMBEDDED,
          notes: strokes.filter(function(s){ return s.note; }).map(function(s){ return {n: s.n, text: s.note}; })})});
      var j = await r.json();
      if (EMBEDDED && j && j.message) __atelierPost({type: 'atelier-add-to-chat', text: j.message});
      return j;
    }

    function shutdown(){
      enabled = false; cur = null;
      bar.classList.remove('on'); pill.classList.remove('on');
      note.style.display = 'none'; overlay.style.pointerEvents = 'none';
      redraw();
    }
    pill.querySelector('.x').onclick = function(){
      strokes = []; shutdown();
    };
    pill.querySelector('.go').onclick = async function(){
      var go = this;
      go.textContent = '⏳';
      try{
        await send(true);
        go.textContent = '✓';
        strokes = []; setTimeout(function(){ go.textContent = '↑'; shutdown(); }, 1500);
      }catch(e){
        go.textContent = '!';
        setTimeout(function(){ go.textContent = '↑'; }, 1800);
      }
    };

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && enabled) shutdown();
    });
    var api = {
      enable: function(){ enabled = true; bar.classList.add('on'); overlay.style.pointerEvents = 'auto'; redraw(); },
      disable: shutdown,
      toggle: function(){ enabled ? api.disable() : api.enable(); return enabled; },
      get enabled(){ return enabled; },
      hasNotes: function(){ return strokes.some(function(s){ return s.note; }); },
      redraw: redraw,
      send: send
    };
    return api;
  }

  window.AnnotKit = { create: create };
})();
