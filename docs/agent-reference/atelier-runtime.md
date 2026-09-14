# Atelier Studio — procédure actuelle de validation

Cette procédure s’applique aux changements qui touchent l’app, le runtime, le
build ou la galerie. Une modification limitée aux documents ou aux plans ne
demande ni rebuild ni relance; une vérification ciblée des liens ou de la syntaxe
reste permise.

## Autorisation avant arrêt

Une seule instance d’Atelier peut tourner à la fois. Avant tout arrêt, build ou
remplacement, vérifier si `tauri-app` est ouvert. Si oui, continuer seulement si
la session contient une autorisation explicite d’arrêter/reconstruire/relancer
l’instance. Sans cette autorisation, terminer les contrôles qui ne demandent pas
de relance et rapporter que la validation du bundle est en attente.

L’arrêt autorisé est global, mais ses cibles restent limitées à Atelier. Ne pas
tuer un processus Node, Rust ou Vite sur la seule base de son langage ou de son
nom partiel. Résoudre la commande complète et ne viser que `tauri-app`, les
binaires du bundle et les serveurs `gallery/server/main.mjs` d’Atelier.

## Repères stables

- Le bundle du worktree courant est
  `src-tauri/target/release/bundle/macos/Atelier.app`.
- Son processus principal s’appelle `tauri-app`.
- Le backend chat de production est le binaire Rust
  `Resources/rust-server/atelier-studio-server`.
- La source de la galerie est `gallery/`. `src-tauri/gallery-dist/` est régénéré
  par `scripts/stage-gallery.sh` et ne se modifie jamais directement.
- `npm run tauri:build:app` appelle le wrapper verrouillé du dépôt. Le
  `beforeBuildCommand` compile le frontend et stage galerie, mobile, serveur Rust
  et AppSnap; ne pas répéter systématiquement `tsc` puis `vite build` juste avant.
- Chaque worktree garde son propre `target/`.

## Contrôles proportionnés

`package.json` est la source de vérité des commandes. Exécuter les contrôles qui
couvrent la surface modifiée et le risque introduit, par exemple:

- frontend: `npm run typecheck`, `npm run test:frontend`;
- sidecar TypeScript: `npm run test:sidecar`;
- galerie: `npm run typecheck:gallery`, `npm run test:gallery`, puis
  `npm run verify:e2e` si le comportement navigateur est concerné;
- runtime Rust: le paquet ou test ciblé, puis `npm run test:rust` ou
  `npm run test:rust-workspace` selon la portée;
- protocole/mobile: `npm run test:protocol`, `npm run verify:mobile` selon la
  surface;
- changement transversal ou à haut risque: `npm run verify`.

Ne pas figer un nombre attendu de tests dans cette documentation. Une régression
ciblée doit couvrir le défaut corrigé lorsqu’elle apporte une preuve utile. Un
test ou build réussi ne prouve pas à lui seul que l’instance visible utilise le
nouveau bundle.

## Build et relance

Depuis le worktree qui contient les changements, exécuter le bloc avec Bash.
Si un ancien serveur Node provient d’un autre worktree, inspecter sa commande
complète et arrêter ce PID identifié avant le build; ne pas utiliser un motif
générique qui pourrait viser la galerie d’un autre produit.

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT" || exit 1
APP="$ROOT/src-tauri/target/release/bundle/macos/Atelier.app"
APP_BIN="$APP/Contents/MacOS/tauri-app"
BUILD_LOG="/tmp/tauri-build-$(basename "$ROOT")-$$.log"

# Précondition hors script: l’arrêt/relaunch d’une instance ouverte est autorisé.
# Une cible absente est normale; une cible trouvée mais impossible à arrêter est fatale.
stop_pattern() {
  PATTERN="$1"
  PIDS="$(pgrep -f "$PATTERN" 2>/dev/null || true)"
  [ -z "$PIDS" ] && return 0
  kill -9 $PIDS
  STOP_STATUS=$?
  if [ "$STOP_STATUS" -ne 0 ]; then
    echo "ÉCHEC — arrêt refusé pour: $PATTERN"
    exit "$STOP_STATUS"
  fi
  sleep 1
  if pgrep -f "$PATTERN" >/dev/null 2>&1; then
    echo "ÉCHEC — processus Atelier encore présent: $PATTERN"
    exit 1
  fi
}

APP_PIDS="$(pgrep -x tauri-app 2>/dev/null || true)"
if [ -n "$APP_PIDS" ]; then
  kill -9 $APP_PIDS
  STOP_STATUS=$?
  if [ "$STOP_STATUS" -ne 0 ]; then
    echo "ÉCHEC — arrêt de tauri-app refusé"
    exit "$STOP_STATUS"
  fi
  sleep 1
  if pgrep -x tauri-app >/dev/null 2>&1; then
    echo "ÉCHEC — tauri-app encore présent"
    exit 1
  fi
fi
stop_pattern '/Atelier\.app/Contents/Resources/rust-server/atelier-studio-server'
stop_pattern '/Atelier\.app/Contents/Resources/rust-server/atelier-gallery-server'
stop_pattern '/Atelier\.app/Contents/Resources/rust-server/atelier-remote-gateway'
# Ancien serveur Node du worktree courant uniquement; pas tout dossier "gallery".
GALLERY_PATTERN="$(python3 -c 'import re, sys; print(re.escape(sys.argv[1]) + r"/gallery/server/main\.mjs([[:space:]]|$)")' "$ROOT")" || exit 1
stop_pattern "$GALLERY_PATTERN"

npm run tauri:build:app >"$BUILD_LOG" 2>&1
BUILD_STATUS=$?
if [ "$BUILD_STATUS" -ne 0 ]; then
  tail -n 80 "$BUILD_LOG"
  echo "ÉCHEC — build .app (code $BUILD_STATUS)"
  exit "$BUILD_STATUS"
fi

if [ ! -x "$APP_BIN" ]; then
  echo "ÉCHEC — binaire absent dans $APP"
  exit 1
fi

open -n "$APP" || exit $?
sleep 4
APP_PID="$(pgrep -x tauri-app | head -1)"
if [ -z "$APP_PID" ]; then
  echo "ÉCHEC — tauri-app absent"
  exit 1
fi
RUNNING_CMD="$(ps -p "$APP_PID" -o command=)"
case "$RUNNING_CMD" in
  "$APP_BIN"*) echo "OK — $ROOT (pid $APP_PID)" ;;
  *) echo "ÉCHEC — mauvais worktree lancé: $RUNNING_CMD"; exit 1 ;;
esac
```

Le code de sortie du build est décisif. Une recherche textuelle de `error` dans
le journal peut aider au diagnostic, mais ne constitue pas un critère bloquant:
des messages légitimes peuvent contenir ce mot.

Après la relance, exercer dans ce bundle le comportement demandé. Si l’accès à
la surface réelle manque, distinguer explicitement: code inspecté, contrôles
passés, bundle construit, processus vérifié et comportement encore non validé.

## Worktrees, disque et releases

- Test avant fusion: exécuter depuis le worktree modifié.
- Validation canonique: fusionner d’abord dans `main`, puis répéter depuis le
  checkout principal.
- DMG de release seulement: `npm run tauri:build:dmg`, depuis le checkout
  principal sur `main`.
- Aperçu des targets inactifs: `npm run rust:targets:prune`.
- Suppression après lecture de l’aperçu seulement:
  `npm run rust:targets:prune -- --apply`.
- Ne jamais définir un `CARGO_TARGET_DIR` commun à plusieurs worktrees ni
  contourner `npm run tauri:build:app`.

## Diagnostic actuel du sidecar Rust

Cette section décrit le code actuel; elle n’est pas une preuve qu’un incident
particulier a été reproduit en direct.

1. Vérifier que le processus complet pointe dans
   `Atelier.app/Contents/Resources/rust-server/atelier-studio-server`.
2. Lire `~/Library/Application Support/atelier-studio/sidecar.lock` et comparer
   son identité au bundle lancé.
3. Tester `/health` avec le port et le jeton du lockfile sans afficher ni conserver
   le jeton.
4. Si le gateway distant est concerné, comparer aussi
   `remote/gateway.lock` au port et à l’identité du sidecar; `/remote/health` seul
   ne valide pas le routage protégé.

L’ancien diagnostic Node/TCC est conservé uniquement comme historique dans
[atelier-runtime-history.md](atelier-runtime-history.md).

## Invariant du bundle

Ne jamais faire `chmod`, `write` ou `mkdir` dans le bundle `.app` au chargement
d’un module sidecar. Les fichiers et bits nécessaires sont posés au build; le
runtime vérifie en lecture seule avant toute écriture dans un emplacement de
données autorisé.
