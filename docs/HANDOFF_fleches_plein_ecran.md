# Passation — flèches de navigation en plein écran dans la galerie (Atelier Studio)

Rédigé le 2026-07-10. L'utilisateur (Thierry) rapporte que la fonctionnalité **ne marche toujours pas** malgré les correctifs décrits ci-dessous. Ce document donne tout le contexte pour reprendre le diagnostic à zéro, sans accès à la conversation précédente.

## 1. L'application et l'architecture de la galerie

- **Atelier Studio** : app macOS Tauri 2 (repo `/Users/tofunori/Documents/atelier-studio`). Le binaire utilisé tourne depuis le bundle compilé :
  `/Users/tofunori/Documents/atelier-studio/src-tauri/target/release/bundle/macos/Atelier.app` (process `tauri-app`, bundle id `com.tofunori.tauri-app`).
- La galerie scientifique est **vendorisée** dans `gallery/` du repo. Le fichier central est le template
  `gallery/assets/gallery_template.html` (~2100 lignes, HTML+CSS+JS inline).
- **Serveur galerie** : Node, code dans `gallery/server/` (`main.mjs`, `builder.mjs`, `routes/`). MAIS le serveur qui tourne est lancé **depuis le bundle .app** :
  `Atelier.app/Contents/Resources/gallery/server/main.mjs` — donc avec les assets du bundle, **pas** ceux du repo.
- **Un serveur par projet scanné**, port = 18790 + hash(root). Au moment du diagnostic :
  - port **19175** → projectRoot `/Users/tofunori/Documents/atelier-studio`
  - port **18978** → projectRoot `/Users/tofunori/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis/manuscript_ch1` ← **c'est la galerie que Thierry utilise** (figures de thèse : `fig1_evidence.png`, `figS1_monthly_mechanism_v2.png`, etc.)
  - Vérifier : `curl -s http://127.0.0.1:<port>/health` renvoie le projectRoot.
- **Comment la page est servie** (source : `gallery/server/main.mjs`) :
  - L'app Tauri ouvre `http://127.0.0.1:<port>/figures_index.html` (voir `src-tauri/src/atelier.rs:28`).
  - `GET /` passe par `serveLiveShell()` (rendu à la requête depuis le template du **bundle** + `figures_data.json`), mais `GET /figures_index.html` sert le **fichier disque** `<projectRoot>/figures_index.html` (fallback statique). Donc la page réellement affichée = le fichier du projet sur disque.
  - `ensureFreshShell()` (main.mjs:24) : si mtime(template bundle) > mtime(shell disque), le shell est régénéré depuis le template du bundle — s'exécute sur `GET /` seulement.
  - Un **rescan** régénère aussi le shell depuis le template du bundle.
- **Live-reload côté page** : toutes les 2,5 s la page interroge `GET /rev` (= max mtime de `figures_data.json` / `figures_index.html` du projet) et fait `location.reload()` si ça a changé — **sauf si la lightbox est ouverte** ou si du texte est sélectionné (fin du template, fonction IIFE "live reload").

## 2. La demande initiale et le comportement attendu

Dans la lightbox de la galerie (`#lb` dans le template) :

- Mode normal : chevrons `#lbPrev`/`#lbNext` (‹ ›) et flèches clavier ← → naviguent dans `lbList`.
- Mode **plein écran** (`f`, double-clic, ou bouton ⛶ → classe CSS `fs` sur `#lb`) : historiquement, TOUTE l'UI était masquée (ligne ~250 : `#lb.fs #lbCap,#lb.fs .lbBtn,#lb.fs #lbClose,…{display:none!important}`). Seul le bouton ⛶ réapparaissait au mouvement de souris via la classe `fs-ui` (fonction `lbFsUiPulse()`, timer 2,2 s).

Demandes de Thierry :
1. **Afficher des flèches de navigation en plein écran** (option retenue : révélation au mouvement de souris, comme le bouton ⛶).
2. **Sauter les SVG en plein écran** : naviguer vers un `.svg` bascule la lightbox en mode `vw` (iframe `svg_viewer.html` pleine fenêtre) qui masque l'UI **et capte souris+clavier** → l'utilisateur reste coincé (« ça bloque »). Attendu : en plein écran, ne naviguer qu'entre `png`/`jpg`/`jpeg`.

## 3. Modifications déjà appliquées (à vérifier/critiquer)

### 3a. CSS (dans le `<style>` du template, autour de la ligne 250)

`.lbBtn` retiré de la règle de masquage `#lb.fs …{display:none!important}`, et ajout :

```css
#lb.fs .lbBtn{opacity:0;pointer-events:none;color:rgba(255,255,255,.75);
    background:rgba(0,0,0,.5);border-radius:999px;width:40px;height:40px;padding:0;
    display:flex;align-items:center;justify-content:center;font-size:26px;
    transition:opacity 140ms ease}
#lb.fs #lbPrev{left:10px} #lb.fs #lbNext{right:10px}
#lb.fs.fs-ui .lbBtn{opacity:1;pointer-events:auto;cursor:pointer}
#lb.fs.fs-ui .lbBtn:hover{color:#fff}
@media (prefers-reduced-motion:reduce){ #lb.fs .lbBtn{transition:none} }
```

### 3b. JS — nouvelle fonction `lbNav` + remplacement des 4 points d'appel

Insérée juste avant `async function lbClose()` :

```js
function lbNav(dir){
  let i=lbIdx+dir;
  if(lb().classList.contains('fs')){
    while(i>=0&&i<lbList.length&&!['png','jpg','jpeg'].includes(lbList[i].ext)) i+=dir;
  }
  lbShow(i);
}
```

Remplacements : le handler clavier (`ArrowLeft`/`ArrowRight`, ~ligne 1576) et les onclick de `#lbPrev`/`#lbNext` (~ligne 2089) appellent `lbNav(-1)`/`lbNav(1)` au lieu de `lbShow(lbIdx±1)`.

### 3c. Fichiers patchés (tous avec les patchs 3a+3b identiques)

1. `gallery/assets/gallery_template.html` (source, repo)
2. `src-tauri/gallery-dist/assets/gallery_template.html` (miroir repo)
3. `/Users/tofunori/Documents/atelier-studio/figures_index.html` (shell construit, racine repo)
4. `/Users/tofunori/Documents/atelier-studio/gallery/figures_index.html`
5. `/Users/tofunori/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis/manuscript_ch1/figures_index.html` ← le shell servi à Thierry

**NON patché volontairement** : le template dans le bundle
`Atelier.app/Contents/Resources/gallery/assets/gallery_template.html` (écriture dans un .app signé = risqué ; leçon connue du projet : ne jamais écrire dans le bundle). Conséquence : **un rescan du projet manuscript_ch1 régénère le shell depuis ce template NON patché et efface le fix**. C'est le point de fragilité n°1.

### 3d. Tests passés

- `node gallery/server/tests/diff_suite.mjs` → 78 tests OK (suite obligatoire du repo).
- Test navigateur (serveur statique + lightbox pilotée en JS) : au repos opacité 0 / clics inertes ; après mousemove opacité 1 + cliquable ; retour à 0 après 2,2 s ; avec `lbList` stub `png/svg/png/svg/svg/png/svg` : mode normal ne saute rien, mode fs saute les svg dans les deux sens, butée propre en fin de liste.
- Test **dans l'app réelle** via contrôle du poste (10 juil. ~11h56) : lightbox sur `figS1_monthly_mechanism_v2.png` → `f` → chevrons visibles au mousemove → `→` a bien sauté `figS1_…_v2.svg` → navigation chevrons OK sur plusieurs figures. **Lors de ce test, ça marchait.**

## 4. Le problème rapporté

Thierry rapporte après tout cela : **« ça ne fonctionne pas »** (répété, avec insistance). Le geste exact qui échoue n'a **pas** été précisé (chevrons absents ? svg toujours bloquant ? autre surface ?). Toute reprise du diagnostic doit commencer par **faire préciser ou observer le geste exact et la surface exacte** où ça échoue.

## 5. Hypothèses restantes (non éliminées)

1. **Page pas rechargée au moment de ses tests** : le live-reload est suspendu tant que la lightbox est ouverte. S'il rouvre l'app/l'onglet et teste immédiatement dans la lightbox, il peut encore être sur l'ancienne page. → Vérifier depuis la page (DevTools/inspection) que `typeof lbNav === 'function'`.
2. **Rescan intermédiaire** : si un rescan de manuscript_ch1 a eu lieu après le patch (auto ou manuel), le shell a été régénéré depuis le template NON patché du bundle → régression silencieuse. Vérifier : `grep -c lbNav /Users/tofunori/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis/manuscript_ch1/figures_index.html` (attendu : 5 ; si 0 → le rescan a écrasé). Fix durable : patcher le template du bundle OU rebuilder l'app (le repo est déjà patché).
3. **Autre surface que la lightbox HTML** : l'app a aussi un **viewer plein écran natif** (`native_fullscreen_viewer.py`, déclenché via `POST /orca-native-fullscreen` quand l'URL porte `?orcaFs=1`/`?cssFs=1` — a priori PAS le cas dans Atelier Studio, l'URL est nue) et une action « Open (app) » sur les cartes. Si Thierry passe par un de ces chemins, le patch ne s'applique pas du tout.
4. **Focus clavier de l'iframe** : observé pendant le test réel — `Échap` (et parfois les flèches ?) n'atteignent pas la page si le focus n'est pas dans l'iframe galerie ; un clic dans l'image le restaure. Si Thierry « appuie sur → et rien ne se passe », ça peut être ça — problème distinct, préexistant au patch.
5. **Plusieurs fenêtres/projets** : deux serveurs tournent (19175 et 18978). S'il teste la galerie d'un AUTRE projet que manuscript_ch1 (ou un projet scanné après coup, nouveau port), son shell n'est pas patché.
6. **Le patch lui-même a un défaut non détecté** dans le contexte réel (interaction avec `annotGuard`, mode `vw`, vidéo, etc.). Les tests ci-dessus ne couvrent pas : entrer en plein écran DEPUIS un état `vw` (svg déjà ouvert), annotations en cours, vidéos.

## 6. Comment vérifier vite (commandes)

```bash
# Quels serveurs galerie tournent, et pour quels projets ?
lsof -iTCP -sTCP:LISTEN -P | grep node
curl -s http://127.0.0.1:18978/health   # → projectRoot
# La page servie contient-elle le patch ?
curl -s http://127.0.0.1:18978/figures_index.html | grep -c "lbNav"        # attendu 5
curl -s http://127.0.0.1:18978/figures_index.html | grep -c "#lb.fs .lbBtn" # attendu 2
# Le shell disque du projet est-il patché ?
grep -c "lbNav" "/Users/tofunori/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis/manuscript_ch1/figures_index.html"
# Le template du bundle (source des rescans) est-il patché ? (probablement NON)
grep -c "lbNav" "/Users/tofunori/Documents/atelier-studio/src-tauri/target/release/bundle/macos/Atelier.app/Contents/Resources/gallery/assets/gallery_template.html"
# Suite de tests obligatoire après toute modif de gallery/
node /Users/tofunori/Documents/atelier-studio/gallery/server/tests/diff_suite.mjs
```

## 7. Repères dans le code (repo, après patch)

- Template : `gallery/assets/gallery_template.html`
  - CSS fs/chevrons : ~lignes 250–265 ; CSS `vw` : `#lb.vw …{display:none}` juste après.
  - `lbShow` : ~1384 (async ; `vw` = pdf/md/code/svg → iframe `#lbPdf` ; garde `annotGuard` ; bornes i<0/i>=length → return).
  - `lbNav` : juste avant `lbClose` (~1422).
  - `lbFsToggle`/`lbFsEnter`/`lbFsExit`/`lbFsUiPulse` : ~1461–1554.
  - Handler clavier : ~1566–1585 ; onclick chevrons : ~2089 ; live-reload `/rev` : fin de fichier.
- Serveur : `gallery/server/main.mjs` (`serveLiveShell`, `ensureFreshShell`), `routes/editors.mjs` (`/rev` ~526).
- URL d'ouverture : `src-tauri/src/atelier.rs:28`.
- Contraintes projet : `CLAUDE.md` (design tokens ; toute modif galerie → reporter sur `src-tauri/gallery-dist/` + shell servi, lancer la diff suite ; relance de l'app = suivre `docs/PROTOCOLE_RELANCE.md` à la lettre ; ne jamais écrire dans le .app).

## 8. État git

Modifications non commitées dans le working tree du repo (branche `feat/generateur-images`) : template + gallery-dist + 2 shells du repo + `.claude/launch.json` (ajout d'un serveur statique de test `gallery-static`, port 8899). Le shell de manuscript_ch1 est hors repo.
