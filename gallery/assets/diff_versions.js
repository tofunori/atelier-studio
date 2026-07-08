"use strict";
// Historique de versions + comparaison EN PLACE (CodeMirror 5) — module partagé
// par latex_studio.html et code_editor.html. Le document affiché reste le buffer
// courant (thème, coloration syntaxique, numéros de ligne et wrap intacts) :
// mots ajoutés surlignés, mots supprimés insérés en widgets barrés, bruit de
// rewrap (retours à la ligne déplacés) filtré. Les versions persistent en
// localStorage par fichier (plafond ~1,5 Mo, plus anciennes éliminées d'abord).
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
  const VERSIONS = []; // {before, ts} — le diff se fait contre le buffer courant
  let idx = -1, shown = false, marks = [];
  const KEY = "texDiffV1:" + path;
  const MAX = 1500000;

  // styles des décorations (une seule injection par page)
  if(!document.getElementById("dvStyles")){
    const st = document.createElement("style");
    st.id = "dvStyles";
    st.textContent =
      ".dAddM{background:rgba(52,201,142,.18);border-bottom:1px solid rgba(52,201,142,.6);border-radius:2px}" +
      ".dDelW{background:rgba(224,108,117,.14);color:#e09aa0;text-decoration:line-through;border-radius:2px;padding:0 1px}";
    document.head.appendChild(st);
  }

  function persist(){
    try{
      let items = VERSIONS.map(v => ({b: v.before, t: v.ts}));
      let size = items.reduce((n, it) => n + it.b.length, 0);
      while(items.length > 1 && size > MAX){ size -= items[0].b.length; items.shift(); }
      localStorage.setItem(KEY, JSON.stringify({v: 1, items}));
    }catch(e){ try{ localStorage.removeItem(KEY); }catch(e2){} }
  }
  function arm(){
    if(els.group) els.group.style.display = "";
    els.tag.disabled = false; els.tag.style.opacity = "";
    [els.prev, els.next, els.restore].forEach(b => { if(b) b.style.display = ""; });
    updateTag();
  }
  function updateTag(){
    els.tag.title = "Modifications — version " + (idx + 2) + "/" + (VERSIONS.length + 1) + " (cliquer : comparer)";
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
      : "aucun changement de texte (retours à la ligne seulement)";
    notify("comparaison v" + (idx + 2) + "/" + (VERSIONS.length + 1) + " · " + note + " · Échap pour fermer");
    if(firstPos) cm.scrollIntoView(firstPos, 120);
  }
  function toggle(show){
    const next = (show === undefined || show === null) ? !shown : show;
    // aucune version : ne jamais verrouiller l'éditeur sans rien afficher
    if(next && !VERSIONS[idx]) return;
    const cm = getCm();
    if(!cm) return;
    shown = next;
    els.tag.classList.toggle("on", shown);
    if(shown){ render(); cm.setOption("readOnly", true); }
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

  return { push, isShown: () => shown };
};
