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
    [els.prev, els.next, els.restore].forEach(b => { if(b) b.style.display = ""; });
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
    const v = VERSIONS[idx], cm = getCm();
    if(!v || !cm) return;
    clearMarks();
    // diffWordsWithSpace garantit que la concaténation des parts non-removed
    // reproduit exactement le buffer → offsets sûrs pour markText/setBookmark.
    const after = cm.getValue();
    const parts = Diff.diffWordsWithSpace(v.before, after);
    const wsn = s => s.replace(/\s+/g, " ").trim();
    let at = 0, firstPos = null, changes = 0;
    for(let i = 0; i < parts.length; i++){
      const pt = parts[i];
      if(pt.removed){
        const nx = parts[i + 1];
        // bruit de rewrap : même contenu, seuls les blancs/retours diffèrent
        if(nx && nx.added && wsn(nx.value) === wsn(pt.value)){ at += nx.value.length; i++; continue; }
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
    notify("comparaison " + labelOf(idx) + " · " + note + " · Échap pour fermer");
    if(firstPos) cm.scrollIntoView(firstPos, 120);
  }
  function toggle(show, scrollLine){
    const next = (show === undefined || show === null) ? !shown : show;
    // aucune version : ne jamais verrouiller l'éditeur sans rien afficher
    if(next && !VERSIONS[idx]) return;
    const cm = getCm();
    if(!cm) return;
    shown = next;
    els.tag.classList.toggle("on", shown);
    if(shown){
      render();
      cm.setOption("readOnly", true);
      if(scrollLine != null) cm.scrollIntoView({line: scrollLine, ch: 0}, 120);
    }
    else { clearMarks(); cm.setOption("readOnly", false); cm.refresh(); notify(""); }
  }
  function push(before, after){
    if(before === after) return;
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
          if(nx && nx.added){
            // bloc modifié : ambre sur les lignes qui remplacent celles supprimées,
            // vert sur l'excédent (comme VS Code : n supprimées + m ajoutées, m > n
            // → n ambre puis m-n vertes)
            const nn = nx.count || 0, mod = Math.min(n, nn);
            for(let k = 0; k < nn; k++)
              cm.setGutterMarker(Math.min(line + k, lastLine), GUTTER,
                markerCell('<div class="dv-bar ' + (k < mod ? "m" : "a") + '"></div>', line + k));
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
          for(let k = 0; k < n; k++)
            cm.setGutterMarker(Math.min(line + k, lastLine), GUTTER, markerCell('<div class="dv-bar a"></div>', line + k));
        }
        line += n;
      }
    });
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
