# Protocole de relance d'Atelier Studio (agents : Codex, Claude, forks)

**À suivre EXACTEMENT avant de valider toute modification qui touche l'app, le
runtime, le build ou la galerie. Aucune improvisation.**
Une modification limitée aux documents/plans ne nécessite pas de rebuild.
Le non-respect crée des zombies (serveurs galerie/sidecar orphelins) qui servent
du vieux code et font croire que le fix « ne marche pas ».

## Ce qu'il faut savoir (2 min)

- L'app buildée = `src-tauri/target/release/bundle/macos/Atelier.app`.
  Son process s'appelle **`tauri-app`** (PAS « Atelier ») → `pkill -x Atelier` ne matche jamais.
- 3 familles de process : l'app (`tauri-app`), le **sidecar chat** (défaut R10+ :
  `Resources/rust-server/atelier-studio-server` ; soak Node si `ATELIER_BACKEND=node`),
  les **serveurs galerie** (défaut 2026-07-16 : `atelier-gallery-server` Rust, un par
  projet ; soak Node `node …/server/main.mjs` si `ATELIER_GALLERY_BACKEND=node` —
  zombies si non tués, dans les DEUX variantes).
- `npm run tauri dev` ne survit PAS lancé par un agent (reaping du harness).
  Seul Thierry le lance depuis son terminal. Les agents utilisent le BUILD.
- Vite dev sert `src/` en direct, mais l'app buildée fige tout au build :
  **aucun changement n'est visible sans rebuild.**
- Le build quotidien produit uniquement `Atelier.app`. Le DMG est réservé aux
  releases, car un échec de `create-dmg` peut laisser une image temporaire
  `rw.*.dmg` de plusieurs centaines de Mo.
- Chaque worktree conserve ses propres `target/` pour garantir qu'un build ne
  remplace pas les binaires d'un autre. `sccache` conserve un cache de compilation
  séparé et plafonné à 10 Gio pour accélérer les reconstructions après nettoyage.
- Le protocole se lance depuis le worktree qui contient les changements. Il
  détecte sa racine Git et construit/ouvre le `Atelier.app` de CE worktree.
  Une seule instance d'Atelier peut tourner à la fois : la phase d'arrêt reste
  donc globale, même lorsque le build est local au worktree.
- La galerie a 2 copies : source `gallery/` (à committer) et bundle
  `src-tauri/gallery-dist/` (régénéré par `scripts/stage-gallery.sh`).
  Modifier `gallery/assets/*` sans restager = bundle périmé.

## Protocole (copier-coller)

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT"
APP="$ROOT/src-tauri/target/release/bundle/macos/Atelier.app"
APP_BIN="$APP/Contents/MacOS/tauri-app"
BUILD_LOG="/tmp/tauri-build-$(basename "$ROOT")-$$.log"
echo "Worktree testé : $ROOT"

# 1. VÉRIFICATIONS (obligatoires avant tout build)
npx tsc --noEmit          # doit passer
npx vite build            # doit passer
(cd sidecar && npx vitest run)   # 19+ tests verts
# si gallery/ touché (serveur OU assets éditeurs) :
(cd gallery && node server/tests/parity.mjs)      # « parity: ok »
(cd gallery && node server/tests/diff_suite.mjs)  # « diff suite: ok (N tests) »

# 2. TUER TOUT (l'ordre importe peu, l'exhaustivité oui)
pkill -9 -x tauri-app
pkill -9 -f "Resources/sidecar/index.mjs"
pkill -9 -f "sidecar/index.mjs"
pkill -9 -f "atelier-studio-server"
pkill -9 -f "Resources/rust-server/atelier-studio-server"
pkill -9 -f "atelier-gallery-server"
for p in $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep node | awk '{print $2}' | sort -u); do
  case "$(ps -p $p -o command= 2>/dev/null)" in *"server/main.mjs"*) kill -9 $p;; esac
done
sleep 1

# 3. BUILD .APP (stage-gallery/stage-sidecar sont automatiques ; aucun DMG ici)
npm run tauri:build:app > "$BUILD_LOG" 2>&1
# exit 0 attendu ; toute erreur doit être investiguée
grep -iE "error" "$BUILD_LOG"   # doit être VIDE

# 4. RELANCER + VÉRIFIER (jamais « open » seul sans vérif)
test -x "$APP_BIN" || { echo "ÉCHEC — binaire absent dans $APP"; exit 1; }
open -n "$APP"
sleep 4
APP_PID="$(pgrep -x tauri-app | head -1)"
[ -n "$APP_PID" ] || { echo "ÉCHEC — tauri-app absent"; exit 1; }
RUNNING_CMD="$(ps -p "$APP_PID" -o command=)"
case "$RUNNING_CMD" in
  "$APP_BIN"*) echo "OK — $ROOT (pid $APP_PID)" ;;
  *) echo "ÉCHEC — mauvais worktree lancé : $RUNNING_CMD"; exit 1 ;;
esac
```

## Quel worktree lancer ?

- **Test avant fusion** : ouvrir un terminal dans le worktree modifié, puis
  exécuter le protocole ci-dessus. Le build et l'app viennent de ce worktree.
- **Validation canonique** : fusionner d'abord la branche dans `main`, ouvrir un
  terminal dans le checkout principal, puis réexécuter le même protocole.
- **Release/DMG** : uniquement depuis le checkout principal sur la branche `main`.
- Un worktree ancien n'hérite pas magiquement des fichiers ajoutés sur `main` :
  il doit d'abord intégrer le commit de protocole par merge, rebase ou cherry-pick.
- `npm run tauri:build:app` prend un verrou propre au worktree. Si une autre tâche
  construit déjà le même `target/`, le second build s'arrête immédiatement au lieu
  de compiler en concurrence. Des worktrees différents gardent des verrous distincts.

## Développement rapide ou app buildée ?

- Thierry peut lancer `npm run tauri dev` depuis son propre terminal : le frontend
  se recharge sans build release complet et Rust se recompile au besoin.
- Les agents ne lancent jamais ce mode, car leur harness le termine et peut laisser
  des processus orphelins. Ils valident avec le protocole `.app` ci-dessus.
- Avant de déclarer une modification de l'app terminée, effectuer au moins une
  validation complète avec le `.app` du bon worktree.
- Une modification de documentation ou de plan seulement ne nécessite pas de
  reconstruire ni de relancer Atelier.

## Première utilisation : comment l'économie d'espace fonctionne

Il y a maintenant deux niveaux distincts :

1. Les sorties finales restent dans le `target/` de chaque worktree. Deux agents
   peuvent donc compiler deux branches sans s'écraser mutuellement.
2. Avant d'appeler `rustc`, Cargo passe par `sccache`. Si le même crate au même
   chemin de build a déjà été compilé avec les mêmes entrées, le résultat peut
   être repris dans le cache au lieu d'être recompilé. Le cache est plafonné à
   10 Gio.

La compilation incrémentale de Rust est désactivée parce qu'elle est incompatible
avec les entrées cacheables de `sccache` et produisait plusieurs Gio par worktree.
Les anciens dossiers `incremental/` ne disparaissent pas lors de l'installation :
ils deviennent récupérables lorsqu'un `target/` inactif est nettoyé.

Important : le cache est commun sur le disque, mais la version actuellement
installée n'a produit aucun hit lors du test entre deux chemins de worktree
différents. Le contrôle d'espace repose donc sur le nettoyeur; `sccache` sert
surtout à accélérer la reconstruction ultérieure du même worktree.

Vérifier que le cache fonctionne :

```bash
npm run rust:cache:status
```

Les compteurs `Cache hits` augmenteront progressivement. Un premier build reste
normalement plus long : il remplit le cache pour les builds suivants.

### Nettoyer les `target/` abandonnés

La commande normale est toujours un aperçu sans suppression :

```bash
npm run rust:targets:prune
```

Par défaut, seuls les `target/` sans fichier modifié depuis au moins 14 jours sont
proposés. Le checkout principal, le worktree depuis lequel la commande est lancée,
les worktrees non enregistrés par Git et ceux où `cargo` ou `rustc` tourne sont
exclus. Aucune branche et aucun fichier source ne sont supprimés.

Après avoir lu la liste et le total récupérable :

```bash
npm run rust:targets:prune -- --apply
```

On peut choisir un seuil plus conservateur, toujours d'abord en aperçu :

```bash
npm run rust:targets:prune -- --days 30
npm run rust:targets:prune -- --days 30 --apply
```

### Construire un DMG de release

Une relance quotidienne n'a besoin que du `.app`. Pour une vraie release :

```bash
ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd -P)"
[ "$ROOT" = "$MAIN_ROOT" ] && [ "$(git branch --show-current)" = "main" ] || {
  echo "Refus : le DMG doit être construit depuis le checkout principal sur main"
  exit 1
}
npm run tauri:build:dmg
```

Le wrapper supprime uniquement les fichiers temporaires correspondant exactement
à `src-tauri/target/release/bundle/macos/rw.*.dmg`, avant le build puis à sa sortie,
même si la création du DMG échoue. Il ne supprime ni `Atelier.app` ni le DMG final.

## Interdits

- ❌ `pkill -x Atelier` / `pgrep -x Atelier` (mauvais nom ; utiliser `tauri-app`)
- ❌ `open Atelier.app` sans avoir tué l'existant (active le zombie, ne relance rien)
- ❌ builder sans avoir tué les serveurs galerie (ils serviront le vieux code)
- ❌ `npm run tauri dev` depuis un agent (meurt en ~2 min, laisse des orphelins sur :1420)
- ❌ construire un DMG pour une relance locale ordinaire
- ❌ contourner `tauri:build:app` avec un build direct lorsqu'un autre build peut tourner
- ❌ partager un seul `CARGO_TARGET_DIR` entre plusieurs worktrees : collisions possibles
- ❌ exécuter `rust:targets:prune -- --apply` sans avoir lu l'aperçu
- ❌ modifier `src-tauri/gallery-dist/` directement (écrasé au prochain stage — modifier `gallery/`)
- ❌ conclure « le fix ne marche pas » sans avoir vérifié qu'AUCUN zombie ne sert l'ancien code

## Vérif d'embed par hachage (plus fort que la taille du binaire)

La taille ~17 Mo ne prouve PAS que le dist embarqué est le bon (vu le
2026-07-10 : rebuild → binaire de taille identique, assets périmés). Preuve
fiable — comparer les noms de chunks embarqués au dist réel :

```bash
strings src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app \
  | grep -oE "index-[A-Za-z0-9_-]{8}\.js" | sort -u > /tmp/embedded.txt
ls dist/assets | grep -E "^index-.*\.js$" | sort > /tmp/disk.txt
diff /tmp/embedded.txt /tmp/disk.txt && echo "EMBED==DIST"   # doit matcher
```

Si mismatch : `touch src-tauri/src/lib.rs` puis rebuild.

## Diagnostic express « je ne vois pas mon changement »

```bash
ls -la src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app  # binaire frais ?
pgrep -fl "server/main.mjs"   # serveurs galerie : leurs process datent de quand ?
ps -o lstart= -p <pid>        # un lstart antérieur au build = zombie → kill -9
```

## Premier lancement post-build : lenteur TCC NORMALE — vérifier la convergence, pas l'instantané

Sans identité de signature stable, l'app est signée **adhoc** : chaque
rebuild = nouvelle identité pour macOS → les consultations TCC/Gatekeeper
repartent de zéro au premier lancement. (Le plan 019 a ajouté
`signingIdentity: "Atelier Dev Signing"` dans tauri.conf sur
feat/generateur-images — les branches qui l'ont re-consultent beaucoup
moins ; la règle « pas d'écriture dans le bundle » reste valable partout.)
Conséquences attendues (macOS 26) :

- le premier boot du sidecar peut être lent ; son event loop peut geler
  quelques secondes (fs synchrone + consultations) ;
- le mécanisme anti-boucle (health retry + kill des orphelins + backoff +
  single-instance, commit 44c94d0) peut **remplacer une fois** un sidecar
  gelé — c'est l'auto-guérison, pas un échec.

**Convergence attendue < ~30 s.** Vérification (copier-coller) :

```bash
APP="$HOME/Library/Application Support/atelier-studio"
P=$(pgrep -f "Resources/sidecar/index.mjs" | head -1)
[ "$(cat "$APP/sidecar.pid")" = "$P" ] && [ -f "$APP/sidecar.lock" ] && echo "pid+lock OK"
PORT=$(sed -E 's/.*"port":([0-9]+).*/\1/' "$APP/sidecar.lock")
TOKEN=$(sed -E 's/.*"token":"([^"]+)".*/\1/' "$APP/sidecar.lock")
curl -s -m 5 -H "x-atelier-token: $TOKEN" "http://127.0.0.1:$PORT/health"   # {"ok":true,...}
```

Si ça boucle encore (sidecars qui meurent toutes les ~4-6 s, jamais de pid
file) :

```bash
sample $(pgrep -f "Resources/sidecar/index.mjs" | head -1) 1 -file /tmp/s.txt
grep -E "node::fs::|uv_fs_" /tmp/s.txt   # un appel fs SYNC bloqué = le coupable
```

**Piège d'origine (résolu, ne pas réintroduire)** : `terminal.mjs` faisait un
`chmodSync` à l'import DANS le bundle .app → consultation TCC « App
Management » bloquante > 4 s (budget startup Rust) → sidecar tué en boucle,
app « Sidecar déconnecté » pour toujours. **Règle : jamais d'écriture (chmod,
write, mkdir) dans le bundle .app au chargement d'un module sidecar** — tout
bit/fichier nécessaire se pose au build (stage-sidecar.sh) ; au runtime,
vérifier en lecture seule (`accessSync`) avant d'écrire. Nota : le blocage est
INVISIBLE en manuel (`node index.mjs` depuis un terminal marche parfaitement)
— seul le contexte app le déclenche ; tester avec l'app, pas seulement le
sidecar isolé.

## Piège vérifié (2026-07-10) : fenêtre « asset not found: index.html »

Symptôme : l'app se lance (`tauri-app` vivant) mais la fenêtre affiche
« asset not found: index.html » — le frontend ne boote jamais, donc AUCUN
sidecar n'est spawné (`sidecar_port` n'est jamais invoqué). Ne pas
diagnostiquer côté sidecar : c'est l'embed des assets qui a échoué.

Cause : cache d'expansion de `generate_context!` (cargo) — le binaire est
compilé sans le payload frontend malgré un `dist/` complet et un build exit 0.

Contrôle rapide : taille de
`bundle/macos/Atelier.app/Contents/MacOS/tauri-app` — **~17 Mo attendu** ;
~9-10 Mo = assets absents.

Fix : `touch src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json`
puis rebuild (rapide, cargo caché) ; revérifier la taille avant de relancer.
