# Ouverture fichiers depuis le chat + commentaires LaTeX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Cliquer un fichier mentionné dans le chat l'ouvre dans un onglet Atelier ; (B) commentaires LaTeX avec couleur par commentaire, panneau liste, « envoyer tout au chat » et « tout supprimer ».

**Architecture:** Partie A = petits changements dans `src/components/Chat.tsx` (renderers markdown + chip Edited) et `src/App.tsx` (`openFileTab` accepte les chemins absolus sous le projet). Partie B = ajouts dans `gallery/assets/latex_studio.html` uniquement (champ `color` optionnel, pastilles dans le popup `#texcPop`, panneau `#texcPanel` calqué sur `#outline`) — **ne pas toucher** `texcFind`/`texcAnchorAll`/`texcSyncFromMarks` (PIEGES_CONNUS §6).

**Tech Stack:** React/TS (frontend Tauri), HTML/CSS/JS vanilla + CodeMirror 5 (latex_studio), serveur galerie Node (`/pdfannot`, inchangé).

## Global Constraints

- Design system : tailles 10/11/12/13/15, poids 400/500/600, rayons 6/10/999, SVG monochromes stroke 1.3–1.5, aucune couleur en dur côté React (variables CSS).
- `npx tsc --noEmit` et `npx vite build` doivent passer.
- `node gallery/server/tests/diff_suite.mjs` obligatoire après toute modif de `gallery/`.
- Lire `docs/PIEGES_CONNUS.md` §6 avant la partie B ; interdiction de refactorer le ré-ancrage.
- Après modif de `latex_studio.html` : copier vers `src-tauri/gallery-dist/latex_studio.html` et `.fig_thumbs/latex_studio.html` (racine repo).
- Ne pas pusher.

---

### Task A1 : chip cliquable pour chemin nu en code inline

**Files:**
- Modify: `src/components/Chat.tsx:373-385` (renderer `code` de `MD_COMPONENTS` ; `MD_COMPONENTS_STREAMING` à la ligne 390 en hérite automatiquement via spread)

**Interfaces:**
- Consomme : `FILE_REF` (Chat.tsx:70), `openFileRef` (Chat.tsx:72), `mdText`.
- Produit : rien de nouveau — le même bouton `.file-ref` existant, désormais aussi pour un chemin sans `:ligne`.

- [ ] **Step 1 : retirer l'exigence `:ligne`**

Dans le renderer `code` (ligne 375), remplacer :
```tsx
    if (!props.className && FILE_REF.test(txt) && txt.includes(":"))
```
par :
```tsx
    if (!props.className && FILE_REF.test(txt))
```

- [ ] **Step 2 : vérifier types + build**

Run: `npx tsc --noEmit` (ignorer `src/test_auto_review*.ts`) puis `npx vite build`. Expected: PASS.

- [ ] **Step 3 : commit**

```bash
git add src/components/Chat.tsx
git commit -m "feat(chat): chemin de fichier nu en code inline devient un chip ouvrable"
```

### Task A2 : `openFileTab` accepte un chemin absolu sous le projet actif

**Files:**
- Modify: `src/App.tsx:1070-1104` (`openFileTab`)

**Interfaces:**
- Consomme : `activeProject` (string, racine absolue du projet actif), déjà en closure.
- Produit : `openFileTab(rel, line?)` tolère `rel` absolu ; hors projet → no-op silencieux.

- [ ] **Step 1 : normaliser le chemin en tête de fonction**

Au début de `openFileTab`, juste après `if (!atelierUrl || !activeProject) return;`, insérer :
```ts
    // chemin absolu venant du chat : ne garder que ceux sous le projet actif
    if (rel.startsWith("/")) {
      const root = activeProject.endsWith("/") ? activeProject : activeProject + "/";
      if (!rel.startsWith(root)) return;
      rel = rel.slice(root.length);
    }
```

- [ ] **Step 2 : vérifier types + build**

Run: `npx tsc --noEmit` puis `npx vite build`. Expected: PASS.

- [ ] **Step 3 : commit**

```bash
git add src/App.tsx
git commit -m "feat(atelier): openFileTab accepte un chemin absolu sous le projet actif"
```

### Task A3 : chip « Edited » ouvre le fichier ; diff sur bouton séparé

**Files:**
- Modify: `src/components/Chat.tsx:288-315` (rendu d'un fichier édité) ; CSS `.edit-line-row` dans `src/App.css` (chercher `edit-line-row`)

**Interfaces:**
- Consomme : `openFileRef(path)` (Chat.tsx:72) — passer `f.path` tel quel (absolu ok grâce à A2 ; relatif résolu par le handler `chat-open-file`).
- Produit : structure DOM `.edit-line-row` = `<div>` contenant deux `<button>` (`.edit-line-open`, `.edit-line-difftoggle`).

- [ ] **Step 1 : scinder le bouton unique en deux boutons**

Remplacer le bloc `<button type="button" className="edit-line-row" …>…</button>` (lignes 290-315) par :
```tsx
            <div className="edit-line-row" title={f.path}>
              <button
                type="button"
                className="edit-line-open"
                onClick={() => openFileRef(f.path)}
                title={t("action.open-file", { ref: f.path })}
              >
                <PencilIcon />
                <span className="edit-line-verb">{t("chat.edited")}</span>
                <span className="edit-line-file">{base}</span>
                {f.add != null && <span className="edit-line-add">+{f.add}</span>}
                {f.del != null && <span className="edit-line-del">-{f.del}</span>}
              </button>
              <button
                type="button"
                className="edit-line-difftoggle"
                aria-expanded={open}
                title={t("git.diff", { defaultValue: "diff" })}
                onClick={() => {
                  const next = open ? null : f.path;
                  setOpenPath(next);
                  if (!next || diffs[f.path] != null || loading === f.path) return;
                  setLoading(f.path);
                  const sent = wsSend({
                    type: "gitDiff",
                    threadId,
                    projectRoot: event.projectRoot,
                    path: f.path,
                  });
                  if (!sent) setLoading(null);
                }}
              >
                <span className="tool-tick">{open ? "▾" : "▸"}</span>
              </button>
            </div>
```
Note : si `t("git.diff")` n'existe pas dans les locales, utiliser la clé existante la plus proche (chercher dans `src/locales/`) ou le littéral `"diff"`.

- [ ] **Step 2 : CSS**

Dans `src/App.css`, localiser la règle `.edit-line-row` (bouton). La convertir en conteneur flex et styler les deux boutons internes en reprenant exactement les propriétés existantes (fond transparent, couleur, hover). Ajouter :
```css
.edit-line-row { display: flex; align-items: center; gap: 0; }
.edit-line-open, .edit-line-difftoggle { background: transparent; border: none; color: inherit;
  font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px;
  border-radius: var(--r-s, 6px); }
.edit-line-open:hover, .edit-line-difftoggle:hover { color: var(--fg); }
```
Adapter selon les règles existantes (ne pas dupliquer ce qui est déjà hérité ; supprimer des anciennes règles ce qui ne s'applique plus au conteneur).

- [ ] **Step 3 : vérifier types + build**

Run: `npx tsc --noEmit` puis `npx vite build`. Expected: PASS.

- [ ] **Step 4 : commit**

```bash
git add src/components/Chat.tsx src/App.css
git commit -m "feat(chat): clic sur le chip Edited ouvre le fichier dans Atelier, diff sur bouton dédié"
```

### Task B1 : couleur par commentaire (popup + marks)

**Files:**
- Modify: `gallery/assets/latex_studio.html` — CSS ligne ~243, markup `#texcPop` lignes 396-403, JS `texcMark` (~1268), `texcShow` (~1279)

**Interfaces:**
- Consomme : objet commentaire `{id, from, to, text, comment}`, `texcMarks`, `texcSave()`.
- Produit : champ optionnel `color` ∈ {`amber`,`red`,`blue`,`green`,`purple`} (absent = amber) ; classes CSS `.texc-c-<color>` ; helper `texcRemark(c)`.

- [ ] **Step 0 : lire `docs/PIEGES_CONNUS.md` §6** (obligatoire avant de toucher le fichier).

- [ ] **Step 1 : CSS des 5 couleurs**

Après la ligne `.texc-hl{…}` (243), ajouter :
```css
  .texc-c-amber{background:rgba(224,183,74,.14);border-bottom-color:rgba(224,183,74,.6)}
  .texc-c-red{background:rgba(224,114,106,.14);border-bottom-color:rgba(224,114,106,.6)}
  .texc-c-blue{background:rgba(91,157,255,.14);border-bottom-color:rgba(91,157,255,.6)}
  .texc-c-green{background:rgba(126,192,120,.14);border-bottom-color:rgba(126,192,120,.6)}
  .texc-c-purple{background:rgba(170,140,224,.14);border-bottom-color:rgba(170,140,224,.6)}
  #texcPop .tc-colors{display:flex;gap:6px;margin-top:8px}
  #texcPop .tc-colors button{width:14px;height:14px;border-radius:999px;border:1px solid transparent;cursor:pointer;padding:0}
  #texcPop .tc-colors button.on{border-color:var(--txt)}
  #texcPop .tc-colors .sw-amber{background:rgba(224,183,74,.85)}
  #texcPop .tc-colors .sw-red{background:rgba(224,114,106,.85)}
  #texcPop .tc-colors .sw-blue{background:rgba(91,157,255,.85)}
  #texcPop .tc-colors .sw-green{background:rgba(126,192,120,.85)}
  #texcPop .tc-colors .sw-purple{background:rgba(170,140,224,.85)}
```
(`.texc-hl` garde son fond ambre par défaut ; les classes `texc-c-*` le surchargent, `border-bottom-color` s'applique au pointillé existant.)

- [ ] **Step 2 : markup des pastilles**

Dans `#texcPop`, entre le `<textarea>` et `<div class="tc-row">`, insérer :
```html
<div class="tc-colors">
<button class="sw-amber" data-color="amber" title="Ambre"></button>
<button class="sw-red" data-color="red" title="Rouge"></button>
<button class="sw-blue" data-color="blue" title="Bleu"></button>
<button class="sw-green" data-color="green" title="Vert"></button>
<button class="sw-purple" data-color="purple" title="Violet"></button>
</div>
```

- [ ] **Step 3 : JS — mark coloré + sélection**

Remplacer le corps de `texcMark` :
```js
function texcMark(c){
  if(!cm) return;
  try {
    texcMarks[c.id] = cm.markText(c.from, c.to, {className: "texc-hl texc-c-" + (c.color || "amber"), attributes: {"data-texc": c.id}});
  } catch(e){}
}
function texcRemark(c){
  if(texcMarks[c.id]){ try{ texcMarks[c.id].clear(); }catch(e){} delete texcMarks[c.id]; }
  texcMark(c);
}
```
Dans `texcShow(c, isNew)`, après la ligne qui remplit le textarea, ajouter :
```js
  texcPop.querySelectorAll(".tc-colors button").forEach(b =>
    b.classList.toggle("on", b.dataset.color === (c.color || "amber")));
```
Après les handlers existants (`tc-save` etc.), ajouter :
```js
texcPop.querySelectorAll(".tc-colors button").forEach(b => {
  b.onclick = () => {
    if(!texcCur) return;
    texcCur.color = b.dataset.color;
    texcPop.querySelectorAll(".tc-colors button").forEach(x => x.classList.toggle("on", x === b));
    if(texcAll.find(x => x.id === texcCur.id)){ texcRemark(texcCur); texcSave(); }
  };
});
```
(Pour un commentaire pas encore enregistré, la couleur est simplement portée par `texcCur` et appliquée au `texcMark` du save.)

- [ ] **Step 4 : suite de tests galerie**

Run: `node gallery/server/tests/diff_suite.mjs`. Expected: 67/67 PASS (aucune régression).

- [ ] **Step 5 : commit**

```bash
git add gallery/assets/latex_studio.html
git commit -m "feat(latex-studio): couleur par commentaire (5 pastilles dans le popup)"
```

### Task B2 : panneau Commentaires + envoyer tout + tout supprimer

**Files:**
- Modify: `gallery/assets/latex_studio.html` — bouton toolbar près de `#outlineBtn` (ligne ~371), markup après `<div id="outline"></div>` (ligne 395), CSS après le bloc `#outline` (~270), JS après le bloc outline (~1377)

**Interfaces:**
- Consomme : `texcAll`, `texcMarks`, `texcRemove(id)`, `texcRemark(c)` (B1), `texcSave()`, `__atelierPost`, `cm`, `path`.
- Produit : `#texcBtn`, `#texcPanel`, `buildTexcPanel()`, `toggleTexcPanel(force?)`.

- [ ] **Step 1 : bouton toolbar**

Juste après le `<button id="outlineBtn" …>` (ligne 371), ajouter :
```html
    <button id="texcBtn" title="Commentaires"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z"/><path d="M5.5 6.8h5M5.5 9.2h3.4"/></svg></button>
```

- [ ] **Step 2 : markup du panneau**

Après `<div id="outline"></div>` (ligne 395) :
```html
<div id="texcPanel"></div>
```

- [ ] **Step 3 : CSS du panneau**

Après le bloc CSS `#outline` :
```css
  #texcPanel{display:none;position:absolute;top:6px;right:8px;z-index:70;width:300px;max-height:70%;
    background:var(--card);border:1px solid var(--border-strong,#3f4652);border-radius:10px;
    box-shadow:0 10px 34px rgba(0,0,0,.4);overflow-y:auto;padding:6px}
  #texcPanel.open{display:block}
  #texcPanel .tp-head{display:flex;align-items:center;gap:6px;padding:4px 8px 8px}
  #texcPanel .tp-head .tp-title{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);flex:1}
  #texcPanel .tp-head button{background:transparent;border:1px solid var(--border);border-radius:6px;
    color:var(--muted);font:11px -apple-system,sans-serif;padding:2px 8px;cursor:pointer;white-space:nowrap}
  #texcPanel .tp-head button:hover{color:var(--txt);background:var(--card2)}
  #texcPanel .tp-head .tp-delall:hover{color:#e0726a}
  #texcPanel .tp-item{display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;background:transparent;
    border:none;padding:6px 8px;border-radius:6px;cursor:pointer}
  #texcPanel .tp-item:hover{background:var(--card2)}
  #texcPanel .tp-dot{width:8px;height:8px;border-radius:999px;flex-shrink:0;margin-top:4px}
  #texcPanel .tp-body{min-width:0}
  #texcPanel .tp-quote{font:italic 11px/1.4 -apple-system,sans-serif;color:var(--muted);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #texcPanel .tp-note{font:12px/1.4 -apple-system,sans-serif;color:var(--txt);margin-top:1px}
  #texcPanel .tp-x{background:transparent;border:none;color:var(--muted);cursor:pointer;padding:0 4px;
    border-radius:6px;margin-left:auto;flex-shrink:0}
  #texcPanel .tp-x:hover{color:#e0726a}
  #texcPanel .tp-empty{font:12px -apple-system,sans-serif;color:var(--muted);padding:6px 8px}
```

- [ ] **Step 4 : JS du panneau**

Après le bloc outline (~ligne 1377), ajouter :
```js
// ---- panneau commentaires : liste, envoyer tout, tout supprimer ----
const texcPanel = document.getElementById("texcPanel");
const TEXC_SW = {amber:"rgba(224,183,74,.85)",red:"rgba(224,114,106,.85)",blue:"rgba(91,157,255,.85)",
  green:"rgba(126,192,120,.85)",purple:"rgba(170,140,224,.85)"};
const texcEsc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function texcSorted(){ return texcAll.slice().sort((a,b) => (a.from.line - b.from.line) || (a.from.ch - b.from.ch)); }
function buildTexcPanel(){
  const items = texcSorted();
  texcPanel.innerHTML = '<div class="tp-head"><span class="tp-title">Commentaires (' + items.length + ')</span>' +
    '<button class="tp-sendall" title="Envoyer tous les commentaires au chat">Envoyer tout</button>' +
    '<button class="tp-delall" title="Supprimer tous les commentaires">Tout supprimer</button></div>' +
    (items.length ? items.map(c =>
      '<div class="tp-item" data-id="' + c.id + '">' +
      '<span class="tp-dot" style="background:' + (TEXC_SW[c.color || "amber"]) + '"></span>' +
      '<span class="tp-body"><span class="tp-quote">« ' + texcEsc(c.text.slice(0, 70)) + ' »</span>' +
      (c.comment ? '<div class="tp-note">' + texcEsc(c.comment) + '</div>' : '') + '</span>' +
      '<button class="tp-x" data-x="' + c.id + '" title="Supprimer">✕</button></div>').join("")
    : '<div class="tp-empty">aucun commentaire</div>');
}
function toggleTexcPanel(force){
  const open = force ?? !texcPanel.classList.contains("open");
  texcPanel.classList.toggle("open", open);
  if(open) buildTexcPanel();
}
document.getElementById("texcBtn").onclick = () => toggleTexcPanel();
let texcDelArm = null;
texcPanel.addEventListener("click", (e) => {
  const x = e.target.closest(".tp-x");
  if(x){ texcRemove(x.dataset.x); buildTexcPanel(); return; }
  if(e.target.closest(".tp-sendall")){
    const items = texcSorted();
    if(!items.length) return;
    const msg = path + " — " + items.length + " commentaire" + (items.length > 1 ? "s" : "") + " :\n" +
      items.map((c, i) => (i+1) + ". (L" + (c.from.line+1) + (c.to.line !== c.from.line ? "-" + (c.to.line+1) : "") + ") « " +
        c.text.slice(0, 200) + " » — Commentaire : " + (c.comment || "(voir passage)")).join("\n");
    __atelierPost({type: "atelier-add-to-chat", text: msg});
    toggleTexcPanel(false);
    return;
  }
  const del = e.target.closest(".tp-delall");
  if(del){
    if(texcDelArm){
      clearTimeout(texcDelArm); texcDelArm = null;
      for(const id of Object.keys(texcMarks)){ try{ texcMarks[id].clear(); }catch(err){} }
      texcMarks = {}; texcAll = []; texcSave(); buildTexcPanel();
    } else {
      del.textContent = "Confirmer ?";
      texcDelArm = setTimeout(() => { texcDelArm = null; buildTexcPanel(); }, 3000);
    }
    return;
  }
  const it = e.target.closest(".tp-item[data-id]");
  if(it){
    const c = texcAll.find(x2 => x2.id === it.dataset.id);
    if(c){ cm.setCursor(c.from); cm.scrollIntoView({from: c.from, to: c.to}, 80); cm.focus(); toggleTexcPanel(false); }
  }
});
document.addEventListener("mousedown", (e) => {
  if(texcPanel.classList.contains("open") && !texcPanel.contains(e.target) && !e.target.closest("#texcBtn"))
    toggleTexcPanel(false);
});
```

- [ ] **Step 5 : suite de tests galerie**

Run: `node gallery/server/tests/diff_suite.mjs`. Expected: tous PASS.

- [ ] **Step 6 : commit**

```bash
git add gallery/assets/latex_studio.html
git commit -m "feat(latex-studio): panneau commentaires — envoyer tout au chat, tout supprimer, couleurs"
```

### Task B3 : propagation gallery-dist + .fig_thumbs et vérif finale

**Files:**
- Copy: `gallery/assets/latex_studio.html` → `src-tauri/gallery-dist/latex_studio.html` (si présent) et `.fig_thumbs/latex_studio.html` (racine repo, copie servie)

- [ ] **Step 1 : propager**

```bash
ls src-tauri/gallery-dist/latex_studio.html && cp gallery/assets/latex_studio.html src-tauri/gallery-dist/latex_studio.html
ls .fig_thumbs/latex_studio.html && cp gallery/assets/latex_studio.html .fig_thumbs/latex_studio.html
```
(Si un chemin n'existe pas, le signaler et passer.)

- [ ] **Step 2 : vérif globale**

Run: `npx tsc --noEmit`, `npx vite build`, `node gallery/server/tests/diff_suite.mjs`. Expected: tous PASS.

- [ ] **Step 3 : commit**

```bash
git add -A src-tauri/gallery-dist .fig_thumbs/latex_studio.html
git commit -m "chore(gallery): propage latex_studio.html vers gallery-dist et .fig_thumbs"
```
