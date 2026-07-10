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
//   dv.push(before, after, meta) après chaque sauvegarde / rechargement externe
//   dv.isShown()            le mode comparaison est-il actif ?
window.DiffVersions = function(opts){
  const { getCm, path, notify, els, restoreText } = opts;
  // La base Git (ou le premier `before` pour un fichier non suivi) n'est pas
  // une intervention. Le journal conserve les paires explicites, sans jamais
  // reconstruire un `after` depuis le buffer vivant.
  const INTERVENTIONS = []; // {id,before,after,ts,source,status}
  const LEGACY_SNAPSHOTS = []; // {text,ts,label} — consultables, exclus de N
  let baseVersion = null; // {before,ts,head?,sha?}
  let shown = false, marks = [];
  let changePts = [], changeAt = 0; // positions {pos, ch} des changements + index courant
  let extCmp = null; // comparaison ponctuelle depuis l'historique : {before, label}
  const curVersion = () => extCmp || baseVersion;
  let headText = null, headSha = "", baseTs = 0; // ts (ms) du commit-base
  const KEY = "texDiffV1:" + path;
  const MAX = 1500000;
  const GUTTER = "dv-git";
  const SOURCES = new Set(["user-save", "external-reload", "external-merge", "external-conflict", "restore", "legacy"]);
  const STATUSES = new Set(["applied", "pending-conflict"]);
  let idSeq = 0;
  let runtimePushes = 0; // empêche le restore asynchrone de doubler une action déjà journalisée

  function newId(ts){ return "dv-" + ts + "-" + (++idSeq); }
  function extension(){
    const name = path.split(/[\\/]/).pop() || "";
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  }
  function proseKey(text, mode){
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    const tokens = [];
    let prose = [];
    let exactEnv = null;
    let fenced = null;
    const flush = () => {
      if(!prose.length) return;
      tokens.push("P:" + prose.join(" ").replace(/[ \t]+/g, " ").trim());
      prose = [];
    };
    const latexComment = line => {
      for(let i = 0; i < line.length; i++){
        if(line[i] !== "%") continue;
        let slashes = 0;
        for(let j = i - 1; j >= 0 && line[j] === "\\"; j--) slashes++;
        if(slashes % 2 === 0) return true;
      }
      return false;
    };
    for(const line of lines){
      if(mode === "latex"){
        const begin = line.match(/\\begin\{(verbatim|lstlisting|minted)\}/);
        if(exactEnv || begin){
          flush();
          if(!exactEnv) exactEnv = begin[1];
          tokens.push("X:" + line);
          if(new RegExp("\\\\end\\{" + exactEnv + "\\}").test(line)) exactEnv = null;
          continue;
        }
        if(latexComment(line)){
          flush();
          tokens.push("C:" + line);
          continue;
        }
      }
      if(mode === "markdown"){
        const fence = line.match(/^\s*(```+|~~~+)/);
        if(fenced || fence){
          flush();
          tokens.push("X:" + line);
          if(!fenced) fenced = fence[1][0];
          else if(fence && fence[1][0] === fenced) fenced = null;
          continue;
        }
        const structural = /^(?: {4}|\t|\s{0,3}(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s|(?:[-*_]\s*){3,})|.*\|.*\||.* {2})$/.test(line);
        if(structural && line.trim()){
          flush();
          tokens.push("X:" + line);
          continue;
        }
      }
      if(/^\s*$/.test(line)){
        flush();
        tokens.push("B");
      } else prose.push(line.trim());
    }
    flush();
    // Le dernier retour de ligne n'est pas une frontière de paragraphe.
    while(tokens.length && tokens[tokens.length - 1] === "B") tokens.pop();
    return JSON.stringify(tokens);
  }
  function equivalent(a, b){
    if(a === b) return true;
    const ext = extension();
    if(ext === "tex" || ext === "ltx") return proseKey(a, "latex") === proseKey(b, "latex");
    if(["md", "markdown", "mdown", "mkd"].includes(ext)) return proseKey(a, "markdown") === proseKey(b, "markdown");
    if(ext === "txt" || ext === "text") return proseKey(a, "text") === proseKey(b, "text");
    // Tous les modes code, connus ou futurs, conservent chaque blanc.
    return false;
  }

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
      ".dv-del.eof{top:auto;bottom:-4px}" +
      // navigateur de changements ‹ n/N › (sobre, monochrome, hérite du chrome)
      "#dvNav{display:none;align-items:center;height:24px;border:1px solid #3a4150;border-radius:6px;overflow:hidden;vertical-align:middle}" +
      "#dvNav .dvNavA{display:inline-flex;align-items:center;justify-content:center;width:20px;height:24px;background:transparent;border:none;color:#8b93a1;cursor:pointer;padding:0}" +
      "#dvNav .dvNavA:hover{color:#dbdfe5;background:rgba(255,255,255,.06)}" +
      "#dvNav .dvNavA:disabled{color:#3d434f;cursor:default;background:none}" +
      "#dvNav .dvNavC{font-size:11px;font-variant-numeric:tabular-nums;color:#dbdfe5;padding:0 8px;height:100%;" +
        "display:inline-flex;align-items:center;border-left:1px solid #3a4150;border-right:1px solid #3a4150;cursor:pointer;user-select:none}" +
      "#dvNav .dvNavC:hover{background:rgba(255,255,255,.04)}" +
      ".CodeMirror .dv-flash{animation:dvflash 700ms ease-out}" +
      "@keyframes dvflash{0%{background:rgba(255,255,255,.14)}100%{background:transparent}}";
    document.head.appendChild(st);
  }

  let lastKnown = null; // dernier texte de buffer persisté (rattrapage inter-sessions)
  let postTimer = null;
  function persist(afterText){
    if(typeof afterText === "string") lastKnown = afterText;
    let interventions = [];
    let legacySnapshots = [];
    try{
      interventions = INTERVENTIONS.map(it => ({...it}));
      legacySnapshots = LEGACY_SNAPSHOTS.map(it => ({...it}));
      let size = interventions.reduce((n, it) => n + it.before.length + it.after.length, 0)
        + legacySnapshots.reduce((n, it) => n + it.text.length, 0);
      while(interventions.length > 1 && size > MAX){
        const old = interventions.shift();
        size -= old.before.length + old.after.length;
      }
      while(legacySnapshots.length && size > MAX){ size -= legacySnapshots.shift().text.length; }
      localStorage.setItem(KEY, JSON.stringify({v: 2, interventions, legacySnapshots, last: lastKnown}));
    }catch(e){ try{ localStorage.removeItem(KEY); }catch(e2){} }
    // POST transitoire v2. Le serveur durable reste v1 jusqu'au plan 028;
    // localStorage permet déjà une relecture v2 déterministe dans ce commit.
    clearTimeout(postTimer);
    postTimer = setTimeout(() => {
      try{
        fetch("/versions", {method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({path, v: 2, interventions, legacySnapshots, last: lastKnown})}).catch(() => {});
      }catch(e){}
    }, 400);
  }
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
  function labelOf(v){
    if(!v) return "";
    return v.head ? "HEAD" + (v.sha ? " (" + v.sha + ")" : "") : "base";
  }
  function updateTag(){
    els.tag.title = "Modifications — " + labelOf(baseVersion) + " (cliquer : comparer)";
    if(els.prev) els.prev.disabled = true;
    if(els.next) els.next.disabled = true;
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
    let parts = wsn(v.before) === wsn(after) ? [] : Diff.diffWordsWithSpace(v.before, after);
    // Fusion sémantique : une phrase récrite produit une alternance mot à mot
    // (supprimé/ajouté/commun court/supprimé/…) illisible. Les groupes de
    // changements séparés par un bout commun court (≤ 16 car.) sont fusionnés
    // en UN bloc supprimé + UN bloc ajouté — le commun est absorbé des deux
    // côtés, donc la concaténation des parts non-removed reste exactement le
    // buffer (offsets sûrs).
    if(parts.length){
      const merged = [];
      let i2 = 0;
      while(i2 < parts.length){
        const pt = parts[i2];
        if(!pt.added && !pt.removed){ merged.push(pt); i2++; continue; }
        let R = "", A = "", j2 = i2;
        while(j2 < parts.length){
          const q = parts[j2];
          if(q.removed){ R += q.value; j2++; continue; }
          if(q.added){ A += q.value; j2++; continue; }
          const nx = parts[j2 + 1];
          if(nx && (nx.added || nx.removed) && q.value.length <= 16){ R += q.value; A += q.value; j2++; continue; }
          break;
        }
        if(R) merged.push({removed: true, value: R});
        if(A) merged.push({added: true, value: A});
        i2 = j2;
      }
      parts = merged;
    }
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
    const pts = []; // {pos, ch} de chaque changement, dans l'ordre du document
    let at = 0;
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
        // un mot remplacé = suppression + ajout à la MÊME position : un seul stop
        if(!pts.length || pts[pts.length - 1].ch !== at) pts.push({pos, ch: at});
        continue;
      }
      if(pt.added && wsn(pt.value)){
        // sens inverse du bruit de rewrap : mot ajouté ici, retiré juste après
        const j = noisePair(i);
        if(j >= 0){ skip.add(j); at += pt.value.length; continue; }
        const from = cm.posFromIndex(at), to = cm.posFromIndex(at + pt.value.length);
        marks.push(cm.markText(from, to, {className: "dAddM"}));
        if(!pts.length || pts[pts.length - 1].ch !== at) pts.push({pos: from, ch: at});
      }
      at += pt.value.length;
    }
    changePts = pts;
    // initialiser sur le changement le plus proche du curseur (on ouvre souvent
    // la comparaison en plein milieu du document — naviguer à partir d'où on est)
    changeAt = 0;
    if(pts.length){
      const cur = cm.getCursor(), curCh = cm.indexFromPos(cur);
      let best = Infinity;
      // distance en lignes d'abord (on est « sur » une ligne), caractères en second
      pts.forEach((p, k) => {
        const d = Math.abs(p.pos.line - cur.line) * 100000 + Math.abs(p.ch - curCh);
        if(d < best){ best = d; changeAt = k; }
      });
    }
    const changes = pts.length;
    const note = changes
      ? changes + " modification" + (changes > 1 ? "s" : "")
      : "aucun changement de texte" + (v.head ? "" : " (retours à la ligne seulement)");
    notify("comparaison " + (extCmp ? extCmp.label : labelOf(baseVersion)) + " · " + note + " · Échap pour fermer");
    updateNav();
    if(changes) gotoChange(changeAt, true);
  }
  // ---- navigateur d'INTERVENTIONS ‹ k/N › (accolé au ±, actif en comparaison).
  // Une intervention = une écriture (sauvegarde utilisateur ou passage d'agent),
  // même si elle touche vingt mots. Par défaut : « tout » (cumulatif vs base).
  // ‹ remonte la timeline — l'éditeur affiche alors l'état APRÈS l'intervention
  // k (lecture seule, buffer réel mis de côté et restauré à la sortie), diffé
  // contre l'état d'avant. ⌥↓/⌥↑ naviguent entre les marques D'UNE vue. ----
  let navPill = null, navPrev = null, navNext = null, navCount = null;
  let navMode = -1;   // -1 = tout (cumulatif) ; sinon index dans interList()
  let tt = null;      // voyage dans le temps : {realText} — buffer réel à restaurer
  let flashLine = null, flashTimer = null;
  function liveText(){ return tt ? tt.realText : getCm().getValue(); }
  // Le compteur vient uniquement du journal explicite. `before` et `after`
  // appartiennent à la même entrée; le buffer vivant ne complète jamais une paire.
  function interList(){
    const cm = getCm();
    if(!cm) return [];
    const real = liveText();
    return INTERVENTIONS
      .filter(it => !baseTs || it.ts == null || it.ts >= baseTs)
      .map(it => ({...it, from: it.before, to: it.after, live: real === it.after}));
  }
  function ttExit(){
    if(!tt) return;
    const cm = getCm();
    const real = tt.realText;
    tt = null;
    cm.setValue(real);
  }
  // Base du diff cumulatif (« tout ») : HEAD si disponible, sinon le `before`
  // immuable de la première intervention du fichier non suivi.
  function showAll(){
    ttExit();
    navMode = -1;
    extCmp = null;
    updateTag();
    render();
  }
  function showStep(j){
    const list = interList();
    if(!list.length) return;
    j = Math.max(0, Math.min(list.length - 1, j));
    const it = list[j];
    navMode = j;
    const cm = getCm();
    if(it.live) ttExit();
    else {
      if(!tt) tt = {realText: cm.getValue()};
      cm.setValue(it.to);   // état APRÈS l'intervention j (origin setValue : pas de dirty)
    }
    extCmp = {before: it.from, label: "intervention " + (j + 1) + "/" + list.length};
    render();
  }
  function flashAt(pos){
    const cm = getCm();
    if(!cm || !pos) return;
    if(flashLine != null){ try{ cm.removeLineClass(flashLine, "wrap", "dv-flash"); }catch(e){} }
    flashLine = pos.line;
    cm.addLineClass(flashLine, "wrap", "dv-flash");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if(flashLine != null){ try{ cm.removeLineClass(flashLine, "wrap", "dv-flash"); }catch(e){} flashLine = null; }
    }, 700);
  }
  function gotoChange(k, flash){
    const cm = getCm();
    if(!cm || !changePts.length) return;
    changeAt = Math.max(0, Math.min(changePts.length - 1, k));
    cm.scrollIntoView(changePts[changeAt].pos, 120);
    if(flash) flashAt(changePts[changeAt].pos);
    updateNav();
  }
  function ensureNavUi(){
    if(navPill || !els.group || !els.tag) return;
    navPill = document.createElement("span");
    navPill.id = "dvNav";
    const chev = (d) => '<button class="dvNavA" data-d="' + d + '" tabindex="-1"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (d < 0 ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5") + '"/></svg></button>';
    navPill.innerHTML = chev(-1) + '<span class="dvNavC"></span>' + chev(1);
    els.group.insertBefore(navPill, els.tag.nextSibling);
    navPrev = navPill.querySelector('[data-d="-1"]');
    navNext = navPill.querySelector('[data-d="1"]');
    navCount = navPill.querySelector(".dvNavC");
    // ‹ › : timeline des interventions. Depuis « tout », ‹ entre sur la plus
    // récente ; › depuis la plus récente revient à « tout ».
    navPrev.onclick = () => { navMode < 0 ? showStep(interList().length - 1) : showStep(navMode - 1); };
    navNext.onclick = () => {
      if(navMode < 0) return;
      const last = interList().length - 1;
      navMode >= last ? showAll() : showStep(navMode + 1);
    };
    navCount.onclick = () => { navMode < 0 ? gotoChange(changeAt, true) : showAll(); };
  }
  function updateNav(){
    ensureNavUi();
    if(!navPill) return;
    const n = shown ? interList().length : 0;
    const on = shown && !!curVersion();
    navPill.style.display = on ? "inline-flex" : "none";
    if(!on) return;
    if(navMode < 0){
      navCount.textContent = "tout · " + n;
      navCount.title = n + " intervention" + (n > 1 ? "s" : "") + " depuis la base — ‹ pour les revoir une à une · cliquer : recentrer";
      navPrev.disabled = n === 0;
      navNext.disabled = true;
    } else {
      navCount.textContent = (navMode + 1) + " / " + n;
      navCount.title = "Intervention " + (navMode + 1) + " sur " + n + " — cliquer : revenir à « tout »";
      navPrev.disabled = navMode <= 0;
      navNext.disabled = false; // › depuis la dernière = retour à « tout »
    }
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
      navMode = -1;
      render();
      cm.setOption("readOnly", true);
      if(scrollLine != null) cm.scrollIntoView({line: scrollLine, ch: 0}, 120);
    }
    else {
      ttExit(); // vue historique : TOUJOURS restaurer le buffer réel en sortant
      navMode = -1;
      extCmp = null; clearMarks(); cm.setOption("readOnly", false); cm.refresh(); notify("");
      changePts = [];
      if(navPill) navPill.style.display = "none";
      if(flashLine != null){ try{ cm.removeLineClass(flashLine, "wrap", "dv-flash"); }catch(e){} flashLine = null; }
    }
  }
  function normalizeMeta(meta){
    const source = meta && SOURCES.has(meta.source) ? meta.source : "user-save";
    const status = meta && STATUSES.has(meta.status) ? meta.status : "applied";
    return {source, status};
  }
  function record(before, after, meta, ts, id){
    if(typeof before !== "string" || typeof after !== "string" || before === after || equivalent(before, after)) return null;
    const parsedTs = Number(ts);
    const when = Number.isFinite(parsedTs) ? parsedTs : Date.now();
    const normalized = normalizeMeta(meta);
    const intervention = {id: typeof id === "string" && id ? id : newId(when), before, after, ts: when,
      source: normalized.source, status: normalized.status};
    INTERVENTIONS.push(intervention);
    if(!baseVersion) baseVersion = {before, ts: when, head: false, sha: ""};
    return intervention;
  }
  function push(before, after, meta){
    // une écriture arrive pendant une vue historique : revenir au présent
    // d'abord (le buffer réel vient d'être remplacé par l'hôte)
    if(tt){ tt = null; navMode = -1; extCmp = null; }
    // La valeur par défaut maintient les anciens appelants pendant la transition;
    // Task 3 rendra chaque source externe explicite dans les deux éditeurs.
    if(!record(before, after, meta)) return;
    runtimePushes++;
    // Cible par défaut du ± : la BASE (HEAD ou 1ʳᵉ snapshot de session) — un
    // diff CUMULATIF, comme la gouttière. Sauter sur la version fraîchement
    // créée (« depuis la dernière sauvegarde ») donnait un diff minuscule ou
    // vide à chaque ⌘S. Si la comparaison est OUVERTE, ne jamais déplacer la
    // sélection sous les yeux de l'utilisateur (mais render() rafraîchit les
    // marques contre le buffer courant → le cumul grossit quand même).
    arm();
    persist(after);
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
      // Interventions de session et snapshots v1 orphelins, plus récents d'abord.
      for(let i = INTERVENTIONS.length - 1; i >= 0; i--){
        const it = INTERVENTIONS[i];
        rows.push({label: "intervention " + (i + 1),
          msg: it.source, sha: "—", ts: it.ts ? it.ts / 1000 : 0, text: () => it.before});
      }
      for(let i = LEGACY_SNAPSHOTS.length - 1; i >= 0; i--){
        const snap = LEGACY_SNAPSHOTS[i];
        rows.push({label: snap.label, msg: snap.label, sha: "—",
          ts: snap.ts ? snap.ts / 1000 : 0, text: () => snap.text});
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
  function openHeadAt(line){
    if(!baseVersion || !baseVersion.head) return;
    updateTag();
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
      cm.on("change", () => {
        if(tt) return; // vue historique : le buffer affiché n'est pas le vrai
        clearTimeout(gutterTimer); gutterTimer = setTimeout(refreshGutter, 400);
      });
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
            // Bloc modifié. Un rewrap fusionne tout un paragraphe en un seul
            // bloc « n supprimées + m ajoutées » même si UN mot a changé —
            // marquer tout le bloc noierait le vrai changement. Raffinement au
            // mot : seules les lignes du bloc contenant un changement réel
            // (blancs normalisés) reçoivent une barre.
            const nn = nx.count || 0;
            const changed = new Set();
            {
              const wparts = Diff.diffWordsWithSpace(pt.value, nx.value);
              // même appariement du bruit que render() : paires supprimé/ajouté
              // de contenu égal, dans un ordre ou l'autre, séparées au plus par
              // un blanc commun (mot déplacé de l'autre côté d'un retour à la ligne)
              const skipW = new Set();
              for(let w = 0; w < wparts.length; w++){
                const wp = wparts[w];
                if(!(wp.added || wp.removed) || skipW.has(w) || !wsn(wp.value)) continue;
                for(let x = w + 1; x <= w + 2 && x < wparts.length; x++){
                  const cand = wparts[x];
                  if(x === w + 1 && !cand.removed && !cand.added){
                    if(wsn(cand.value) !== "") break;
                    continue;
                  }
                  if(!skipW.has(x) && !!cand.removed === !wp.removed && !!cand.added === !wp.added
                     && wsn(cand.value) === wsn(wp.value)){ skipW.add(w); skipW.add(x); }
                  break;
                }
              }
              const lineOf = (off) => { let c = 0, p = -1; const s = nx.value;
                for(;;){ const q = s.indexOf("\n", p + 1); if(q < 0 || q >= off) return c; c++; p = q; } };
              let off = 0;
              for(let w = 0; w < wparts.length; w++){
                const wp = wparts[w];
                if(wp.removed){
                  if(!skipW.has(w) && wsn(wp.value)) changed.add(lineOf(off));
                  continue;
                }
                if(wp.added && !skipW.has(w) && wsn(wp.value)){
                  const a = lineOf(off), b = lineOf(off + wp.value.length);
                  for(let L = a; L <= b; L++) changed.add(L);
                }
                off += wp.value.length;
              }
            }
            if(!changed.size){ blocks--; line += nn; i++; continue; } // que du bruit
            for(let k = 0; k < nn; k++){
              if(!changed.has(k)) continue;
              // n > nn : suppression nette dans le bloc → triangle sous la dernière barre marquée
              let html = '<div class="dv-bar m"></div>';
              if(k === Math.max(...changed) && n > nn) html += '<div class="dv-del eof"></div>';
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
      baseTs = (Number(j.ts) || 0) * 1000; // epoch s → ms (échelle des versions)
      const changed = headText !== j.text;
      headText = j.text;
      if(!baseVersion || !baseVersion.head){
        baseVersion = {before: j.text, ts: null, head: true, sha: headSha};
        arm();
      } else if(changed){
        baseVersion = {before: j.text, ts: null, head: true, sha: headSha};
        if(shown && !extCmp) render();
      }
      // Hors comparaison, la cible reste la base cumulative quel que soit
      // l'ordre d'arrivée entre fetchHead et les premiers push.
      updateTag();
    }catch(e){ /* serveur sans /githead ou hors dépôt : dégradation silencieuse */ }
  }

  els.tag.onclick = () => toggle();
  if(els.prev) els.prev.onclick = () => {};
  if(els.next) els.next.onclick = () => {};
  if(els.restore) els.restore.onclick = async () => {
    const v = curVersion();
    if(!v) return;
    await restoreText(v.before);
    toggle(false);
  };
  // Échap ferme la comparaison (capture : avant les keymaps CodeMirror et les
  // handlers Échap de l'hôte — seulement quand le mode est actif). ⌥↓/⌥↑ =
  // changement suivant/précédent (via e.code : indépendant de la disposition).
  document.addEventListener("keydown", (e) => {
    if(!shown) return;
    // vue historique : le buffer affiché n'est PAS le vrai — bloquer ⌘S
    if(tt && (e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")){
      e.preventDefault(); e.stopPropagation();
      notify("vue historique — Échap ou › pour revenir au présent avant de sauvegarder");
      return;
    }
    if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); toggle(false); return; }
    if(e.altKey && !e.metaKey && !e.ctrlKey && (e.code === "ArrowDown" || e.code === "ArrowUp") && changePts.length){
      e.preventDefault(); e.stopPropagation();
      gotoChange(changeAt + (e.code === "ArrowDown" ? 1 : -1), true);
    }
    // ⌥←/⌥→ : intervention précédente / suivante (timeline)
    if(e.altKey && !e.metaKey && !e.ctrlKey && (e.code === "ArrowLeft" || e.code === "ArrowRight")){
      e.preventDefault(); e.stopPropagation();
      if(e.code === "ArrowLeft") navMode < 0 ? showStep(interList().length - 1) : showStep(navMode - 1);
      else if(navMode >= 0){ const last = interList().length - 1; navMode >= last ? showAll() : showStep(navMode + 1); }
    }
  }, true);

  // Relecture v2 déterministe, avec migration des snapshots v1. Le serveur
  // reste v1 pendant la transition; localStorage peut déjà contenir du v2.
  function addV2(data){
    let added = 0;
    for(const it of (Array.isArray(data.interventions) ? data.interventions : [])){
      if(!it || typeof it.before !== "string" || typeof it.after !== "string") continue;
      if(record(it.before, it.after, {source: it.source, status: it.status}, it.ts, it.id)) added++;
    }
    for(const snap of (Array.isArray(data.legacySnapshots) ? data.legacySnapshots : [])){
      if(!snap || typeof snap.text !== "string") continue;
      LEGACY_SNAPSHOTS.push({text: snap.text, ts: Number(snap.ts) || 0,
        label: typeof snap.label === "string" ? snap.label : "snapshot legacy"});
    }
    if(typeof data.last === "string") lastKnown = data.last;
    if(added || LEGACY_SNAPSHOTS.length) arm();
    return added + LEGACY_SNAPSHOTS.length;
  }
  function addV1(data){
    const snapshots = (Array.isArray(data.items) ? data.items : [])
      .filter(it => it && typeof it.b === "string")
      .map((it, i) => ({text: it.b, ts: Number(it.t) || 0, index: i}));
    const usedAsBefore = new Set();
    for(let i = 0; i + 1 < snapshots.length; i++){
      const before = snapshots[i], after = snapshots[i + 1];
      if(record(before.text, after.text, {source: "legacy", status: "applied"}, after.ts))
        usedAsBefore.add(i);
    }
    for(let i = 0; i < snapshots.length; i++){
      if(usedAsBefore.has(i)) continue;
      const snap = snapshots[i];
      LEGACY_SNAPSHOTS.push({text: snap.text, ts: snap.ts, label: "snapshot v1 " + (snap.index + 1)});
    }
    if(typeof data.last === "string") lastKnown = data.last;
    if(INTERVENTIONS.length || LEGACY_SNAPSHOTS.length) arm();
    return INTERVENTIONS.length + LEGACY_SNAPSHOTS.length;
  }
  function loadData(data){
    if(!data || typeof data !== "object") return 0;
    return data.v === 2 ? addV2(data) : addV1(data);
  }
  async function restoreVersions(){
    let fromServer = false;
    try{
      const r = await fetch("/versions?path=" + encodeURIComponent(path));
      const j = await r.json();
      if(j && j.ok){
        fromServer = true;
        loadData(j);
      }
    }catch(e){}
    if(!fromServer || (!INTERVENTIONS.length && !LEGACY_SNAPSHOTS.length && lastKnown === null)){
      // fallback / migration depuis le localStorage d'une session antérieure
      try{
        const data = JSON.parse(localStorage.getItem(KEY) || "null");
        loadData(data);
      }catch(e){}
    }
  }

  // HEAD + gouttière + restore : dès que l'éditeur existe (créé après le fetch
  // du fichier). Rattrapage : si le fichier a changé pendant que l'app était
  // fermée (agent, autre outil), une version « avant » est créée — les modifs
  // externes redeviennent visibles dans ± même après un redémarrage.
  const waitCm = setInterval(() => {
    if(!getCm()) return;
    clearInterval(waitCm);
    restoreVersions().then(() => {
      const cm = getCm();
      const now = cm ? cm.getValue() : null;
      // Le GET /versions peut finir après les premiers ⌘S et rapporter un
      // `last` plus ancien. Ces push couvrent déjà le buffer courant : ne pas
      // ajouter une intervention composite de rattrapage en doublon.
      if(now !== null && runtimePushes > 0){
        lastKnown = now;
      } else if(now !== null && typeof lastKnown === "string" && !equivalent(lastKnown, now)){
        record(lastKnown, now, {source: "external-reload", status: "applied"});
        arm();
        persist(now);
        notify("modifié pendant que l'app était fermée — ± pour comparer");
      } else if(now !== null && lastKnown === null){
        persist(now); // première visite : baseline pour le prochain rattrapage
      }
      fetchHead().then(() => {
        refreshGutter();
        // sélection par défaut du ± : la base (diff cumulatif, comme la gouttière)
        if(!shown) updateTag();
      });
    });
  }, 300);

  // isBusy : vue historique active (buffer temporairement remplacé) — les hôtes
  // doivent suspendre leur rechargement-disque automatique pendant ce temps
  return { push, isShown: () => shown, isBusy: () => !!tt };
};
