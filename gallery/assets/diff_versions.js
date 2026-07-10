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
//   dv.isEquivalent(a, b)     équivalence whitespace adaptée au type de fichier
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
  let baseGitLocked = false;
  const KEY = "texDiffV1:" + path;
  const GUTTER = "dv-git";
  const SOURCES = new Set(["user-save", "external-reload", "external-merge", "external-conflict", "restore", "legacy"]);
  const STATUSES = new Set(["applied", "pending-conflict"]);
  let idSeq = 0;
  const idNonce = (() => {
    try { return crypto.randomUUID().slice(0, 8); }
    catch(e){ return Math.random().toString(36).slice(2, 10); }
  })();
  let runtimePushes = 0; // empêche le restore asynchrone de doubler une action déjà journalisée

  function newId(ts){ return "dv-" + ts + "-" + idNonce + "-" + (++idSeq); }
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
        if(/^\s*\\/.test(line)){
          flush();
          tokens.push("X:" + line);
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
    // `split("\n")` crée un unique élément vide artificiel après le
    // retour terminal. Toute ligne blanche terminale supplémentaire est réelle.
    if(tokens[tokens.length - 1] === "B") tokens.pop();
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
  let serverRevision = 0;
  let serverBaseHash = null;
  const acknowledgedIds = new Set();
  const pendingById = new Map();
  let writeRunning = false, writeAgain = false, persistenceStopped = false;
  let postTimer = null;
  function hashText(text){
    // SHA-256 synchrone : permet de figer le snapshot avant le premier await,
    // donc une intervention arrivée pendant le POST reste dans pendingById.
    const bytes = new TextEncoder().encode(text);
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));
    const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const bitLength = bytes.length * 8;
    const total = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(total); padded.set(bytes); padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(total - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(total - 4, bitLength >>> 0);
    const w = new Uint32Array(64);
    for(let off = 0; off < total; off += 64){
      for(let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for(let i = 16; i < 64; i++){
        const s0 = rotr(7,w[i-15]) ^ rotr(18,w[i-15]) ^ (w[i-15] >>> 3);
        const s1 = rotr(17,w[i-2]) ^ rotr(19,w[i-2]) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,hh] = h;
      for(let i = 0; i < 64; i++){
        const s1 = rotr(6,e) ^ rotr(11,e) ^ rotr(25,e);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
        const s0 = rotr(2,a) ^ rotr(13,a) ^ rotr(22,a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) >>> 0;
        hh=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0;
      h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
    }
    return h.map(value => value.toString(16).padStart(8,"0")).join("");
  }
  function compactState(){
    const texts = {};
    const put = (text) => { const hash = hashText(text); texts[hash] = text; return hash; };
    const baseText = baseVersion && typeof baseVersion.before === "string"
      ? baseVersion.before : (INTERVENTIONS[0]?.before ?? lastKnown ?? "");
    const baseHash = put(baseText);
    const interventions = [];
    for(const it of INTERVENTIONS) interventions.push({id: it.id,
      fromHash: put(it.before), toHash: put(it.after), ts: it.ts,
      source: it.source, status: it.status});
    const legacySnapshots = [];
    for(const snap of LEGACY_SNAPSHOTS) legacySnapshots.push({hash: put(snap.text),
      ts: snap.ts, label: snap.label});
    const currentText = typeof lastKnown === "string" ? lastKnown : liveText();
    const current = {hash: put(currentText), ts: Date.now()};
    return {v: 2, path, revision: serverRevision,
      base: {hash: baseHash, kind: baseVersion?.head ? "git" : "session",
        sha: baseVersion?.sha || "", ts: baseVersion?.ts},
      texts, interventions, legacySnapshots, current, lastKnown: currentText};
  }
  function stopPersistence(message){
    persistenceStopped = true;
    notify("persistance du diff arrêtée — " + message);
  }
  function materializeServer(data){
    if(!data || data.v !== 2 || !data.texts) return null;
    const text = hash => typeof data.texts[hash] === "string" ? data.texts[hash] : null;
    const interventions = [];
    for(const it of (Array.isArray(data.interventions) ? data.interventions : [])){
      const before = text(it.fromHash), after = text(it.toHash);
      if(before === null || after === null) return null;
      interventions.push({...it, before, after});
    }
    const legacySnapshots = [];
    for(const snap of (Array.isArray(data.legacySnapshots) ? data.legacySnapshots : [])){
      const value = text(snap.hash); if(value === null) return null;
      legacySnapshots.push({text: value, ts: snap.ts, label: snap.label});
    }
    const last = data.current ? text(data.current.hash) : null;
    const base = data.base ? text(data.base.hash) : null;
    return {v: 2, revision: data.revision || 0, baseHash: data.base?.hash || null,
      baseText: base, baseMeta: data.base, interventions, legacySnapshots, last};
  }
  function mergeConflictState(remote, localBaseHash){
    const decoded = materializeServer(remote);
    if(!decoded){ stopPersistence("état serveur invalide"); return false; }
    const expectedBase = serverBaseHash || localBaseHash;
    if(expectedBase && decoded.baseHash && expectedBase !== decoded.baseHash){
      stopPersistence("conflit de base"); return false;
    }
    const localById = new Map(INTERVENTIONS.map(it => [it.id, it]));
    for(const it of decoded.interventions){
      const local = localById.get(it.id);
      if(local && (local.before !== it.before || local.after !== it.after || local.source !== it.source || local.status !== it.status)){
        stopPersistence("identifiant d'intervention divergent"); return false;
      }
      if(!local) INTERVENTIONS.push({...it});
      acknowledgedIds.add(it.id);
    }
    INTERVENTIONS.sort((a,b) => Number(a.ts || 0) - Number(b.ts || 0) || a.id.localeCompare(b.id));
    serverRevision = decoded.revision;
    serverBaseHash = decoded.baseHash;
    return true;
  }
  async function flushWrites(retried){
    if(persistenceStopped) return;
    if(writeRunning){ writeAgain = true; return; }
    writeRunning = true;
    try{
      const snapshot = compactState();
      try{ localStorage.setItem(KEY, JSON.stringify(snapshot)); }
      catch(e){ notify("historique local trop volumineux — persistance serveur maintenue"); }
      const ops = [];
      if(!serverBaseHash) ops.push({type: "init", base: snapshot.base,
        current: snapshot.current, legacySnapshots: snapshot.legacySnapshots, texts: snapshot.texts});
      for(const it of snapshot.interventions){
        if(acknowledgedIds.has(it.id)) continue;
        const full = INTERVENTIONS.find(candidate => candidate.id === it.id);
        if(!full) continue;
        pendingById.set(it.id, full);
        ops.push({type: "append", intervention: it, current: snapshot.current,
          texts: {[it.fromHash]: snapshot.texts[it.fromHash], [it.toHash]: snapshot.texts[it.toHash]}});
      }
      if(!ops.length) ops.push({type: "set-current", current: snapshot.current,
        texts: {[snapshot.current.hash]: snapshot.texts[snapshot.current.hash]}});
      const response = await fetch("/versions", {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path, expectedRevision: serverRevision, ops})});
      const body = await response.json();
      if(response.status === 409 || body?.error === "revision-conflict"){
        if(retried || !mergeConflictState(body.state, snapshot.base.hash)){ if(!persistenceStopped) stopPersistence("conflit de révision répété"); return; }
        writeRunning = false;
        await flushWrites(true);
        return;
      }
      if(!body?.ok || !Number.isInteger(body.revision)) throw new Error(body?.error || "ack invalide");
      serverRevision = body.revision;
      serverBaseHash = snapshot.base.hash;
      for(const op of ops) if(op.type === "append"){
        acknowledgedIds.add(op.intervention.id); pendingById.delete(op.intervention.id);
      }
    }catch(e){
      notify("échec de persistance du diff — nouvelle tentative à la prochaine modification");
    }finally{
      writeRunning = false;
      if(writeAgain){ writeAgain = false; await flushWrites(false); }
    }
  }
  function persist(afterText){
    if(typeof afterText === "string") lastKnown = afterText;
    clearTimeout(postTimer);
    postTimer = setTimeout(() => { flushWrites(false); }, 400);
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
  let diffWorker = null, workerFailed = false, renderRequestId = 0, renderTimer = null;
  const LOCAL_WORD_LIMIT = 12000;
  const renderCache = new Map();
  function workerUrl(){
    let url = "/.fig_thumbs/diff_worker.js";
    try{ const token = new URLSearchParams(location.search).get("token"); if(token) url += "?token=" + encodeURIComponent(token); }catch(e){}
    return url;
  }
  function ensureWorker(){
    if(diffWorker || workerFailed || typeof Worker === "undefined") return diffWorker;
    try{
      diffWorker = new Worker(workerUrl());
      diffWorker.onerror = () => { workerFailed = true; try{ diffWorker.terminate(); }catch(e){} diffWorker = null; };
    }catch(e){ workerFailed = true; diffWorker = null; }
    return diffWorker;
  }
  function cacheParts(key, value){
    renderCache.set(key, value);
    while(renderCache.size > 8) renderCache.delete(renderCache.keys().next().value);
  }
  function lineFallback(before, after, isCurrent, done){
    const splitLines = (text, callback) => {
      const lines = []; let at = 0;
      const step = () => {
        if(!isCurrent()) return;
        let count = 0;
        while(at < text.length && count++ < 300){
          const end = text.indexOf("\n", at);
          if(end < 0){ lines.push(text.slice(at)); at = text.length; break; }
          lines.push(text.slice(at, end + 1)); at = end + 1;
        }
        at < text.length ? setTimeout(step, 0) : callback(lines);
      };
      setTimeout(step, 0);
    };
    const build = (lines, start, end, callback) => {
      let at = start, value = "";
      const step = () => {
        if(!isCurrent()) return;
        let chunk = "", count = 0;
        while(at < end && count++ < 200) chunk += lines[at++];
        value += chunk;
        at < end ? setTimeout(step, 0) : callback(value);
      };
      setTimeout(step, 0);
    };
    splitLines(before, a => splitLines(after, b => {
    let prefix = 0, suffix = 0;
    const scanPrefix = () => {
      const stop = Math.min(prefix + 500, a.length, b.length);
      while(prefix < stop && a[prefix] === b[prefix]) prefix++;
      if(prefix === stop && prefix < a.length && prefix < b.length)
        return setTimeout(scanPrefix, 0);
      scanSuffix();
    };
    const scanSuffix = () => {
      const stop = Math.min(suffix + 500, a.length - prefix, b.length - prefix);
      while(suffix < stop && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
      if(suffix === stop && suffix < a.length - prefix && suffix < b.length - prefix)
        return setTimeout(scanSuffix, 0);
      if(!isCurrent()) return;
      build(a, 0, prefix, commonBefore =>
      build(a, prefix, a.length - suffix, removed =>
      build(b, prefix, b.length - suffix, added =>
      build(b, b.length - suffix, b.length, commonAfter => {
      const parts = [];
      if(commonBefore) parts.push({value:commonBefore});
      if(removed) parts.push({removed:true,value:removed});
      if(added) parts.push({added:true,value:added});
      if(commonAfter) parts.push({value:commonAfter});
      done(parts, true);
      }))));
    };
    setTimeout(scanPrefix, 0);
    }));
  }
  function cancelRender(){
    renderRequestId++; clearTimeout(renderTimer); renderTimer = null;
    if(diffWorker){ try{ diffWorker.terminate(); }catch(e){} diffWorker = null; }
  }
  function render(){
    const v = curVersion(), cm = getCm();
    if(!v || !cm) return;
    clearMarks(); changePts = [];
    const after = cm.getValue();
    const wsn = s => s.replace(/\s+/g, " ").trim();
    const key = hashText(v.before) + ":" + hashText(after);
    const requestId = ++renderRequestId;
    if(diffWorker){ try{ diffWorker.terminate(); }catch(e){} diffWorker = null; }
    const apply = (parts, coarse = false, warning = "") => {
      if(requestId !== renderRequestId || !shown || curVersion() !== v || cm.getValue() !== after) return;
      cacheParts(key, {parts, coarse});
      applyRender(v, cm, after, parts, coarse, warning);
    };
    const cached = renderCache.get(key);
    if(cached){ applyRender(v, cm, after, cached.parts, cached.coarse); return; }
    if(wsn(v.before) === wsn(after)){ apply([], false); return; }
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      const fallback = (warn) => {
        if(v.before.length + after.length <= LOCAL_WORD_LIMIT)
          apply(Diff.diffWordsWithSpace(v.before, after), false, warn ? "diff Worker indisponible — fallback local" : "");
        else lineFallback(v.before, after, () => requestId === renderRequestId, apply);
      };
      const worker = ensureWorker();
      if(worker){
        worker.onerror = () => {
          workerFailed = true; try{ worker.terminate(); }catch(e){} if(diffWorker === worker) diffWorker = null;
          if(requestId !== renderRequestId) return;
          fallback(true);
        };
        worker.onmessage = ({data}) => {
          if(data?.requestId !== renderRequestId) return;
          if(data.error){ fallback(true); return; }
          apply(data.parts || [], false);
        };
        worker.postMessage({requestId, before:v.before, after});
      } else fallback(false);
    }, 35);
  }
  function applyRender(v, cm, after, inputParts, coarse, warning){
    clearMarks();
    const wsn = s => s.replace(/\s+/g, " ").trim();
    let parts = inputParts;
    // diffWordsWithSpace garantit que la concaténation des parts non-removed
    // reproduit exactement le buffer → offsets sûrs pour markText/setBookmark.
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
    if(coarse) notify("diff détaillé indisponible — affichage par lignes");
    else if(warning) notify(warning);
    else notify("comparaison " + (extCmp ? extCmp.label : labelOf(baseVersion)) + " · " + note + " · Échap pour fermer");
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
  function interventionLabel(it){
    if(!it) return "";
    const status = it.status === "pending-conflict"
      ? "pending-conflict (non appliqué)"
      : "applied (appliqué)";
    return it.source + " · " + status;
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
    cancelGutter();
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
    extCmp = {before: it.from,
      label: "intervention " + (j + 1) + "/" + list.length + " · " + interventionLabel(it)};
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
    const list = shown ? interList() : [];
    const n = list.length;
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
      navCount.title = "Intervention " + (navMode + 1) + " sur " + n + " · "
        + interventionLabel(list[navMode]) + " — cliquer : revenir à « tout »";
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
      cancelRender();
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
    const storedTs = ts === null ? null
      : Number.isFinite(parsedTs) ? parsedTs
      : ts === undefined ? Date.now() : null;
    const idTime = storedTs === null ? Date.now() : storedTs;
    const normalized = normalizeMeta(meta);
    const intervention = {id: typeof id === "string" && id ? id : newId(idTime), before, after, ts: storedTs,
      source: normalized.source, status: normalized.status};
    INTERVENTIONS.push(intervention);
    if(!baseVersion) baseVersion = {before, ts: storedTs, head: false, sha: ""};
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
    persist(liveText());
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
  function displayedText(){
    if(navMode >= 0){
      const item = interList()[navMode];
      return item ? item.to : null;
    }
    if(extCmp && typeof extCmp.before === "string") return extCmp.before;
    return liveText(); // vue « tout » : le buffer courant est la cible
  }
  async function restoreTarget(target, label){
    if(typeof target !== "string") return false;
    const cm = getCm();
    const before = liveText();
    // Sortir du voyage temporel AVANT le writer. `tt.realText` ne doit jamais
    // pouvoir être réinjecté au-dessus d'une restauration réussie.
    tt = null; navMode = -1; extCmp = null;
    let succeeded = false;
    try{ succeeded = (await restoreText(target)) !== false; }catch(e){ succeeded = false; }
    if(!succeeded){
      cm.setValue(before);
      toggle(false);
      notify("restauration refusée — le fichier et l'historique sont inchangés");
      return false;
    }
    const intervention = record(before, target, {source: "restore", status: "applied"});
    if(intervention){ runtimePushes++; pendingById.set(intervention.id, intervention); }
    lastKnown = target;
    persist(target);
    toggle(false);
    notify("fichier rétabli" + (label ? " à " + label : "") + " — le dépôt n'est pas touché");
    fetchHead().then(refreshGutter);
    return true;
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
          msg: interventionLabel(it), sha: "—", ts: it.ts ? it.ts / 1000 : 0, text: () => it.before});
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
          await restoreTarget(t, row.label);
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
    if(headText === null) return;
    extCmp = {before: headText, label: "HEAD" + (headSha ? " (" + headSha + ")" : ""), head: true};
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
  let gutterWorker = null, gutterRequestId = 0;
  function cancelGutter(){
    gutterRequestId++;
    if(gutterWorker){ try{ gutterWorker.terminate(); }catch(e){} gutterWorker = null; }
  }
  function coarseGutter(parts, lastLine){
    const markers = []; let line = 0, blocks = 0;
    const count = value => { const matches = value.match(/\n/g); return (matches ? matches.length : 0) + (value && !value.endsWith("\n") ? 1 : 0); };
    for(let i=0;i<parts.length;i++){
      const part=parts[i], n=count(part.value);
      if(part.removed){
        const next=parts[i+1]; blocks++;
        if(next?.added){
          const nn=count(next.value);
          for(let k=0;k<nn;k++) markers.push({line:Math.min(line+k,lastLine),openLine:line+k,
            kind:"modified",deleted:k===nn-1&&n>nn});
          line+=nn; i++;
        }else markers.push({line:Math.min(line,lastLine),openLine:Math.min(line,lastLine),kind:"deleted",eof:line>lastLine});
      }else{
        if(part.added){ blocks++; for(let k=0;k<n;k++) markers.push({line:Math.min(line+k,lastLine),openLine:line+k,kind:"added"}); }
        line+=n;
      }
    }
    return {markers,blocks};
  }
  function detailedGutter(before,after,lastLine){
    const wsn=value=>value.replace(/\s+/g," ").trim(), parts=Diff.diffLines(before,after), markers=[];
    let line=0,blocks=0;
    for(let i=0;i<parts.length;i++){
      const pt=parts[i],n=pt.count||0;
      if(pt.removed){
        const nx=parts[i+1];
        if(nx&&nx.added&&wsn(nx.value)===wsn(pt.value)){line+=nx.count||0;i++;continue;}
        if(!wsn(pt.value))continue;
        blocks++;
        if(nx&&nx.added){
          const nn=nx.count||0,changed=new Set(),wparts=Diff.diffWordsWithSpace(pt.value,nx.value),skip=new Set();
          for(let w=0;w<wparts.length;w++){
            const wp=wparts[w]; if(!(wp.added||wp.removed)||skip.has(w)||!wsn(wp.value))continue;
            for(let x=w+1;x<=w+2&&x<wparts.length;x++){
              const cand=wparts[x];
              if(x===w+1&&!cand.removed&&!cand.added){if(wsn(cand.value)!=="")break;continue;}
              if(!skip.has(x)&&!!cand.removed===!wp.removed&&!!cand.added===!wp.added&&wsn(cand.value)===wsn(wp.value)){skip.add(w);skip.add(x);} break;
            }
          }
          const lineOf=off=>{let count=0,pos=-1;for(;;){const next=nx.value.indexOf("\n",pos+1);if(next<0||next>=off)return count;count++;pos=next;}};
          let off=0;
          for(let w=0;w<wparts.length;w++){
            const wp=wparts[w];
            if(wp.removed){if(!skip.has(w)&&wsn(wp.value))changed.add(lineOf(off));continue;}
            if(wp.added&&!skip.has(w)&&wsn(wp.value)){const a=lineOf(off),b=lineOf(off+wp.value.length);for(let target=a;target<=b;target++)changed.add(target);}
            off+=wp.value.length;
          }
          if(!changed.size){blocks--;line+=nn;i++;continue;}
          const lastChanged=Math.max(...changed);
          for(let k=0;k<nn;k++)if(changed.has(k))markers.push({line:Math.min(line+k,lastLine),openLine:line+k,kind:"modified",deleted:k===lastChanged&&n>nn});
          line+=nn;i++;
        }else markers.push({line:Math.min(line,lastLine),openLine:Math.min(line,lastLine),kind:"deleted",eof:line>lastLine});
      }else{
        if(pt.added&&wsn(pt.value)){blocks++;for(let k=0;k<n;k++)markers.push({line:Math.min(line+k,lastLine),openLine:line+k,kind:"added"});}
        line+=n;
      }
    }
    return {markers,blocks};
  }
  function applyGutter(result, requestId, cm){
    let at=0;
    const batch=()=>{
      if(requestId!==gutterRequestId || tt) return;
      cm.operation(()=>{
        const stop=Math.min(at+100,result.markers.length);
        for(;at<stop;at++){
          const marker=result.markers[at];
          let html=marker.kind==="added"?'<div class="dv-bar a"></div>'
            :marker.kind==="modified"?'<div class="dv-bar m"></div>'
            :'<div class="dv-del'+(marker.eof?' eof':'')+'"></div>';
          if(marker.deleted) html+='<div class="dv-del eof"></div>';
          cm.setGutterMarker(marker.line,GUTTER,markerCell(html,marker.openLine));
        }
      });
      if(at<result.markers.length) setTimeout(batch,0);
      else updateCommitBtn(result.blocks);
    };
    setTimeout(batch,0);
  }
  function refreshGutter(){
    const cm = getCm();
    if(!cm || headText === null || tt) return;
    if(!gutterReady){
      cm.setOption("gutters", ["CodeMirror-linenumbers", GUTTER]);
      cm.on("gutterClick", (c, line, g) => { if(g === GUTTER) openHeadAt(line); });
      cm.on("change", () => {
        if(tt) return; // vue historique : le buffer affiché n'est pas le vrai
        clearTimeout(gutterTimer); gutterTimer = setTimeout(refreshGutter, 400);
      });
      gutterReady = true;
    }
    cancelGutter();
    const requestId=++gutterRequestId, before=headText, after=cm.getValue(), lastLine=cm.lineCount()-1;
    cm.operation(()=>cm.clearGutter(GUTTER));
    const fallback=()=>{
      if(before.length+after.length<=LOCAL_WORD_LIMIT)return setTimeout(()=>{
        if(requestId===gutterRequestId)applyGutter(detailedGutter(before,after,lastLine),requestId,cm);
      },0);
      lineFallback(before,after,()=>requestId===gutterRequestId,parts=>{
        if(requestId!==gutterRequestId)return;
        notify("calcul de gouttière indisponible — affichage simplifié");
        applyGutter(coarseGutter(parts,lastLine),requestId,cm);
      });
    };
    if(typeof Worker==="undefined") return fallback();
    try{
      gutterWorker=new Worker(workerUrl());
      gutterWorker.onmessage=({data})=>{
        if(data?.requestId!==requestId||requestId!==gutterRequestId)return;
        if(data.error)return fallback();
        applyGutter(data.gutter||{markers:[],blocks:0},requestId,cm);
      };
      gutterWorker.onerror=()=>{ if(requestId===gutterRequestId)fallback(); };
      gutterWorker.postMessage({kind:"gutter",requestId,before,after});
    }catch(e){ fallback(); }
  }
  async function fetchHead(){
    try{
      const r = await fetch("/githead?path=" + encodeURIComponent(path));
      const j = await r.json();
      if(!j || !j.ok || typeof j.text !== "string"){ return; }
      const changed = headText !== j.text;
      headSha = j.sha || "";
      headText = j.text;
      if(!baseGitLocked){
        baseTs = (Number(j.ts) || 0) * 1000; // figé avec la première base Git de session
        baseVersion = {before: j.text, ts: null, head: true, sha: headSha};
        baseGitLocked = true;
        arm();
        if(shown) render();
      } else if(changed && extCmp && extCmp.head){
        extCmp = {before: headText, label: "HEAD" + (headSha ? " (" + headSha + ")" : ""), head: true};
        if(shown) render();
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
    const target = displayedText();
    if(target === null) return;
    await restoreTarget(target, navMode >= 0 ? "l'intervention affichée" : extCmp?.label || "la vue affichée");
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

  // Relecture v2 déterministe, avec migration des snapshots v1 encore présents
  // dans localStorage ou renvoyés par une ancienne galerie.
  function addV2(data){
    const durable = materializeServer(data);
    if(durable){
      data = durable;
      serverRevision = durable.revision;
      serverBaseHash = durable.baseHash;
      if(!baseGitLocked && typeof durable.baseText === "string")
        baseVersion = {before: durable.baseText, ts: durable.baseMeta?.ts ?? null,
          head: durable.baseMeta?.kind === "git", sha: durable.baseMeta?.sha || ""};
      for(const it of durable.interventions) acknowledgedIds.add(it.id);
    }
    let added = 0;
    for(const it of (Array.isArray(data.interventions) ? data.interventions : [])){
      if(!it || typeof it.before !== "string" || typeof it.after !== "string") continue;
      if(typeof it.id === "string" && INTERVENTIONS.some(existing => existing.id === it.id)) continue;
      if(record(it.before, it.after, {source: it.source, status: it.status}, it.ts, it.id)) added++;
    }
    let legacyAdded = 0;
    for(const snap of (Array.isArray(data.legacySnapshots) ? data.legacySnapshots : [])){
      if(!snap || typeof snap.text !== "string") continue;
      const parsedTs = Number(snap.ts);
      const normalized = {text: snap.text,
        ts: snap.ts === null || !Number.isFinite(parsedTs) ? null : parsedTs,
        label: typeof snap.label === "string" ? snap.label : "snapshot legacy"};
      if(LEGACY_SNAPSHOTS.some(existing => existing.text === normalized.text
          && existing.ts === normalized.ts && existing.label === normalized.label)) continue;
      LEGACY_SNAPSHOTS.push(normalized);
      legacyAdded++;
    }
    if(typeof data.last === "string") lastKnown = data.last;
    else if(typeof data.lastKnown === "string") lastKnown = data.lastKnown;
    if(added || legacyAdded) arm();
    return added + legacyAdded;
  }
  function timelineStamp(data){
    const items = Array.isArray(data && data.interventions) ? data.interventions : [];
    if(!items.length) return {kind: "empty", value: -Infinity};
    const values = [];
    for(const it of items){
      if(!it || it.ts === null || !Number.isFinite(Number(it.ts))) return {kind: "unknown", value: null};
      values.push(Number(it.ts));
    }
    return {kind: "known", value: Math.max(...values)};
  }
  function localOwnsLast(localData, serverData){
    const localStamp = timelineStamp(localData), serverStamp = timelineStamp(serverData);
    if(localStamp.kind === "empty" && serverStamp.kind !== "empty") return false;
    if(serverStamp.kind === "empty" && localStamp.kind !== "empty") return true;
    // Une date absente ne permet pas de prouver que le serveur est plus récent :
    // conserver le buffer local évite tout recul silencieux de `lastKnown`.
    if(localStamp.kind !== "known" || serverStamp.kind !== "known") return true;
    return localStamp.value >= serverStamp.value; // égalité : local gagne
  }
  function reconcileV2(localData, serverData){
    const candidates = [];
    const addCandidates = (data, origin) => {
      for(const [order, it] of (Array.isArray(data.interventions) ? data.interventions : []).entries()){
        if(!it || typeof it.before !== "string" || typeof it.after !== "string") continue;
        candidates.push({it: {...it}, origin, order});
      }
    };
    addCandidates(serverData, "server");
    addCandidates(localData, "local");
    const byKey = new Map();
    for(const candidate of candidates){
      const it = candidate.it;
      const key = typeof it.id === "string" && it.id
        ? "id:" + it.id
        : "pair:" + JSON.stringify([it.before, it.after, it.source, it.status, it.ts]);
      const previous = byKey.get(key);
      if(!previous){ byKey.set(key, candidate); continue; }
      if(key.startsWith("id:") && (previous.it.before !== it.before || previous.it.after !== it.after
          || previous.it.source !== it.source || previous.it.status !== it.status)){
        stopPersistence("identifiant d'intervention divergent");
        return null;
      }
      const a = previous.it.ts === null ? null : Number(previous.it.ts);
      const b = it.ts === null ? null : Number(it.ts);
      const aKnown = Number.isFinite(a), bKnown = Number.isFinite(b);
      if(aKnown && bKnown && a !== b){
        if(b > a) byKey.set(key, candidate);
      } else if(candidate.origin === "local") byKey.set(key, candidate);
    }
    const merged = [...byKey.values()];
    merged.sort((a, b) => {
      const at = a.it.ts === null || !Number.isFinite(Number(a.it.ts)) ? -Infinity : Number(a.it.ts);
      const bt = b.it.ts === null || !Number.isFinite(Number(b.it.ts)) ? -Infinity : Number(b.it.ts);
      if(at !== bt) return at - bt;
      if(a.origin !== b.origin) return a.origin === "local" ? -1 : 1;
      return a.order - b.order;
    });
    const legacySnapshots = [];
    const legacyKeys = new Set();
    for(const data of [localData, serverData]){
      for(const snap of (Array.isArray(data.legacySnapshots) ? data.legacySnapshots : [])){
        if(!snap || typeof snap.text !== "string") continue;
        const key = JSON.stringify([snap.text, snap.ts, snap.label]);
        if(legacyKeys.has(key)) continue;
        legacyKeys.add(key); legacySnapshots.push({...snap});
      }
    }
    const localWins = localOwnsLast(localData, serverData);
    const primary = localWins ? localData : serverData;
    const secondary = localWins ? serverData : localData;
    const last = typeof primary.last === "string" ? primary.last
      : typeof secondary.last === "string" ? secondary.last : null;
    return {v: 2, interventions: merged.map(candidate => candidate.it), legacySnapshots, last};
  }
  function replaceWithV2(data){
    INTERVENTIONS.splice(0, INTERVENTIONS.length);
    LEGACY_SNAPSHOTS.splice(0, LEGACY_SNAPSHOTS.length);
    if(!baseGitLocked) baseVersion = null;
    lastKnown = null;
    addV2(data);
  }
  function addV1(data){
    const snapshots = (Array.isArray(data.items) ? data.items : [])
      .filter(it => it && typeof it.b === "string")
      .map((it, i) => {
        const parsedTs = Number(it.t);
        return {text: it.b,
          ts: Object.prototype.hasOwnProperty.call(it, "t") && Number.isFinite(parsedTs) ? parsedTs : null,
          index: i};
      });
    const usedAsBefore = new Set();
    for(let i = 0; i + 1 < snapshots.length; i++){
      const before = snapshots[i], after = snapshots[i + 1];
      if(record(before.text, after.text, {source: "legacy", status: "applied"}, after.ts))
        usedAsBefore.add(i);
    }
    const finalSnapshot = snapshots[snapshots.length - 1];
    if(finalSnapshot && typeof data.last === "string"
        && record(finalSnapshot.text, data.last, {source: "legacy", status: "applied"}, null))
      usedAsBefore.add(snapshots.length - 1);
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
    const generation = runtimePushes;
    let localData = null;
    try{ localData = JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){}
    const hasLocalV2 = !!(localData && localData.v === 2);
    // Charger le journal local avant le premier await garantit que tout push
    // concurrent sera ajouté après lui, jamais avant une histoire restaurée.
    if(hasLocalV2){ loadData(localData); acknowledgedIds.clear(); }
    let serverData = null;
    try{
      const r = await fetch("/versions?path=" + encodeURIComponent(path));
      const j = await r.json();
      if(j && j.ok) serverData = j;
    }catch(e){}
    // Le GET a démarré avant une action runtime : sa réponse est stale et
    // ne peut plus muter ni réordonner le journal courant.
    if(runtimePushes !== generation) return;
    if(serverData && serverData.v === 2){
      const decodedServer = materializeServer(serverData);
      if(decodedServer){
        serverRevision = decodedServer.revision;
        serverBaseHash = decodedServer.baseHash;
        acknowledgedIds.clear();
        for(const it of decodedServer.interventions) acknowledgedIds.add(it.id);
      }
      if(hasLocalV2){
        const decodedLocal = materializeServer(localData);
        if(decodedLocal?.baseHash && decodedServer?.baseHash && decodedLocal.baseHash !== decodedServer.baseHash){
          stopPersistence("conflit de base");
          return;
        }
        const reconciled = reconcileV2(decodedLocal || localData, decodedServer || serverData);
        if(!reconciled) return;
        replaceWithV2(reconciled);
        const baseOwner = decodedServer || decodedLocal;
        if(!baseGitLocked && baseOwner && typeof baseOwner.baseText === "string")
          baseVersion = {before: baseOwner.baseText, ts: baseOwner.baseMeta?.ts ?? null,
            head: baseOwner.baseMeta?.kind === "git", sha: baseOwner.baseMeta?.sha || ""};
      } else loadData(serverData);
    }
    else if(serverData && !hasLocalV2){
      loadData(serverData);
      if(!INTERVENTIONS.length && !LEGACY_SNAPSHOTS.length && lastKnown === null) loadData(localData);
    }
    else if(!serverData && !hasLocalV2) loadData(localData);
    const unacknowledged = INTERVENTIONS.filter(it => !acknowledgedIds.has(it.id));
    for(const it of unacknowledged) pendingById.set(it.id, it);
    if(unacknowledged.length) persist(lastKnown === null ? liveText() : lastKnown);
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
      let persistBaseline = false;
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
        lastKnown = now;
        persistBaseline = true; // attendre la base Git avant le premier init v2
      }
      fetchHead().then(() => {
        if(persistBaseline && runtimePushes === 0) persist(now);
        refreshGutter();
        // sélection par défaut du ± : la base (diff cumulatif, comme la gouttière)
        if(!shown) updateTag();
      });
    });
  }, 300);

  // isBusy : vue historique active (buffer temporairement remplacé) — les hôtes
  // doivent suspendre leur rechargement-disque automatique pendant ce temps
  return { push, compareExternal, isEquivalent: equivalent, isShown: () => shown, isBusy: () => !!tt };
};
