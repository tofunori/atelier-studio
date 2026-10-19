# Protocole de build et de relance d'Atelier Studio

**Seule procédure de build et de relance du dépôt.** `CLAUDE.md`, `AGENTS.md`
et le `README.md` y renvoient ; aucun autre fichier ne doit en garder une
copie. Pour installer l'app téléchargée (DMG), voir
[INSTALLATION.md](INSTALLATION.md).

À suivre exactement, sans improviser : un arrêt incomplet laisse des serveurs
orphelins qui servent l'ancien code et font croire qu'un correctif « ne marche
pas ».

## Quand l'appliquer

- **Changement qui touche l'app, le runtime, le build ou la galerie** : oui,
  avant de le déclarer terminé.
- **Documents ou plans seuls** : ni build ni relance. Les contrôles ciblés de
  liens, de syntaxe ou de structure restent permis.
- **Autorisation** : une seule instance d'Atelier tourne à la fois, et la
  relancer coupe celle de Thierry. Ne l'arrêter que si la session contient son
  accord explicite (« relance », « installe »…). Sans cet accord, faire les
  contrôles de l'étape 1 et dire que la validation dans l'app reste à faire.
- **Où** : sur un Mac seulement (`src-tauri` ne compile pas sous Linux). Une
  session d'agent dans le cloud fait les contrôles de l'étape 1 qui tournent
  sous Linux et laisse le build et la relance à une session sur le Mac.
- **`npm run tauri dev`** : Thierry seulement, depuis son propre terminal. Un
  agent ne le lance jamais : son harness le tue au bout de quelques minutes et
  laisse des orphelins sur le port 1420.

## Repères

- Le build produit `src-tauri/target/release/bundle/macos/Atelier.app`, mais
  l'app ne tourne plus depuis là : `scripts/relance-app.sh` en installe une
  **copie** dans `~/Applications/Atelier.app` et garde la build d'avant dans
  `~/Applications/Atelier-precedente/Atelier.app`. Chaque copie a sa fiche
  (`courante.txt`, `precedente.txt` dans ce dossier : worktree, commit,
  branche, modifications non commitées, date). Le build ne touche jamais la
  copie qui tourne : on construit pendant que Thierry travaille, et un build
  raté n'arrête rien.
- Le processus s'appelle **`tauri-app`**, pas « Atelier » : `pkill -x Atelier`
  ne trouve jamais rien.
- Le bundle lance ses serveurs Rust depuis `Contents/Resources/rust-server/` :
  `atelier-studio-server` (chat), `atelier-gallery-server` (un par projet
  ouvert) et `atelier-remote-gateway` (app iPhone). Le dépôt ne contient plus
  aucun runtime Node depuis le 2026-09-14 (plan 065, `docs/soak/033-COMPLETE.md`
  et `docs/soak/galerie-COMPLETE.md`). Les CLI d'agent (claude,
  codex…) d'un tour en cours sont lancés par le serveur de chat **dans leur
  propre groupe de processus** : ils survivent à l'arrêt du serveur, même par
  `kill -9`. Le script relève leurs groupes avant l'arrêt et les arrête aussi.
- Les serveurs écrivent leurs journaux dans `~/Library/Logs/Atelier/`
  (`studio-server.log`, `gallery-<port>.log`, 5 Mo par fichier, trois anciens
  gardés), y compris la trace d'un panic.
- **Réglages → Général**, groupe **Diagnostic et maintenance**, ligne
  **Sidecar** : la version y est suivie du commit et de la date de la build
  (« 2.0.0 · build 9bcdc0e du 2026-10-18 23:21 »). C'est la preuve, dans
  l'app, de la build qui tourne.
- `npm run tauri:build:app` passe par `scripts/build-tauri-app.sh` : un verrou
  par worktree, un `target/` par worktree, et la signature « Atelier Dev
  Signing » si ce certificat est dans le trousseau (ad hoc sinon, voir
  `scripts/tauri-signing-args.sh`). Son `beforeBuildCommand` compile le
  frontend (`tsc` puis `vite build`) et stage la galerie, les serveurs Rust et
  AppSnap.
- L'app construite fige tout au moment du build : **aucun changement n'est
  visible sans rebuild.**
- La galerie a une source, `gallery/`, et une copie dans le bundle,
  `src-tauri/gallery-dist/` (ignorée par git, effacée et recopiée par
  `scripts/stage-gallery.sh` à chaque build). On modifie toujours `gallery/`,
  jamais la copie.
- `package.json` est la source de vérité des commandes. Cette page ne fige
  aucun nombre de tests attendu.

## Protocole

### 1. Contrôles, avant d'arrêter quoi que ce soit

Lancés d'abord pour ne pas couper l'app de Thierry à cause d'une erreur de
compilation. Choisir ceux qui couvrent la surface modifiée :

| Surface modifiée | Contrôles |
|---|---|
| toujours | `npm run typecheck` |
| frontend React (`src/`) | `npm run test:frontend` |
| galerie (`gallery/`) | `npm run typecheck:gallery`, `npm run test:gallery` (unitaires, suite diff, contrat KB), puis `npm run verify:e2e` si le comportement dans le navigateur change |
| base de connaissances | `npm run test:kb:parity` |
| Rust (`rust/crates/`) | le test du crate concerné, puis `npm run test:rust-workspace` |
| Rust de l'app (`src-tauri/`) | `npm run test:rust` |
| protocole, passerelle (`atelier-remote`) | `npm run test:protocol`, `cargo test -p atelier-remote` (dans `rust/`) |
| app iPhone (`mobile-native/`) | job CI `mobile-native` ou, sur le Mac, `xcodegen generate` puis `xcodebuild test` (voir `mobile-native/README.md`) |
| scripts de relance ou de build | `bash -n` sur le script, `npm run test:relance` |
| changement transversal ou risqué | `npm run verify` |

Avant de toucher aux éditeurs de la galerie (diff, versions, rewrap,
commentaires), lire aussi [PIEGES_CONNUS.md](PIEGES_CONNUS.md).

### 2 à 4. Construire, arrêter, installer, relancer

Seulement avec l'accord explicite de Thierry. Depuis **Terminal** (ou une
session hors d'Atelier), dans le worktree qui contient les changements :

```bash
cd "$(git rev-parse --show-toplevel)" && bash scripts/relance-app.sh --confirme
```

Toujours par `bash` : le script marche donc pareil que le terminal soit zsh
ou bash (l'ancien bloc copié-collé plantait sous zsh dès que deux serveurs
galerie tournaient). `--confirme` dit que les éditeurs sont enregistrés et que
Thierry est d'accord ; sans lui, le script le demande dans un terminal et
refuse sinon. Dans l'ordre, il :

1. **refuse** hors macOS, ou s'il tourne dans Atelier (tour de chat, terminal
   intégré) : l'arrêt le couperait avant la relance ;
2. **construit** avec `npm run tauri:build:app` pendant que l'app tourne
   (journal dans `$TMPDIR`) ; build raté = code 4, rien n'est arrêté ;
3. copie la nouvelle build dans `~/Applications/Atelier-precedente/.nouvelle` ;
4. **vérifie qu'aucun tour de chat ne tourne** (`GET /activity` du serveur de
   chat, avec le port et le jeton du verrou) ; s'il y en a un, code 3 et rien
   n'est arrêté. Une build antérieure sans `/activity` donne « état inconnu » :
   vérifier dans l'app qu'aucun fil n'est « en cours » ;
5. **prévient pour les éditeurs**, sans pouvoir les vérifier : LaTeX, code,
   Markdown et notes ne signalent pas encore leurs modifications non
   enregistrées à l'app, donc l'avertissement est le même à chaque fois et
   c'est à Thierry de dire qu'ils sont enregistrés ; un tampon non enregistré
   est perdu à l'arrêt ;
6. **garde la build qui tourne** si rien n'est encore installé dans
   `~/Applications/Atelier.app` (premier passage) : l'app qui tourne depuis
   `/Applications/Atelier.app` (DMG) ou le `target/` d'un autre worktree est
   copiée comme courante, et devient la précédente à l'étape 9. Si l'app ne
   tourne pas et que rien n'est installé, le script dit qu'aucune précédente
   n'est gardée ;
7. **revérifie les tours** juste avant l'arrêt : la confirmation et la copie
   ont pu durer, et un tour a pu démarrer entre-temps (code 3, rien n'est
   arrêté) ;
8. **arrête** `tauri-app`, tous les processus de
   `Atelier.app/Contents/Resources/rust-server/` (chat, galeries, passerelle,
   outils), leurs descendants et les groupes de processus des CLI : SIGTERM,
   5 s de grâce, puis SIGKILL ; un survivant = code 1 avec sa liste ;
9. **installe** : la courante devient la précédente (l'ancienne précédente est
   supprimée), la nouvelle devient la courante ;
10. **relance** `~/Applications/Atelier.app` et vérifie que `tauri-app` tourne
    depuis ce bundle.

| Code | Sens |
|---|---|
| 0 | relancée depuis `~/Applications/Atelier.app` |
| 1 | arrêt incomplet, installation ou lancement raté (le message dit quoi faire) |
| 2 | refus : `--confirme` absent, hors macOS, lancé depuis Atelier, option inconnue |
| 3 | tour de chat en cours : rien n'est arrêté |
| 4 | build raté : rien n'est arrêté (voir le cas de transition ci-dessous) |

Le code de sortie du build fait foi. Chercher `error` dans le journal aide au
diagnostic mais ne bloque rien : des messages normaux contiennent ce mot.

**Transition (une seule fois).** Si l'app tourne encore depuis
`src-tauri/target/…/Atelier.app` de ce worktree, le build réécrirait le bundle
sous le processus vivant. Le script copie alors d'abord cette build qui
tourne, arrête, l'installe comme courante, puis construit. Si ce build rate,
il relance la copie sauvegardée et sort en 4 : Thierry retrouve son app.

`bash scripts/relance-app.sh --etat` montre sans rien arrêter les deux builds
installées, l'app lancée, les serveurs du bundle et le nombre de tours en
cours. Le script est testé sous Linux avec de faux processus par
`npm run test:relance`.

### Retour arrière

Si la nouvelle build régresse à l'usage, avec l'accord de Thierry :

```bash
bash scripts/relance-app.sh --retour --confirme
```

Mêmes contrôles (tours, éditeurs), même arrêt ; puis la précédente et la
courante s'échangent et la précédente est relancée. Un second `--retour`
revient à la build d'avant le retour. Rien n'est reconstruit.

### 5. Exercer le changement dans l'app

Après la relance, essayer dans ce bundle le comportement demandé. Si ce n'est
pas possible, dire précisément où la validation s'arrête : code relu, contrôles
passés, bundle construit, processus vérifié, comportement pas encore essayé. Un
build ou des tests verts ne prouvent pas que l'app visible utilise le nouveau
code.

## Quel worktree lancer ?

- **Test avant fusion** : depuis le worktree modifié.
- **Validation canonique** : fusionner d'abord dans `main`, puis refaire le
  protocole depuis le checkout principal.
- **Release (DMG)** : uniquement depuis le checkout principal sur `main`, voir
  plus bas.
- Un vieux worktree n'hérite pas des fichiers ajoutés depuis sur `main` : le
  mettre à jour (merge, rebase ou cherry-pick) avant de le construire.
- Deux builds du même worktree ne tournent jamais en même temps : le second
  s'arrête tout de suite. Des worktrees différents ont chacun leur verrou.
- Lancer le bundle d'un worktree sans l'installer (`open
  src-tauri/target/…/Atelier.app`) : seulement pour un essai ponctuel, l'app
  arrêtée ; le prochain `relance-app.sh` passera par le cas de transition.

## macOS 27

Avec le linker de macOS 27.0.1 (ld-27037), les proc-macros strippées et
compilées pour la cible 12.3 sont refusées au chargement (« mis-aligned
LINKEDIT string pool ») et le build s'arrête (constaté le 2026-10-08).
`scripts/build-tauri-app.sh` et `scripts/build-tauri-dmg.sh` exportent donc
`CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP=none` (build-scripts et
proc-macros seulement, les exécutables livrés restent strippés). Pour un
`cargo build --release` lancé à la main sur ce Mac :

```bash
export CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP=none
```

## Interdits

- Construire (app ou DMG) pendant que l'app tourne depuis le bundle
  `target/` de CE worktree : le staging réécrit le bundle sous le processus
  vivant, macOS invalide sa signature, et la galerie répond en erreur 500
  tandis que les processus enfants perdent l'accès à `~/Documents` (vécu le
  2026-07-18). `relance-app.sh` gère ce cas ; une app qui tourne depuis
  `~/Applications/Atelier.app` ne craint rien.
- Arrêter ou relancer Atelier à la main (`kill`, `pkill`, bloc copié-collé) :
  passer par `scripts/relance-app.sh`.
- Lancer `relance-app.sh` depuis un tour de chat ou le terminal intégré
  d'Atelier (il refuse) : l'arrêt le tuerait avant la relance.
- Modifier ou supprimer à la main `~/Applications/Atelier-precedente/` : c'est
  le retour arrière.
- `pkill -x Atelier` ou `pgrep -x Atelier` : mauvais nom, utiliser `tauri-app`.
- `open Atelier.app` sans avoir arrêté l'existant : cela réactive l'ancienne
  instance et ne relance rien.
- `npm run tauri dev` depuis un agent.
- Un DMG pour une relance ordinaire.
- Contourner `npm run tauri:build:app` par un build Tauri direct, ou partager
  un même `CARGO_TARGET_DIR` entre plusieurs worktrees.
- `npm run rust:targets:prune -- --apply` sans avoir lu l'aperçu.
- Modifier `src-tauri/gallery-dist/` à la main (écrasé au build suivant).
- Écrire (`chmod`, fichier, dossier) dans le bundle `.app` au démarrage d'un
  serveur : les fichiers et bits nécessaires se posent au build, le runtime
  vérifie en lecture seule.
- Conclure « le correctif ne marche pas » sans avoir vérifié qu'aucun ancien
  processus ne sert l'ancien code.

## Diagnostic

### Journaux

`~/Library/Logs/Atelier/studio-server.log` (chat) et `gallery-<port>.log`
(une galerie par projet) : démarrage, erreurs, trace d'un panic. Chaque
lancement par l'app y écrit d'abord une ligne `==== … ====`. Les serveurs y
écrivent directement : un journal continue même quand l'instance de l'app qui
les a lancés est fermée.

### « Je ne vois pas mon changement »

D'abord **Réglages → Général → Diagnostic et maintenance**, ligne
**Sidecar** : le commit et la date affichés doivent être ceux de la build
attendue (« inconnu » si git manquait au build). Puis :

```bash
bash scripts/relance-app.sh --etat   # builds installées, app et serveurs lancés
pgrep -fl atelier-gallery-server     # serveurs galerie encore vivants ?
ps -o lstart= -p <pid>               # démarré avant la relance = ancien processus
```

Preuve plus forte que la fiche : les noms de fichiers du frontend embarqué
dans la build installée doivent correspondre à ceux de `dist/`.

```bash
strings ~/Applications/Atelier.app/Contents/MacOS/tauri-app \
  | grep -oE "index-[A-Za-z0-9_-]{8}\.js" | sort -u > /tmp/embedded.txt
ls dist/assets | grep -E "^index-.*\.js$" | sort > /tmp/disk.txt
diff /tmp/embedded.txt /tmp/disk.txt && echo "EMBED==DIST"
```

S'ils diffèrent : `touch src-tauri/src/lib.rs`, puis reconstruire.

### Fenêtre « asset not found: index.html »

L'app démarre mais le frontend n'a pas été embarqué (cache de
`generate_context!`), donc aucun serveur n'est lancé : ne pas chercher du côté
du serveur de chat. Un binaire `tauri-app` nettement plus petit que d'habitude
le confirme. Correctif : `touch src-tauri/src/lib.rs src-tauri/src/main.rs
src-tauri/tauri.conf.json`, reconstruire, revérifier la taille avant de
relancer.

### Serveur de chat

1. Vérifier que la commande complète du processus pointe dans
   `Atelier.app/Contents/Resources/rust-server/atelier-studio-server`.
2. Lire `~/Library/Application Support/atelier-studio/sidecar.lock` et comparer
   son identité au bundle lancé.
3. Interroger `/health` avec le port et le jeton du lockfile (en-tête
   `x-atelier-token`), sans afficher ni conserver le jeton.
4. Si l'app iPhone est concernée, comparer aussi `remote/gateway.lock` au port
   du serveur de chat ; `/remote/health` seul ne prouve pas le routage.

### Premier lancement lent après un build

Signée ad hoc, l'app change d'identité à chaque build et macOS refait ses
vérifications (autorisations, Gatekeeper) au premier lancement ; le premier
démarrage du serveur peut donc être lent, et le mécanisme anti-boucle peut le
remplacer une fois. C'est normal si tout se stabilise en une trentaine de
secondes. Avec le certificat « Atelier Dev Signing », l'identité reste stable
et ces vérifications sont bien plus rares.

Les diagnostics de l'ancien serveur Node (retiré) sont gardés comme historique
dans [agent-reference/atelier-runtime-history.md](agent-reference/atelier-runtime-history.md).

## Espace disque

Chaque worktree garde son `target/`. `sccache` garde en plus un cache de
compilation commun, plafonné à 10 Gio ; la compilation incrémentale de Rust est
désactivée parce qu'elle empêche ce cache et remplissait plusieurs Gio par
worktree.

```bash
npm run rust:cache:status          # compteurs du cache
npm run rust:targets:prune         # aperçu des target/ inactifs depuis 14 jours
npm run rust:targets:prune -- --apply           # seulement après lecture de l'aperçu
npm run rust:targets:prune -- --days 30         # seuil plus prudent, aperçu d'abord
```

Le nettoyeur ne propose jamais le checkout principal, le worktree courant, un
worktree non enregistré par git ou un worktree où `cargo` tourne, et ne
supprime aucune source.

## DMG de release

Seulement pour une release explicitement demandée. L'app installée
(`~/Applications/Atelier.app`) peut tourner ; si elle tourne encore depuis
`src-tauri/target/…` du checkout principal, faire d'abord le protocole
(cas de transition). Puis :

```bash
ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd -P)"
[ "$ROOT" = "$MAIN_ROOT" ] && [ "$(git branch --show-current)" = "main" ] || {
  echo "Refus : le DMG se construit depuis le checkout principal sur main"
  exit 1
}
npm run tauri:build:dmg
```

Le DMG laisse dans `target/` un bundle signé ad hoc, sans toucher à la copie
installée ; le prochain protocole le reconstruit. En cas d'échec, le script
efface seulement les images temporaires
`src-tauri/target/release/bundle/macos/rw.*.dmg`. La release publique est
construite par `.github/workflows/release.yml` à partir d'un tag, avec ses
notes dans `docs/releases/<tag>.md`.
