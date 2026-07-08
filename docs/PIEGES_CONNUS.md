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

**Règle** : buffer propre → recharger ; buffer *dirty* → **fusion trois-voies**
`Diff.applyPatch(buffer, structuredPatch(base, disque), {fuzzFactor:2})` où
`base = lastSavedText`. Conflit superposé (`applyPatch` renvoie `false`) : NE PAS
avancer `diskMtime` (la garde de `save()` reste armée), avertir, ne rien écraser.
Vaut pour les DEUX éditeurs.

## 3. La base des diffs = dernier commit SIGNIFICATIF, jamais HEAD nu

Un hook Stop global auto-committe les fichiers suivis à chaque fin de tour
d'agent (`~/.claude/hooks/auto-commit-stop.sh`, message écrit par Haiku, préfixe
`auto:` OBLIGATOIRE). Si la gouttière/`±`/Message IA prenaient HEAD comme base,
elle se vidait quelques minutes après chaque sauvegarde.

**Règle** : `gitBase(root)` = premier commit dont le sujet ne matche pas
`/^auto: /`. Utilisé par `/githead`, `/commitmsg`, `/gitcommit`. Ne jamais
retirer le préfixe `auto:` du hook sans ajuster ce filtre.

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
