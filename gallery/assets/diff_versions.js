"use strict";
// Historique de versions + comparaison EN PLACE (CodeMirror 5) — module partagé
// par latex_studio.html et code_editor.html. Le document affiché reste le buffer
// courant (thème, coloration syntaxique, numéros de ligne et wrap intacts) :
// mots ajoutés surlignés, mots supprimés insérés en widgets barrés, bruit de
// rewrap (retours à la ligne déplacés) filtré. Les versions persistent en
// localStorage par fichier (plafond ~1,5 Mo, plus anciennes éliminées d'abord).
//
// Intégration git (si le fichier est suivi — sinon tout se dégrade en silence) :
// - pseudo-version « HEAD » en tête du sélecteur ‹ ± › (naviguer avant la
//   première sauvegarde de session = comparer au dernier commit) ;
// - gouttière : barres vertes (ajouté) / ambre (modifié) et triangle rouge
//   (lignes supprimées) vs HEAD, recalculées en tapant ;
// - clic sur une marque de gouttière → comparaison vs HEAD scrollée à la ligne.
//
// Hôte :
//   const dv = DiffVersions({
//     getCm:       () => cm,            // l'instance est créée après le chargement
//     path,                             // chemin absolu du fichier (clé de stockage)
//     notify:      (msg) => ...,        // message furtif barre de statut ("" = effacer)
//     els:         {tag, prev, next, restore, group?},  // boutons existants de l'hôte
//     restoreText: async (text) => ..., // réécrit le fichier + met à jour le buffer
//   });
//   dv.push(before, after)  après chaque sauvegarde / rechargement externe
//   dv.isShown()            le mode comparaison est-il actif ?
window.DiffVersions = function(opts){
  const { getCm, path, notify, els, restoreText } = opts;
  const VERSIONS = []; // {before, ts, head?, sha?} — diff contre le buffer courant
  let idx = -1, shown = false, marks = [];
  let extCmp = null; // comparaison ponctuelle depuis l'historique : {before, label}
  const curVersion = () => extCmp || VERSIONS[idx];
  let headText = null, headSha = "";
  const KEY = "texDiffV1:" + path;
  const MAX = 1500000;
  const GUTTER = "dv-git";

  // styles des décorations + gouttière (une seule injection par page)
  if(!document.getElementById("dvStyles")){
    const st = document.createElement("style");
    st.id = "dvStyles";
    st.textContent =
      ".dAddM{background:rgba(52,201,142,.18);border-bottom:1px solid rgba(52,201,142,.6);border-radius:2px}" +
      ".dDelW{background:rgba(224,108,117,.14);color:#e09aa0;text-decoration:line-through;border-radius:2px;padding:0 1px}" +
      ".CodeMirror .dv-git{width:6px}" +
      ".dv-cell{position:relative;width:6px;height:1.55em}" +
      ".dv-bar{position:absolute;left:1px;top:0;bottom:-2px;width:3px;cursor:pointer}" +
      ".dv-bar.a{background:rgba(52,201,142,.85)}" +
      ".dv-bar.m{background:rgba(232,179,74,.85)}" +
      ".dv-del{position:absolute;left:0;top:-5px;width:0;height:0;cursor:pointer;" +
        "border-left:7px solid rgba(224,108,117,.95);border-top:5px solid transparent;border-bottom:5px solid transparent}" +
      ".dv-del.eof{top:auto;bottom:-4px}";
    document.head.appendChild(st);
  }

  function persist(){
    try{
      let items = VERSIONS.filter(v => !v.head).map(v => ({b: v.before, t: v.ts}));
      let size = items.reduce((n, it) => n + it.b.length, 0);
      while(items.length > 1 && size > MAX){ size -= items[0].b.length; items.shift(); }
      localStorage.setItem(KEY, JSON.stringify({v: 1, items}));
    }catch(e){ try{ localStorage.removeItem(KEY); }catch(e2){} }
  }
  function sessionCount(){ return VERSIONS.length - (VERSIONS[0] && VERSIONS[0].head ? 1 : 0); }
  function arm(){
    if(els.group) els.group.style.display = "";
    els.tag.disabled = false; els.tag.style.opacity = "";
    // ‹ › retirés de la barre : la navigation entre versions passe par l'historique
    [els.prev, els.next].forEach(b => { if(b) b.style.display = "none"; });
    // Rétablir n'a de sens que pendant la comparaison (réécrit la version affichée)
    if(els.restore) els.restore.style.display = shown ? "" : "none";
    ensureHistUi();
    updateTag();
  }
  function labelOf(i){
    const v = VERSIONS[i];
    if(!v) return "";
    if(v.head) return "HEAD" + (v.sha ? " (" + v.sha + ")" : "");
    const si = i - (VERSIONS[0] && VERSIONS[0].head ? 1 : 0);
    return "v" + (si + 2) + "/" + (sessionCount() + 1);
  }
  function updateTag(){
    els.tag.title = "Modifications — " + labelOf(idx) + " (cliquer : comparer)";
    if(els.prev) els.prev.disabled = idx <= 0;
    if(els.next) els.next.disabled = idx >= VERSIONS.length - 1;
  }
  function clearMarks(){
    marks.forEach(m => { try{ m.clear(); }catch(e){} });
    marks = [];
  }
  function render(){
    const v = curVersion(), cm = getCm();
    if(!v || !cm) return;
    clearMarks();
    // diffWordsWithSpace garantit que la concaténation des parts non-removed
    // reproduit exactement le buffer → offsets sûrs pour markText/setBookmark.
    const after = cm.getValue();
    const wsn = s => s.replace(/\s+/g, " ").trim();
    // rewrap intégral : contenu identique aux blancs près → rien à marquer
    const parts = wsn(v.before) === wsn(after) ? [] : Diff.diffWordsWithSpace(v.before, after);
    // Bruit de rewrap : un mot déplacé de l'autre côté d'un retour à la ligne
    // apparaît comme supprimé+ajouté (dans un ordre ou l'autre, parfois séparés
    // par un blanc inchangé). Apparier ces paires pour ne rien marquer.
    const noisePair = (i) => {
      const pt = parts[i];
      for(let j = i + 1; j <= i + 2 && j < parts.length; j++){
        const cand = parts[j];
        if(j === i + 1 && !cand.removed && !cand.added){
          if(wsn(cand.value) !== "") return -1; // texte commun réel entre les deux : vraie modif
          continue;
        }
        if(!!cand.removed === !pt.removed && !!cand.added === !pt.added
           && wsn(cand.value) === wsn(pt.value)) return j;
        return -1;
      }
      return -1;
    };
    const skip = new Set();
    let at = 0, firstPos = null, changes = 0;
    for(let i = 0; i < parts.length; i++){
      const pt = parts[i];
      if(skip.has(i)){ if(!pt.removed) at += pt.value.length; continue; }
      if(pt.removed){
        // bruit de rewrap : même contenu, seuls les blancs/retours diffèrent
        if(wsn(pt.value)){
          const j = noisePair(i);
          if(j >= 0){ skip.add(j); continue; }
        }
        if(!wsn(pt.value)) continue; // retour à la ligne déplacé : rien à montrer
        const w = document.createElement("span");
        w.className = "dDelW";
        const disp = pt.value.replace(/\s+/g, " ").trim();
        w.textContent = disp.length > 160 ? disp.slice(0, 157) + "⋯" : disp;
        if(disp.length > 160) w.title = disp;
        const pos = cm.posFromIndex(at);
        marks.push(cm.setBookmark(pos, {widget: w}));
        if(!firstPos) firstPos = pos;
        changes++;
        continue;
      }
      if(pt.added && wsn(pt.value)){
        // sens inverse du bruit de rewrap : mot ajouté ici, retiré juste après
        const j = noisePair(i);
        if(j >= 0){ skip.add(j); at += pt.value.length; continue; }
        const from = cm.posFromIndex(at), to = cm.posFromIndex(at + pt.value.length);
        marks.push(cm.markText(from, to, {className: "dAddM"}));
        if(!firstPos) firstPos = from;
        changes++;
      }
      at += pt.value.length;
    }
    const note = changes
      ? changes + " modification" + (changes > 1 ? "s" : "")
      : "aucun changement de texte" + (v.head ? "" : " (retours à la ligne seulement)");
    notify("comparaison " + (extCmp ? extCmp.label : labelOf(idx)) + " · " + note + " · Échap pour fermer");
    if(firstPos) cm.scrollIntoView(firstPos, 120);
  }
  function toggle(show, scrollLine){
    const next = (show === undefined || show === null) ? !shown : show;
    // aucune version : ne jamais verrouiller l'éditeur sans rien afficher
    if(next && !curVersion()) return;
    const cm = getCm();
    if(!cm) return;
    shown = next;
    els.tag.classList.toggle("on", shown);
    if(els.restore) els.restore.style.display = shown ? "" : "none";
    if(shown){
      render();
      cm.setOption("readOnly", true);
      if(scrollLine != null) cm.scrollIntoView({line: scrollLine, ch: 0}, 120);
    }
    else { extCmp = null; clearMarks(); cm.setOption("readOnly", false); cm.refresh(); notify(""); }
  }
  function push(before, after){
    if(before === after) return;
    // rewrap-only (blancs/retours déplacés) : ne pas créer de version vide —
    // sinon idx saute sur un diff « aucun changement » et masque les vraies
    // modifications de la version précédente
    if(before.replace(/\s+/g, " ").trim() === after.replace(/\s+/g, " ").trim()) return;
    VERSIONS.push({before, ts: Date.now()});
    idx = VERSIONS.length - 1;
    arm();
    persist();
    // pas d'auto-ouverture : le mode passe l'éditeur en lecture seule, l'activer
    // à chaque sauvegarde bloquerait la frappe en silence. Si déjà ouvert : rafraîchir.
    if(shown) render();
    // l'agent a pu committer entre-temps : HEAD et la gouttière se rafraîchissent
    fetchHead().then(refreshGutter);
  }

  // ---- commit rapide du fichier courant (sobre : hérite du style des boutons
  // de la barre ; visible seulement quand le fichier diffère de HEAD) ----
  let commitBtn = null, commitPop = null;
  function ensureCommitUi(){
    if(commitBtn || !els.group) return;
    commitBtn = document.createElement("button");
    commitBtn.id = "dvCommit";
    commitBtn.style.display = "none";
    commitBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.5v4M8 10.5v4"/></svg>';
    // ordre : ± · commit · historique
    if(histBtn) els.group.insertBefore(commitBtn, histBtn);
    else els.group.appendChild(commitBtn);
    commitPop = document.createElement("div");
    commitPop.style.cssText = "position:fixed;z-index:400;display:none;flex-direction:column;gap:8px;width:320px;"
      + "background:rgba(24,27,34,.98);border:1px solid #3a4150;border-radius:10px;padding:12px;"
      + "box-shadow:0 14px 48px rgba(0,0,0,.55);font-size:13px";
    const name = path.split("/").pop();
    commitPop.innerHTML =
      '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;opacity:.55">Commit — ' + name + '</div>'
      + '<textarea rows="2" style="width:100%;box-sizing:border-box;background:transparent;border:1px solid #3a4150;'
      + 'border-radius:6px;color:inherit;font:inherit;font-size:12px;line-height:1.5;padding:6px 8px;resize:none;outline:none"></textarea>'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:10px;opacity:.45;margin-right:auto">ce fichier seulement · &#9166; valider · &#8963; fermer</span>'
      + '<button data-act="ai" title="Message proposé par Haiku à partir du diff" style="background:transparent;'
      + 'border:1px solid #3a4150;border-radius:6px;color:inherit;font:inherit;font-size:11px;padding:4px 10px;'
      + 'cursor:pointer;opacity:.75">Message IA</button>'
      + '<button data-act="do" style="background:transparent;border:1px solid #3a4150;border-radius:6px;color:inherit;'
      + 'font:inherit;font-size:11px;font-weight:500;padding:4px 12px;cursor:pointer">Commit</button></div>';
    document.body.appendChild(commitPop);
    const ta = commitPop.querySelector("textarea");
    const closePop = () => { commitPop.style.display = "none"; };
    async function doCommit(){
      const message = ta.value.trim();
      if(!message) return;
      closePop();
      notify("commit en cours…");
      try{
        const r = await fetch("/gitcommit", {method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({path, message})});
        const j = await r.json();
        if(j && j.ok){
          notify("commit " + (j.sha || "") + " ✓");
          fetchHead().then(refreshGutter);
        } else notify("commit refusé : " + ((j && j.error) || "erreur"));
      }catch(e){ notify("commit impossible : " + e.message); }
    }
    let aiSeq = 0;
    commitBtn.onclick = () => {
      if(commitPop.style.display !== "none"){ closePop(); return; }
      const rc = commitBtn.getBoundingClientRect();
      commitPop.style.display = "flex";
      commitPop.style.top = (rc.bottom + 8) + "px";
      commitPop.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - 336)) + "px";
      const auto = "maj " + name;
      ta.value = auto;
      ta.focus(); ta.select();
      // message Haiku en arrière-plan : ne remplace que si l'utilisateur n'a pas touché
      const seq = ++aiSeq;
      fetch("/commitmsg?path=" + encodeURIComponent(path))
        .then(r => r.json())
        .then(j => {
          if(seq !== aiSeq || commitPop.style.display === "none") return;
          if(j && j.ok && j.msg && ta.value === auto){ ta.value = j.msg; ta.select(); }
        })
        .catch(() => {});
    };
    commitPop.querySelector('[data-act="do"]').onclick = doCommit;
    const aiBtn = commitPop.querySelector('[data-act="ai"]');
    aiBtn.onclick = async () => {
      aiBtn.disabled = true; aiBtn.textContent = "…";
      try{
        const r = await fetch("/commitmsg?path=" + encodeURIComponent(path));
        const j = await r.json();
        if(j && j.ok && j.msg){ ta.value = j.msg; ta.focus(); ta.select(); }
        else notify("pas de proposition (fichier sans diff ?)");
      }catch(e){ notify("proposition impossible : " + e.message); }
      aiBtn.disabled = false; aiBtn.textContent = "Message IA";
    };
    ta.addEventListener("keydown", (e) => {
      if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); doCommit(); }
      if(e.key === "Escape"){ e.stopPropagation(); closePop(); }
    });
    document.addEventListener("mousedown", (e) => {
      if(commitPop.style.display !== "none" && !commitPop.contains(e.target) && e.target !== commitBtn) closePop();
    });
  }
  function updateCommitBtn(blocks){
    ensureCommitUi();
    if(!commitBtn) return;
    commitBtn.style.display = blocks > 0 ? "" : "none";
    commitBtn.title = blocks > 0
      ? "Committer " + path.split("/").pop() + " — " + blocks + " bloc" + (blocks > 1 ? "s" : "") + " modifié" + (blocks > 1 ? "s" : "") + " depuis HEAD" + (headSha ? " (" + headSha + ")" : "")
      : "";
    // compteur discret de blocs modifiés à côté de l'icône ±
    let c = els.tag.querySelector(".dv-count");
    if(!c){
      c = document.createElement("span");
      c.className = "dv-count";
      c.style.cssText = "font-size:10px;opacity:.6;margin-left:4px;font-variant-numeric:tabular-nums";
      els.tag.appendChild(c);
    }
    c.textContent = blocks > 0 ? String(blocks) : "";
  }

  // ---- historique : commits du fichier + sauvegardes de session, avec
  // Comparer (diff in-editor) et Rétablir (réécrit le fichier, dépôt intact) ----
  let histBtn = null, histPop = null;
  function fmtAge(ts){
    if(!ts) return "";
    const s = Math.max(0, Date.now() / 1000 - ts);
    if(s < 3600) return "il y a " + Math.max(1, Math.round(s / 60)) + " min";
    if(s < 86400) return "il y a " + Math.round(s / 3600) + " h";
    if(s < 7 * 86400) return "il y a " + Math.round(s / 86400) + " j";
    return new Date(ts * 1000).toLocaleDateString();
  }
  function compareExternal(before, label){
    extCmp = {before, label};
    shown = false; // forcer le re-render même si déjà en comparaison
    toggle(true);
  }
  function ensureHistUi(){
    if(histBtn || !els.group) return;
    histBtn = document.createElement("button");
    histBtn.id = "dvHist";
    histBtn.title = "Historique du fichier — commits et sauvegardes de session";
    histBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.6"/></svg>';
    els.group.appendChild(histBtn);
    histPop = document.createElement("div");
    histPop.style.cssText = "position:fixed;z-index:400;display:none;flex-direction:column;width:400px;max-height:60vh;"
      + "background:rgba(24,27,34,.98);border:1px solid #3a4150;border-radius:10px;padding:6px;"
      + "box-shadow:0 14px 48px rgba(0,0,0,.55);font-size:13px";
    document.body.appendChild(histPop);
    if(!document.getElementById("dvHistStyles")){
      const st = document.createElement("style");
      st.id = "dvHistStyles";
      st.textContent =
        "#dvHistList{overflow-y:auto}"
        + ".dv-hrow{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px}"
        + ".dv-hrow:hover{background:rgba(255,255,255,.05)}"
        + ".dv-hrow .sha{font:10px ui-monospace,Menlo,monospace;opacity:.5;flex:none;width:54px}"
        + ".dv-hrow .msg{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}"
        + ".dv-hrow .when{font-size:10px;opacity:.45;flex:none;font-variant-numeric:tabular-nums}"
        + ".dv-hrow .act{display:none;gap:4px;flex:none}"
        + ".dv-hrow:hover .act{display:inline-flex}"
        + ".dv-hrow:hover .when{display:none}"
        + ".dv-hrow .act button{font-size:10px;border:1px solid #3a4150;background:transparent;color:inherit;"
        + "border-radius:5px;padding:2px 7px;cursor:pointer;opacity:.75}"
        + ".dv-hrow .act button:hover{opacity:1}";
      document.head.appendChild(st);
    }
    histBtn.onclick = async () => {
      if(histPop.style.display !== "none"){ histPop.style.display = "none"; return; }
      const name = path.split("/").pop();
      histPop.innerHTML =
        '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;opacity:.55;padding:6px 10px 4px">Historique — ' + name + '</div>'
        + '<div id="dvHistList"><div style="padding:7px 10px;font-size:11px;opacity:.5">chargement…</div></div>';
      const rc = histBtn.getBoundingClientRect();
      histPop.style.display = "flex";
      histPop.style.top = (rc.bottom + 8) + "px";
      histPop.style.left = Math.max(8, Math.min(rc.right - 400, window.innerWidth - 416)) + "px";
      const list = histPop.querySelector("#dvHistList");
      const rows = [];
      // sauvegardes de session (non committées), plus récentes d'abord
      const sess = VERSIONS.map((v, i) => ({v, i})).filter(x => !x.v.head).reverse();
      for(const {v, i} of sess){
        rows.push({label: "sauvegarde " + labelOf(i),
          msg: "sauvegarde de session", sha: "—", ts: v.ts ? v.ts / 1000 : 0, text: () => v.before});
      }
      let items = [];
      try{
        const r = await fetch("/gitlog?path=" + encodeURIComponent(path));
        const j = await r.json();
        if(j && j.ok) items = j.items || [];
      }catch(e){}
      for(const it of items){
        rows.push({label: it.sha, msg: it.msg, sha: it.sha, ts: it.ts, text: async () => {
          const r = await fetch("/gitshow?path=" + encodeURIComponent(path) + "&sha=" + it.sha);
          const j = await r.json();
          return (j && j.ok) ? j.text : null;
        }});
      }
      if(!rows.length){
        list.innerHTML = '<div style="padding:7px 10px;font-size:11px;opacity:.5">aucun commit ni sauvegarde pour ce fichier</div>';
        return;
      }
      list.innerHTML = "";
      for(const row of rows){
        const el = document.createElement("div");
        el.className = "dv-hrow";
        el.innerHTML = '<span class="sha">' + row.sha + '</span><span class="msg"></span>'
          + '<span class="when">' + fmtAge(row.ts) + '</span>'
          + '<span class="act"><button data-a="cmp">Comparer</button><button data-a="rst">Rétablir</button></span>';
        el.querySelector(".msg").textContent = row.msg;
        el.querySelector('[data-a="cmp"]').onclick = async () => {
          const t = await row.text();
          if(t == null){ notify("version introuvable"); return; }
          histPop.style.display = "none";
          compareExternal(t, row.label);
        };
        el.querySelector('[data-a="rst"]').onclick = async () => {
          const t = await row.text();
          if(t == null){ notify("version introuvable"); return; }
          histPop.style.display = "none";
          if(shown) toggle(false);
          await restoreText(t);
          notify("fichier rétabli à " + row.label + " — le dépôt n'est pas touché");
          fetchHead().then(refreshGutter);
        };
        list.appendChild(el);
      }
    };
    document.addEventListener("mousedown", (e) => {
      if(histPop.style.display !== "none" && !histPop.contains(e.target) && !histBtn.contains(e.target))
        histPop.style.display = "none";
    });
    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape" && histPop.style.display !== "none"){ e.stopPropagation(); histPop.style.display = "none"; }
    }, true);
  }

  // ---- gouttière git (barres ajouté/modifié, triangle supprimé, vs HEAD) ----
  let gutterReady = false, gutterTimer = null;
  function headIndex(){ return (VERSIONS[0] && VERSIONS[0].head) ? 0 : -1; }
  function openHeadAt(line){
    const h = headIndex();
    if(h < 0) return;
    idx = h; updateTag();
    shown ? (render(), getCm().scrollIntoView({line, ch: 0}, 120)) : toggle(true, line);
  }
  function markerCell(cls, line){
    const cell = document.createElement("div");
    cell.className = "dv-cell";
    cell.innerHTML = cls;
    cell.title = "Modifié depuis HEAD" + (headSha ? " (" + headSha + ")" : "") + " — cliquer : comparer";
    cell.onclick = () => openHeadAt(line);
    return cell;
  }
  function refreshGutter(){
    const cm = getCm();
    if(!cm || headText === null) return;
    if(!gutterReady){
      cm.setOption("gutters", ["CodeMirror-linenumbers", GUTTER]);
      cm.on("gutterClick", (c, line, g) => { if(g === GUTTER) openHeadAt(line); });
      cm.on("change", () => { clearTimeout(gutterTimer); gutterTimer = setTimeout(refreshGutter, 400); });
      gutterReady = true;
    }
    let blocks = 0;
    // bruit de rewrap : diffLines voit chaque retour à la ligne déplacé comme
    // une modification — si le contenu (blancs normalisés) est identique, ce
    // n'est pas un vrai changement, aucune marque
    const wsn = s => s.replace(/\s+/g, " ").trim();
    cm.operation(() => {
      cm.clearGutter(GUTTER);
      const parts = Diff.diffLines(headText, cm.getValue());
      let line = 0;
      const lastLine = cm.lineCount() - 1;
      for(let i = 0; i < parts.length; i++){
        const pt = parts[i];
        const n = pt.count || 0;
        if(pt.removed){
          const nx = parts[i + 1];
          if(nx && nx.added && wsn(nx.value) === wsn(pt.value)){ line += nx.count || 0; i++; continue; }
          if(!wsn(pt.value)){ continue; } // seulement des blancs : rien à montrer
          blocks++;
          if(nx && nx.added){
            // bloc modifié : ambre sur les lignes qui remplacent celles supprimées,
            // vert sur l'excédent (comme VS Code : n supprimées + m ajoutées, m > n
            // → n ambre puis m-n vertes)
            const nn = nx.count || 0, mod = Math.min(n, nn);
            for(let k = 0; k < nn; k++){
              // n > nn : suppression nette dans le bloc → triangle sous la dernière barre
              let html = '<div class="dv-bar ' + (k < mod ? "m" : "a") + '"></div>';
              if(k === nn - 1 && n > nn) html += '<div class="dv-del eof"></div>';
              cm.setGutterMarker(Math.min(line + k, lastLine), GUTTER, markerCell(html, line + k));
            }
            line += nn;
            i++;
          } else {
            // suppression sèche : triangle sur la ligne qui suit (ou fin de fichier)
            const at = Math.min(line, lastLine);
            const eof = line > lastLine;
            cm.setGutterMarker(at, GUTTER, markerCell('<div class="dv-del' + (eof ? " eof" : "") + '"></div>', at));
          }
          continue;
        }
        if(pt.added){
          if(!wsn(pt.value)){ line += n; continue; } // lignes vides seulement
          blocks++;
          for(let k = 0; k < n; k++)
            cm.setGutterMarker(Math.min(line + k, lastLine), GUTTER, markerCell('<div class="dv-bar a"></div>', line + k));
        }
        line += n;
      }
    });
    updateCommitBtn(blocks);
  }
  async function fetchHead(){
    try{
      const r = await fetch("/githead?path=" + encodeURIComponent(path));
      const j = await r.json();
      if(!j || !j.ok || typeof j.text !== "string"){ return; }
      headSha = j.sha || "";
      const changed = headText !== j.text;
      headText = j.text;
      if(headIndex() < 0){
        VERSIONS.unshift({before: j.text, ts: null, head: true, sha: headSha});
        idx += 1;
        if(idx < 1) idx = 0;
        arm();
      } else if(changed){
        VERSIONS[0].before = j.text;
        VERSIONS[0].sha = headSha;
        if(shown && idx === 0) render();
      }
      updateTag();
    }catch(e){ /* serveur sans /githead ou hors dépôt : dégradation silencieuse */ }
  }

  els.tag.onclick = () => toggle();
  if(els.prev) els.prev.onclick = () => { if(idx > 0){ idx--; updateTag(); shown ? render() : toggle(true); } };
  if(els.next) els.next.onclick = () => { if(idx < VERSIONS.length - 1){ idx++; updateTag(); shown ? render() : toggle(true); } };
  if(els.restore) els.restore.onclick = async () => {
    const v = VERSIONS[idx];
    if(!v) return;
    await restoreText(v.before);
    toggle(false);
  };
  // Échap ferme la comparaison (capture : avant les keymaps CodeMirror et les
  // handlers Échap de l'hôte — seulement quand le mode est actif)
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && shown){ e.preventDefault(); e.stopPropagation(); toggle(false); }
  }, true);

  // les versions du fichier survivent au rechargement de la page / de l'app
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){
      const data = JSON.parse(raw);
      if(data && Array.isArray(data.items)){
        for(const it of data.items){
          if(typeof it.b === "string") VERSIONS.push({before: it.b, ts: it.t || Date.now()});
        }
        if(VERSIONS.length){ idx = VERSIONS.length - 1; arm(); }
      }
    }
  }catch(e){}

  // HEAD + gouttière : dès que l'éditeur existe (créé après le fetch du fichier)
  const waitCm = setInterval(() => {
    if(!getCm()) return;
    clearInterval(waitCm);
    fetchHead().then(refreshGutter);
  }, 300);

  return { push, isShown: () => shown };
};
