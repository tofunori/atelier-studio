# Pièges connus — éditeurs galerie (diff, versions, rewrap, commentaires)

Leçons tirées d'échecs non triviaux résolus. **Avant de toucher à
`gallery/assets/diff_versions.js`, `latex_studio.html` ou `code_editor.html`,
lire cette page** — puis lancer `node gallery/server/tests/diff_suite.mjs`
(34 tests) qui verrouille tout ce qui suit. La suite est obligatoire au
protocole de relance dès que `gallery/` est touché.

Contexte : les éditeurs sont des pages web servies dans des **iframes WebView**
(WKWebView macOS) à l'intérieur de l'app Tauri. Plusieurs pièges viennent de là.

---

## 1. Le `localStorage` du WebView ne survit pas au redémarrage de l'app

Ce qui semblait être « je perds mes diffs au redémarrage » était en fait la
perte silencieuse du `localStorage` de l'iframe entre deux lancements.

**Règle** : toute donnée d'éditeur qui doit survivre au redémarrage se persiste
**côté serveur** (`GET/POST /versions` → `.fig_thumbs/dv_versions/<md5>.json`).
Le `localStorage` reste comme cache/fallback + migration, jamais comme source
de vérité.

## 2. `if(dirty) return` dans le poll de rechargement externe DÉTRUIT le travail de l'agent

Ancien poll : « si le buffer a des modifs non sauvegardées, ignorer le disque ».
Conséquence : quand un agent écrivait le fichier pendant que tu tapais, ses
modifs étaient invisibles, et ton `⌘S` suivant les **écrasait** après un « disk
conflict ».

**Règle** : buffer propre **ou dirty cosmétique** (même contenu que
`lastSavedText` aux blancs près — typiquement après rewrap auto) → recharger ;
buffer *dirty* réel → **fusion trois-voies**
`Diff.applyPatch(buffer, structuredPatch(base, disque), {fuzzFactor:2})` où
`base = lastSavedText`. Conflit superposé (`applyPatch` renvoie `false`) : NE PAS
avancer `diskMtime` (la garde de `save()` reste armée), avertir, ne rien écraser
**mais versionner quand même** l'écriture agent (`diffPush(base, diskText)`) pour
que la timeline grossisse. Après rewrap post-reload, **refiger** `lastSavedText`
sinon le dirty cosmétique rebloque le passage agent suivant. Vaut pour les DEUX
éditeurs.

### 2b. « tout · N » sans HEAD n'affichait que le dernier delta

Fichier non suivi par git → pas de pseudo-version HEAD. L'idx par défaut tombait
sur `VERSIONS.length - 1` → le mode « tout » ne montrait que la dernière
intervention, alors que le compteur annonçait N. **Règle** : `baseIndex()` =
HEAD si présent, sinon **idx 0** (première snapshot de session) pour un vrai
cumul.

## 3. La base des diffs = dernier commit SIGNIFICATIF, jamais HEAD nu

Un hook Stop global auto-committe les fichiers suivis à chaque fin de tour
d'agent (`~/.claude/hooks/auto-commit-stop.sh`, message écrit par Haiku, préfixe
`auto:` OBLIGATOIRE). Si la gouttière/`±`/Message IA prenaient HEAD comme base,
elle se vidait quelques minutes après chaque sauvegarde.

**Règle** : `gitBase(root)` = premier commit dont le sujet ne matche pas
`/^auto: /`. Utilisé par `/githead`, `/commitmsg`, `/gitcommit`. Ne jamais
retirer le préfixe `auto:` du hook sans ajuster ce filtre.

### 3b. La base SUIT le dépôt — mais l'ancre du journal, jamais (2026-08-23)

Symptôme : « je committe et le diff reste ». Deux causes cumulées.

D'abord la base de session était **gelée** (`baseGitLocked`) : un commit
significatif en cours de session rafraîchissait `headText` (donc la gouttière)
mais ni le `±` cumulatif ni le compteur du ruban — il fallait rouvrir le
fichier. Désormais `fetchHead` compare le **sha** : nouveau sha = vrai commit
(le filtre `auto:` garantit qu'un tour d'agent n'en produit pas), donc
`baseVersion`/`baseTs` avancent et les interventions désormais committées
quittent le cumul « tout » et le ruban (elles restent dans l'historique).
Trois garde-fous :
- l'avancée est **retenue** pendant un voyage dans le temps (`tt` ou
  `navMode >= 0`) et réglée au retour à « tout » — renuméroter les
  interventions sous les yeux déplacerait la vue affichée (cf. §8) ;
- l'ancre du journal **persisté** (`journalBase`) ne bouge JAMAIS : la base du
  state v2 est posée à l'`init` et le serveur ne la réécrit pas. La déplacer
  fait diverger `serverBaseHash` → « conflit de base » au prochain POST,
  persistance arrêtée, historique perdu au redémarrage ;
- une base explicite (`?base=…`, visionneuse de diff) n'est jamais rebasée.

Ensuite — et c'est ce qui bloquait vraiment — **un arbre propre ne veut pas
dire « rien à jalonner »**. Quand le hook Stop a déjà committé le travail en
`auto:`, `git commit -m … -- fichier` échoue alors que le fichier diffère
toujours de la base significative : `/gitcommit` doit retomber sur
`git commit --allow-empty -m …` pour poser le jalon. La route Node le faisait,
**la route Rust — celle que l'app exécute — non** : le bouton commit de
l'éditeur répondait « commit refusé : git commit ciblé a échoué » et la base
ne pouvait plus jamais avancer. Verrouillé côté Rust par
`gitcommit_places_a_milestone_when_auto_commits_left_a_clean_tree`
(`tests/http_smoke.rs`), côté Node par « gitcommit jalon sur arbre propre ».

**Leçon de parité** : un test vert dans `diff_suite.mjs` ne prouve RIEN sur le
comportement de l'app — l'étage A de cette suite interroge le serveur Node,
l'app tourne sur Rust. Toute route dupliquée se teste des DEUX côtés.

## 4. Basculer d'onglet interne (display:none) ne déclenche NI `visibilitychange` NI `IntersectionObserver`

Vérifié empiriquement dans le WebView : un iframe passant de `display:none` à
`block` ne reçoit aucun de ces deux signaux (l'IO reste à 0 même une fois
visible). `visibilitychange` ne concerne que le passage premier-plan de l'app
entière.

**Règle** : pour réagir à l'activation d'un onglet interne, c'est l'app qui
prévient l'iframe — `AtelierPane` poste `{type:"atelier-tab-activated"}` au
`contentWindow` de l'onglet actif (effet sur `activeTab`). Utilisé par le
forward-sync SyncTeX à l'ouverture de l'onglet PDF.

## 5. Le rewrap ne doit JAMAIS toucher un bloc contenant un `%`

Un rewrap qui fusionne mot à mot un bloc prose+commentaire fait atterrir le `%`
au milieu d'une ligne repliée → tout ce qui suit « fuit » comme commentaire puis
comme texte de document → `Missing \begin{document}` fatal, commentaires
éclatés, texte parasite dans le PDF.

**Règle** : `reflowable(block)` — un bloc 100 % commentaires est reformatable
(préfixe préservé) ; un bloc LaTeX contenant un `%` non échappé (`\%` neutralisé)
est INTOUCHABLE. Les lignes 100 % commande (`\documentclass`, `\begin{document}`,
`\section` seul) sont des frontières intangibles, jamais fusionnées dans la prose.
S'applique à `⌥Q`, `⇧⌥Q` et au rewrap auto de `⌘S`.

## 6. Les commentaires ancrés par position absolue meurent au `setValue`

`cm.setValue()` (rechargement agent, restauration de version) détruit **toutes**
les marques ; un `replaceRange` (rewrap) détruit celles à l'intérieur du bloc.
Ancrer par `{from,to}` fixes = commentaires perdus à chaque passage de Claude.

**Règle** : ré-ancrage **par contenu** (`texcFind`) — recherche exacte du passage
cité, puis normalisée aux blancs (survit aux retours à la ligne déplacés DANS le
passage), candidate la plus proche de l'ancienne position. Déclenché sur
`change` origin `setValue` (ré-ancrage complet) et sur frappe (sync depuis les
marques vivantes). Passage introuvable = orphelin gardé et retenté, jamais
supprimé en silence.

## 7. `⌥Q` produit « œ » sur clavier mac → les keymaps CodeMirror le ratent

Un raccourci Option+lettre est capté par la couche clavier avant CodeMirror.

**Règle** : brancher ces raccourcis sur `e.code` (touche physique, ex.
`KeyQ`/`ArrowDown`) au niveau `document`, pas via `cm.addKeyMap`. Idem `⌘A` que
le menu natif de l'app peut avaler avant l'éditeur.

## 8. Le sélecteur `±` ne doit jamais bouger sous les yeux de l'utilisateur

À chaque sauvegarde, `push()` déplaçait la sélection sur la version fraîchement
créée → diff minuscule/vide à chaque `⌘S`, et bascule de vue si la comparaison
était ouverte.

**Règle** : cible par défaut du `±` = la base (diff **cumulatif**, comme la
gouttière). Si la comparaison est ouverte, la sélection ne bouge JAMAIS ; les
`push` la rafraîchissent sur place. Les versions intermédiaires restent
accessibles via le panneau historique.

## 9. L'auto-commit balaie l'arbre avant un commit explicite

Le hook Stop peut committer tes changements de working-tree (`git add -u`) avant
que ton `git commit` manuel ne s'exécute → ton beau message se perd, le code
atterrit dans un `auto:`. Sans gravité (le code EST committé) mais surprenant.

**Règle** : après un commit qui « ne trouve rien à committer », vérifier
`git log` — le changement est probablement déjà dans le dernier `auto:`.

## 10. `setValue` plein document = ancre de souris projetée aux extrémités

Le rechargement agent remplaçait le document par UN changement `[0, length]`.
CM6 remappe toute position à travers chaque changement — y compris l'ancre du
**geste de souris en cours** (`basicMouseSelection.update` :
`start.pos = update.changes.mapPos(start.pos)`). Or `mapPos` projette toute
position intérieure d'un remplacement total vers une extrémité. Quand l'écriture
de l'agent tombait entre le `mousedown` et le `mouseup` d'un clic (fréquent :
l'agent stream plusieurs écritures pendant que l'utilisateur navigue), le clic
se terminait en sélection du point de clic jusqu'au début ou à la fin du
document — ou en défilement brutal vers cette extrémité. Sélections posées et
marques subissaient le même écrasement.

**Règle** : `setValue` ne remplace que la portion réellement modifiée (préfixe
et suffixe communs élagués, sans couper une paire UTF-16). Le remappage naturel
de CM6 fait alors le bon travail : ancre de souris, sélection, marques et
défilement hors zone restent exactement en place — ne PAS poser de sélection
explicite dans ce dispatch. Repli CM5 (`editor_factory.ts`) : remplacement
complet assumé, curseur replié à la tête.

**Vérification** : deux tests e2e (`rechargement agent…` dans
`editor_cm6.spec.js`), rejoués dans WebKit — moteur du WKWebView — via le
projet Playwright `webkit-selection`. Chromium seul ne suffit pas.

## 13. `style.display = ""` ne « remontre » pas un élément caché par une règle CSS

Le bouton Compiler de l'onglet PDF (2026-08-24) naissait `display:none` dans
`#compileBtn{}` puis se révélait par `compileBtn.style.display = ""`. Vider le
style inline ne fait que **rendre la main à la cascade** — la règle `none`
reprend, le bouton reste invisible. Relecture de code, contrat de suite et
`grep` étaient tous verts : seul le banc navigateur l'a vu (`locator resolved
to hidden`).

**Règle** : révéler un élément dont l'état caché vient d'une règle CSS se fait
par une valeur EXPLICITE (`inline-flex`, `block`…), jamais par `""`. Corollaire
plus général — un test de contrat qui grep le source peut **encoder le bug** ;
toute UI d'éditeur se déroule dans un vrai navigateur avant d'être déclarée
faite (même leçon que §12).

---

# Annexe sidecar (hors galerie)

## S1. Écrire dans le bundle .app à l'import d'un module sidecar = mort en boucle par TCC

Symptôme (diagnostic 018, résolu le 2026-07-09) : au premier lancement
post-build, app « Sidecar déconnecté » pour toujours ; les sidecars vivent
~4 s puis meurent, jamais de `sidecar.pid` ni de `sidecar.lock`.

Cause : `terminal.mjs` réparait le bit exécutable du `spawn-helper` node-pty
par un `chmodSync` **au chargement du module** — donc à l'intérieur du bundle
`.app` en prod. macOS 26 déclenche alors une consultation TCC « App
Management » (modification du contenu d'une app) qui **bloque l'appel sync
plusieurs secondes**, au-delà du budget startup Rust (4 s,
`read_startup_line`) → child tué → respawn → nouvelle consultation → boucle.
L'app étant signée adhoc, chaque rebuild = nouvelle identité TCC : le piège
frappe à CHAQUE premier lancement post-build.

Ce qui a rendu le diagnostic difficile : le blocage est **invisible hors
contexte app** — `node index.mjs` lancé d'un terminal démarre en ~1 s, quels
que soient cwd et env. Seul un process du bundle lancé par l'app est soumis à
la consultation. Preuve obtenue par `sample <pid>` du sidecar gelé
(`node::fs::Chmod` bloqué sur le main thread) puis hot-patch du bundle →
convergence immédiate.

**Règles** :
- jamais de `chmodSync`/`writeFileSync`/`mkdirSync` vers l'intérieur du
  bundle au chargement d'un module sidecar ; les bits/fichiers se posent au
  build (`stage-sidecar.sh`) ;
- si une réparation runtime est vraiment nécessaire : vérifier d'abord en
  lecture seule (`accessSync(p, X_OK)`) et n'écrire que si ça manque
  (cas dev, hors bundle → pas de TCC) ;
- tout fs synchrone au chargement ou dans un handler doit être court et
  local : un appel bloqué gèle l'event loop ET le health → le sidecar passe
  pour mort et se fait remplacer ;
- valider un changement sidecar **avec l'app buildée** (protocole de
  relance), pas seulement en lançant `index.mjs` à la main.

## S2. Un message « nu » (sans permissionMode) rétrograde le thread Codex en read-only pour toute la session

Symptôme (diagnostic du 2026-07-10) : le composer affiche « Full access »,
mais l'agent Codex répond « cette session est en lecture seule … je ne peux
pas demander d'autorisation d'écriture ». Le rollout codex montre le tour 1
en `danger-full-access` puis tous les suivants en `read-only`.

Cause : certains envois du frontend sont « nus » — sans `model`, `effort` ni
`permissionMode` : renvoi après rewind/édition (`reverted`, App.tsx),
renvoi de secours après erreur, tour de correction auto-review. Côté sidecar,
`resolveCodexSafety(undefined)` tombe (volontairement, plan 025) sur le repli
sûr `read-only/on-request` (+ `__permission-fallback` dans le ledger), et le
`thread/resume` ré-applique ce sandbox à TOUT le thread app-server ; comme
`turn/start` ne porte pas de sandbox, la démotion colle aux tours suivants.
Même piège via `goalRequest`/`compactThread`, qui reprennent un thread pas
encore chargé avec `sandbox: "read-only"` explicite (goal ACTIVE + app-server
relancé = démotion silencieuse).

**Règles** :
- le router mémorise la dernière sélection composer par thread
  (`lastTurn` dans le store) et les envois nus la réutilisent —
  `startProviderTurn` (router.mjs) ; model/effort ne se reprennent que sous
  le MÊME provider (jamais un id Claude chez Codex après handoff) ;
- `goalRequest`/`compactThread` reprennent avec le `permissionMode` réel du
  thread quand il est connu ; `read-only` reste le défaut sûr sinon ;
- tout NOUVEAU chemin d'envoi frontend doit porter la sélection complète, ou
  assumer explicitement le repli ; le marqueur `__permission-fallback` dans
  le ledger signale qu'un tour est parti sans mode connu ;
- diagnostic rapide : `grep __permission-fallback` dans le ledger du projet
  (`~/Library/Application Support/atelier-studio/ledger/`), et
  `turn_context.sandbox_policy` dans le rollout `~/.codex/sessions/…`.

## S3. La passerelle iPhone fige son amont à sa naissance — un sidecar remplacé la laisse sur un port mort

Symptôme (2026-09-11) : l'iPhone affiche « Atelier est déconnecté » (ou ne
charge rien) alors que `/remote/health` répond 200 — même via l'URL exacte du
téléphone (`https://<machine>.<tailnet>.ts.net:8443`, relayée par Tailscale
serve) — et que l'appareil reste récent dans `remote/devices.json`. Le chat
macOS, lui, fonctionne normalement.

Cause : `atelier-remote-gateway` reçoit son amont à la naissance
(`ATELIER_SIDECAR_BASE=http://127.0.0.1:<port>`, posé par
`remote_gateway::ensure()`) et ne le relit jamais. Si le sidecar a été
remplacé (nouveau port, nouveau jeton) sans que la passerelle le soit, toutes
les routes proxifiées (`/remote/v1/*`) partent vers un port mort → 502
`offline` « Atelier est déconnecté ». Deux leurres : `/remote/health` ne
teste que la passerelle (jamais l'amont), et l'auth d'un appareil met à jour
`lastSeenAt` avant que le proxy échoue — « appareil récent » ≠ « chat
joignable ».

Diagnostic (30 s) :

```bash
APP="$HOME/Library/Application Support/atelier-studio"
cat "$APP/remote/gateway.lock"                     # pid, bind, sidecarPort, sidecarTokenHash
python3 -c "import json;print(json.load(open('$APP/sidecar.lock'))['port'])"
lsof -nP -iTCP:18765 -sTCP:LISTEN                  # pid attendu = celui du verrou
tail -3 "$APP/remote/gateway.log"                  # ligne « … listening addr=… »
```

`sidecarPort` du verrou ≠ port courant de `sidecar.lock` ⇒ passerelle
périmée.

Réparation : relancer l'app (protocole de relance) ; au boot `ensure()`
compare `gateway.lock` au sidecar courant, tue l'ancienne passerelle et en
relance une. Le sidecar survit (réadopté via `sidecar.lock`) et l'appairage
iPhone aussi (le store est `remote/devices.json`, pas le process).

**Règles** :
- après toute relance d'app ou tout respawn de sidecar, recouper
  `sidecarPort` de `gateway.lock` avec le port de `sidecar.lock` : c'est
  l'identité de session de la passerelle ;
- les erreurs de ce chemin (`[atelier] gateway iPhone non disponible: …`)
  sortent sur le stderr de l'app, donc vers /dev/null quand elle est lancée
  par `open` : relancer avec `open -n --stderr /tmp/atelier-app.log "$APP"`
  pour les lire ;
- un `RUST_LOG=warn` dans l'environnement du lanceur prive `gateway.log` de
  sa ligne `listening` — absence de log ≠ absence de démarrage ;
- vérifier la chaîne sans iPhone : `pair` puis `revoke <id>` via
  `remote/pair.sock`, et `GET /remote/v1/threads` sur l'URL Tailscale (200
  attendu, quelques centaines de fils) ;
- cas encore inexpliqué (2026-09-11) : deux boots (21:57, 22:56) n'ont pas
  remplacé une passerelle périmée, faute de trace conservée. Si ça se
  reproduit, capturer le stderr comme ci-dessus avant de conclure.

## 12. cm6 rend le diff NATIVEMENT — la boucle de marques d'applyRender est du code mort sous cm6

Symptôme (2026-08-17) : fonctionnalité branchée sur les marques du diff
(publication vers la vue Lecture) parfaitement câblée, testée par lecture de
code, bundles vérifiés à l'octet — et rien à l'écran, alors que l'éditeur
affiche de belles marques.

Cause : sous le moteur cm6, `render()` fait `cm.showMergeDiff(...)` puis
`return` AVANT la boucle dAddM/dDelW. Tout ce qui est accroché à cette boucle
(publication `onMarks`, widgets, compteurs) ne tourne que sous l'ancien moteur.
Les marques visibles viennent de l'extension merge native, pas de la boucle.

**Règles** :
- Toute consommation des changements du diff passe par `computeSrcMarks()`
  (sémantique de la boucle sans CodeMirror) + `publishMarks()`, alimentés par
  la distribution async qui tourne DANS LES DEUX chemins (flag `nativeShown`).
- Avant d'accrocher quoi que ce soit à applyRender, vérifier quel moteur
  exécute quoi : `grep hasNativeMergeDiff`.
- Vérifier une feature d'éditeur = la DÉROULER dans le navigateur (serveur
  galerie jetable sur un dépôt git de scratch + `__dv.push` pour fabriquer une
  intervention), pas seulement relire le code : ici trois « fix » plausibles
  ont été livrés avant que l'instrumentation ne montre le vrai chemin.
- Le serveur galerie sert `.fig_thumbs` depuis un cache provisionné AU BOOT et
  le navigateur cache par origine : instrumenter = redémarrer le serveur ET
  changer de port.

## 14. Extraire un bloc CSS vers un chunk lazy exige de greper tous les consommateurs non-lazy

Symptôme (revue finale lot 2, 2026-08-28) : le bloc `.settings-page.narrow`,
`.set-nav-compact`, `.set-headline-actions`, `.set-notice` (focus-visible
compris) déplacé d'`App.css` vers `src/styles/settings-sheet.css`, chargé
seulement quand `SettingsSheet` (lazy) est monté — sélecteurs vérifiés
uniques dans `App.css` avant le déplacement, aucune règle écrasée plus bas.
Et pourtant `SetBench.tsx` (banc de captures de la page Réglages, monté hors
`SettingsSheet`) régressait sur le golden `settings-setup-1280-dark` :
`.set-headline-actions` retombait à `display:inline`.

Cause : vérifier l'unicité des sélecteurs dans `App.css` ne dit rien sur QUI
importe ces règles. `SetBench` rend `SettingsPage` directement et n'importait
que `tokens.css`/`primitives.css`/`App.css` — jamais le chunk lazy, donc
jamais le CSS extrait.

**Règles** :
- Avant tout déplacement de bloc CSS vers un chunk lazy, `grep -rl` le nom du
  composant stylé (ici `SettingsPage`) pour lister TOUS ses points de montage,
  bancs de test compris — pas seulement chercher où les sélecteurs
  apparaissent dans le CSS.
- Un banc n'a pas de budget de boot à préserver : il peut importer le chunk
  extrait directement en tête de fichier, sans lazy-loading.
- Faire tourner les goldens visuels concernés (`npx playwright test -c
  tests/visual -g "<nom>"`) après tout déplacement de CSS, même quand le
  diff semble purement organisationnel.

## 15. Sélection CM6 = sélection NATIVE ; tout ce qui recalcule par tick de drag se paie en saccades

Symptôme (2026-09-06) : sélection à la souris et frappe « pas parfaitement
fluides » dans l'éditeur LaTeX (moteur cm6, wrap actif), surtout sur un
document long. Banc `gallery/scripts/bench_editor.mjs` (WebKit, moteur du
WKWebView) : 10,8 ms par pas de drag, 15,8 ms par caractère frappé.

Causes, toutes dans le code Atelier, aucune dans CM6 lui-même :
- La sélection visible était une `Decoration.mark` (`cm-clsel`) recalculée à
  CHAQUE transaction de sélection, pendant que la couche `drawSelection` de
  CM6 et la `::selection` native étaient rendues transparentes à coups de
  `!important`. Une mark redécoupe les spans de chaque ligne touchée, par-dessus
  les spans de coloration — c'est le cas le plus cher des trois.
- `ghost_ai.mjs` dispatchait `setGhost(null)` à chaque mouvement de curseur,
  même sans changement : deux cycles de vue par tick. Et `tokens()` retokenisait
  le document entier à chaque frappe.
- `highlightSelectionMatches` officiel rescanne le viewport à chaque tick, sans
  temporisation.
- `hangingIndent` posait des styles inline par ligne sur `geometryChanged`, que
  le wrap déclenche lui-même → reflow en boucle.
- La pile CM5 entière (CSS + addons) restait chargée dans la page alors que
  seul cm6 s'instancie : d'où la guerre de `!important`.

**Règles** :
- La sélection visible est la sélection native du navigateur, stylée par
  `::selection` dans le thème (`SELECTION_RENDERING` dans
  `cm6/studio_editor.mjs`). Ni `drawSelection()`, ni mark par transaction.
  Verrouillé par `studio_editor_contract.test.mjs`.
- Rien de coûteux sur `selectionSet` : ce qui doit suivre la sélection (bridge
  `/selinfo`, surlignage des occurrences, synctex) attend le REPOS (≥ 150 ms).
- Dans un `updateListener`, ne dispatcher que si l'état visible change vraiment
  (comparer avant/après) — un dispatch « vide » est un cycle de vue complet.
- Toute scan plein document (`doc.toString()` + regex) se mémoïse par instance
  de `state.doc` (Text immuable) ou par fenêtre de fraîcheur.
- Un `ViewPlugin` qui pose des styles inline ne réagit jamais à
  `geometryChanged` nu : comparer la mesure qui l'intéresse (chasse, hauteur).
- Après toute modification du chemin sélection/frappe : `node
  gallery/scripts/bench_editor.mjs` avant/après (référence post-correctif :
  ≈ 2 ms/pas de drag, ≈ 3,7 ms/caractère en WebKit).

## 16. `@overleaf/lezer-latex` : ESM sans extensions — importable seulement à travers esbuild

Symptôme (2026-09-06) : après le passage de `.tex` au parseur LR d'Overleaf,
`studio_editor_contract.test.mjs` cassait au chargement : Node ne résout pas
`import "./latex"` (sans `.js`) dans `node_modules/@overleaf/lezer-latex/dist/`.
Tout module qui importe `studio_editor.mjs` directement sous Node meurt de la
même façon ; les bundles, eux, passent (esbuild résout sans extension).

**Règles** :
- Les helpers purs dont les tests Node ont besoin (`languageKindFor`,
  `countColumn`…) vivent dans `cm6/studio_compat.mjs`, sans dépendance
  lourde ; `studio_editor.mjs` les réexporte. Les tests importent le compat.
- Pour sonder le parseur côté Node (types de nœuds, arbre d'un extrait) :
  fichier temporaire DANS `gallery/assets/cm6/latex_lang/` (résolution
  `node_modules` de la galerie), `npx esbuild … --bundle --platform=node`,
  puis exécuter le bundle. Ne pas laisser le fichier temporaire.
- Le paquet est sous AGPL-3.0 (grammaire de production d'Overleaf). Le câblage
  CM6 (styleTags, pliage, plan, diagnostics) est à nous, dans
  `latex_lang/index.mjs` ; `.bib` reste sur le mode flux `stex`.
- La grammaire ne connaît pas tout TeX : les diagnostics de structure sont des
  AVERTISSEMENTS ancrés sur l'ouverture orpheline ; les erreurs de compilation
  (`! … l.N`) sont les seules « erreurs », posées via `cm.setDiagnostics` dans
  un champ dédié que le linter relit (sinon la première frappe les effaçait).

## 17. Recharger ou reconfigurer l'éditeur pendant une sélection : la hauteur réestimée perd la position, l'ancre de texte la garde

Symptôme (2026-09-11) : après une écriture d'agent sur le `.tex`, un clic-glisser
court se terminait en sélection de la ligne 480 jusqu'à la fin du document, et la
vue partait en tête (mesuré : `scrollTop` 5850 → 19). Rien ne se produisait tant
que le fichier n'était pas modifié à l'extérieur.

Cause : deux mécanismes distincts, à ne pas confondre.
1. L'ouverture AUTOMATIQUE de la vue Diff (écriture externe) passait par
   `gotoChange(…, true)`, donc `scrollIntoView` sur le premier bloc modifié —
   ici la ligne 20, c'est-à-dire la tête. La revue doit s'ouvrir SANS naviguer ;
   `gotoChange` reste réservé à l'ouverture demandée par l'utilisateur (`Diff`,
   `‹ n/N ›`).
2. CM6 RÉESTIME la hauteur du document quand on remplace le buffer ou qu'on
   reconfigure la vue (chunks repliés/insérés). Mesuré sur un `.tex` de 700
   lignes : `scrollHeight` 7709 px → 4069 px, soit un plafond de `scrollTop` à
   3395 px. Une position profonde en pixels ne désigne alors plus la même ligne,
   et toute restauration par `scrollTop` est BORNÉE — même rejouée plus tard
   (5850 → 3430).

**Règles** :
- Restaurer une ANCRE DE TEXTE, pas des pixels : `view.scrollSnapshot()` avant
  la reconfiguration, puis `view.dispatch({effects: snapshot})` après DEUX
  frames (la hauteur réestimée n'est connue qu'après le cycle de mesure) —
  façade `reconfigurePreservingViewport` de `cm6/studio_editor.mjs`. La
  fermeture de la revue avait déjà ce réflexe, l'ouverture non.
- Différer TOUTE reconfiguration tant qu'un geste de sélection est en cours
  (`pointerdown` → `pointerup`, plus `pointercancel`) : remplacer le buffer ET
  ouvrir la vue Diff reconstruisent le DOM sous le pointeur, ce qui détache
  l'ancre native du glisser et fait terminer la sélection à une extrémité.
  `deferWhileSelecting` met le travail en file et l'exécute au relâchement ; le
  buffer passe AVANT la revue, qui doit comparer le texte à jour.
- Un test qui verrouille la position interroge l'ancre via
  `cm.getViewportAnchor()`, jamais `getScrollInfo().top` : dans cet éditeur le
  pixel n'est pas stable, la ligne l'est.

**Vérification** : `editor_cm6_scroll.spec.js` (rechargement pendant un glisser,
écriture pendant que la revue est ouverte, fusion distante) en WebKit **et**
Chromium ; `rechargement agent…` et `latex individual review automatically
opens…` (`editor_cm6.spec.js`) verrouillent l'ouverture automatique sans
recentrage. Suite galerie complète : 101 passés, et les 5 échecs restants
(`diff.spec.js` 434 / 800 / 830, `core.spec.js` 808) échouent à l'identique
avant le correctif — recoupé sur `HEAD~1`.

## pdf.js ≥ 4 et le WebKit système (vécu 2026-09-06)
- **`getTextContent()` de pdf.js 6 itère un `ReadableStream` avec `for await`** ; le WebKit livré avec macOS (Safari/WKWebView `Version/26.6`) n'a pas `ReadableStream.prototype[Symbol.asyncIterator]` → `TypeError` avalé par le pipeline, **aucune couche texte, aucune sélection dans l'app**, alors que Playwright WebKit (trunk) passe. La variante `legacy` de pdf.js a le même `for await`. Correctif : `gallery/assets/pdfjs_compat.js` (polyfill `values()`/`[Symbol.asyncIterator]`) chargé AVANT le shim module dans `pdf_viewer.html` et `latex_studio.html` (contrat : `pdfjs_compat.test.mjs`). Toute nouvelle page qui charge pdf.js doit l'inclure. Leçon : un test WebKit Playwright ne prouve pas le WebKit système — bissecter avec Safari (`open -a Safari`) et une page de diagnostic qui POSTe sur `/selinfo`.

## Mode lecture PDF (plan 078)
- Les offsets de sélection et d'ancrage se calculent sur `readingText(block)` — la jointure DÉ-CÉSURÉE des lignes, égale à `block.text` produit par `join_lines` en Rust — via `lineOffsets(block)`, jamais sur une jointure naïve par espaces : le DOM affiche `readingText`. Changer la règle d'un côté sans l'autre décale tous les surlignages ; le test de parité `readingText(b) === b.text` la verrouille.
- Un trait d'union absorbé reste PEINT sur la page : la ligne a une longueur affichée (sans le `-`) et une longueur peinte (avec). `selectionToAnnotation` interpole les x sur la longueur peinte, sinon le rect s'arrête un caractère trop tôt.
- `pdftohtml -xml` : ordre du flux = ordre de lecture sur les PDF LaTeX ; le regroupement retrie par colonne puis y. Un PDF où l'ordre est faux se corrige dans `group_blocks`, pas dans le JS.
- `pdftohtml` doit être spawné avec `-zoom 1` et sans `-i` (zoom 1,5 par défaut fausse toutes les bbox ; `-i` supprime les `<image>`).
- Le cache `/reflow` est invalidé par `REFLOW_VERSION` : l'incrémenter à tout changement d'heuristique, sinon les anciens JSON restent servis.
- Cmd+/− en mode lecture changent la taille du texte (écouteur en capture) ; en vue pages ils zooment.
- Ordre de lecture : une ligne qui TRAVERSE la gouttière est colonne 0, et tout ce qui flotte au-dessus du haut réel de la colonne 1 (`col1_top` = plus petit `top` parmi ses lignes alignées sur son bord gauche modal) aussi. C'est ce qui met titre et auteurs avant le corps ; une manchette dont les auteurs sont alignés sur le bord gauche de la colonne 1 resterait mal ordonnée.
- Titres de section : repérés par la TAILLE (> 1,15 × corps) ou par la GRAISSE à la taille du corps. La liste de familles grasses (`BOLD`, `-B`, `CMBX`, `HEAVY`, `SEMIBOLD`, `MEDI`) est empirique — un article dont la graisse porte un autre nom ne rendra aucun titre ; c'est le premier endroit à regarder si le mode lecture affiche un mur de paragraphes.
- Fragments orphelins supprimés : bloc de ≤ 3 caractères, plus petit que le corps et large de moins de 25 pt (indices, marqueurs d'affiliation), et fragment de math EN LIGNE de moins de 25 pt (sans quoi il devenait une découpe bitmap de 5 pt de large). Une équation isolée, elle, reste `math`.
- Limites assumées : les cellules d'un TABLEAU non détecté restent des paragraphes d'un ou deux mots (84 sur un article Copernicus de 19 pages) ; `area` et `note` ne sont ni créables ni affichées dans la colonne (elles n'ont qu'une géométrie de page) ; `#readBtn` n'est PAS désactivé quand `pdftohtml` manque — le bouton reste cliquable et la colonne affiche l'erreur 502.
- La recherche en mode lecture a le BLOC pour granularité (la colonne n'a pas de spans de mots comme la couche texte des pages) : le compteur « n/m » compte des blocs, pas des occurrences, et le repère est un filet en marge — pas un aplat sur tout le paragraphe.
- Une sélection à cheval sur deux pages garde la citation complète mais ses rects ne couvrent que la première page.
