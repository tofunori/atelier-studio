/* Pilule « Add to chat » partagée (mode Atelier Studio uniquement).
   Utilisée par code_editor.html et md_viewer.html pour donner aux .py/.jl/.md
   les mêmes fonctions d'annotation que le LaTeX studio. */
(function () {
  var EMB = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (!EMB) { window.StudioPill = { attachCM: function () {}, attachDoc: function () {} }; return; }

  var btn = document.createElement('button');
  btn.innerHTML = '&#128172;&nbsp; Add to chat';
  btn.style.cssText = 'position:fixed;z-index:99999;display:none;background:#2c313a;' +
    'color:#e6e6e6;border:1px solid #3a414d;border-radius:999px;padding:7px 14px;' +
    'font-size:13px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.5);' +
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  function mount() { if (document.body && !btn.parentNode) document.body.appendChild(btn); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  var current = null; // {text, page, rel}
  function show(x, y, data) {
    mount(); current = data;
    btn.style.left = Math.max(8, x - 60) + 'px';
    btn.style.top = Math.max(8, y - 42) + 'px';
    btn.style.display = 'block';
  }
  function hide() { btn.style.display = 'none'; current = null; }

  btn.addEventListener('mousedown', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (!current) return;
    var payload = { rel: current.rel, page: current.page, text: current.text,
                    comment: '', direct: true, embed: true };
    fetch('/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.message) {
          window.top.postMessage({ type: 'atelier-add-to-chat', text: j.message }, '*');
        }
      })
      .catch(function () {});
    hide();
    try { window.getSelection().removeAllRanges(); } catch (err) {}
  });

  window.StudioPill = {
    // éditeurs CodeMirror 5 : sélection + numéros de lignes exacts
    attachCM: function (cm, getRel) {
      cm.on('cursorActivity', function () {
        setTimeout(function () {
          var t = cm.getSelection();
          if (!t || !t.trim()) { hide(); return; }
          var from = cm.getCursor('from'), to = cm.getCursor('to');
          var c = cm.cursorCoords(from, 'window');
          show(c.left + 40, c.top,
               { text: t, page: 'L' + (from.line + 1) + '-' + (to.line + 1), rel: getRel() });
        }, 0);
      });
    },
    // vues rendues (markdown, HTML) : sélection DOM native
    attachDoc: function (getRel) {
      document.addEventListener('mouseup', function (e) {
        if (e.target === btn) return;
        setTimeout(function () {
          var sel = window.getSelection();
          var t = sel ? String(sel) : '';
          if (!t.trim() || !sel || sel.rangeCount === 0) { hide(); return; }
          var r = sel.getRangeAt(0).getBoundingClientRect();
          show(r.left + r.width / 2 - 40, r.top, { text: t.trim(), page: '', rel: getRel() });
        }, 0);
      });
    },
  };
})();
