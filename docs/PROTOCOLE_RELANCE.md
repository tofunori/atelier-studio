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

- L'app construite est `src-tauri/target/release/bundle/macos/Atelier.app`.
  Son processus s'appelle **`tauri-app`**, pas « Atelier » : `pkill -x Atelier`
  ne trouve jamais rien.
- Le bundle lance ses serveurs Rust depuis `Contents/Resources/rust-server/` :
  `atelier-studio-server` (chat), `atelier-gallery-server` (un par projet
  ouvert) et `atelier-remote-gateway` (app iPhone). Le dépôt ne contient plus
  aucun runtime Node depuis le 2026-09-14 (plan 065, `docs/soak/033-COMPLETE.md`
  et `docs/soak/galerie-COMPLETE.md`).
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

## Protocole (copier-coller)

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
| changement transversal ou risqué | `npm run verify` |

Avant de toucher aux éditeurs de la galerie (diff, versions, rewrap,
commentaires), lire aussi [PIEGES_CONNUS.md](PIEGES_CONNUS.md).

### 2 à 4. Arrêter, construire, relancer

À exécuter avec Bash depuis le worktree qui contient les changements. Le script
détecte sa racine git, construit et ouvre le `Atelier.app` de CE worktree.
L'arrêt reste global (une seule instance possible) mais ne vise que les
processus d'Atelier : jamais un processus Node, Rust ou Vite choisi sur son
seul nom.

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT" || exit 1
APP="$ROOT/src-tauri/target/release/bundle/macos/Atelier.app"
APP_BIN="$APP/Contents/MacOS/tauri-app"
BUILD_LOG="/tmp/tauri-build-$(basename "$ROOT")-$$.log"
echo "Worktree : $ROOT"

# 2. ARRÊTER tout Atelier (app + serveurs de n'importe quel Atelier.app).
# Une cible absente est normale ; une cible qui survit est fatale.
stop_pids() {
  LABEL="$1"; PIDS="$2"
  [ -z "$PIDS" ] && return 0
  kill -9 $PIDS || { echo "ÉCHEC — arrêt refusé : $LABEL"; exit 1; }
}
stop_pids tauri-app "$(pgrep -x tauri-app 2>/dev/null || true)"
for BIN in atelier-studio-server atelier-gallery-server atelier-remote-gateway; do
  stop_pids "$BIN" "$(pgrep -f "/Atelier\.app/Contents/Resources/rust-server/$BIN" 2>/dev/null || true)"
done
sleep 1
if pgrep -x tauri-app >/dev/null 2>&1 \
  || pgrep -f '/Atelier\.app/Contents/Resources/rust-server/' >/dev/null 2>&1; then
  echo "ÉCHEC — un processus Atelier survit"; exit 1
fi

# 3. CONSTRUIRE le .app (aucun DMG ici). Le code de sortie décide.
npm run tauri:build:app >"$BUILD_LOG" 2>&1
BUILD_STATUS=$?
if [ "$BUILD_STATUS" -ne 0 ]; then
  tail -n 80 "$BUILD_LOG"
  echo "ÉCHEC — build .app (code $BUILD_STATUS), journal : $BUILD_LOG"
  exit "$BUILD_STATUS"
fi
test -x "$APP_BIN" || { echo "ÉCHEC — binaire absent dans $APP"; exit 1; }

# 4. RELANCER puis vérifier que c'est bien CE bundle qui tourne.
open -n "$APP" || exit $?
sleep 4
APP_PID="$(pgrep -x tauri-app | head -1)"
[ -n "$APP_PID" ] || { echo "ÉCHEC — tauri-app absent"; exit 1; }
RUNNING_CMD="$(ps -p "$APP_PID" -o command=)"
case "$RUNNING_CMD" in
  "$APP_BIN"*) echo "OK — $ROOT (pid $APP_PID)" ;;
  *) echo "ÉCHEC — mauvais worktree lancé : $RUNNING_CMD"; exit 1 ;;
esac
```

Le code de sortie du build fait foi. Chercher `error` dans le journal aide au
diagnostic mais ne bloque rien : des messages normaux contiennent ce mot.

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

## Interdits

- Construire (app ou DMG) pendant que l'app de CE worktree tourne : le staging
  réécrit le bundle sous le processus vivant, macOS invalide sa signature, et
  la galerie répond en erreur 500 tandis que les processus enfants perdent
  l'accès à `~/Documents` (vécu le 2026-07-18). Toujours arrêter d'abord.
- `pkill -x Atelier` ou `pgrep -x Atelier` : mauvais nom, utiliser `tauri-app`.
- `open Atelier.app` sans avoir arrêté l'existant : cela réactive l'ancienne
  instance et ne relance rien.
- Construire sans avoir arrêté les serveurs galerie : ils serviraient l'ancien
  code.
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

### « Je ne vois pas mon changement »

```bash
ls -la src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app  # binaire récent ?
pgrep -fl atelier-gallery-server     # serveurs galerie encore vivants ?
ps -o lstart= -p <pid>               # démarré avant le build = ancien processus, à arrêter
```

Preuve plus forte que la taille du binaire : les noms de fichiers du frontend
embarqué doivent correspondre à ceux de `dist/`.

```bash
strings src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app \
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

Seulement pour une release explicitement demandée. Arrêter d'abord l'app
(étape 2), puis :

```bash
ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd -P)"
[ "$ROOT" = "$MAIN_ROOT" ] && [ "$(git branch --show-current)" = "main" ] || {
  echo "Refus : le DMG se construit depuis le checkout principal sur main"
  exit 1
}
npm run tauri:build:dmg
```

Le DMG laisse un bundle signé ad hoc sur le disque : refaire ensuite le
protocole complet pour retrouver une app utilisable. En cas d'échec, le script
efface seulement les images temporaires
`src-tauri/target/release/bundle/macos/rw.*.dmg`. La release publique est
construite par `.github/workflows/release.yml` à partir d'un tag, avec ses
notes dans `docs/releases/<tag>.md`.
