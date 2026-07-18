# Protocole de relance d'Atelier Studio (agents : Codex, Claude, forks)

**À suivre EXACTEMENT avant de valider toute modification qui touche l'app, le
runtime, le build ou la galerie. Aucune improvisation.**
Une modification limitée aux documents/plans ne nécessite pas de rebuild.
Le non-respect crée des zombies (serveurs galerie/sidecar orphelins) qui servent
du vieux code et font croire que le fix « ne marche pas ».

## Ce qu'il faut savoir (2 min)

- L'app buildée = `src-tauri/target/release/bundle/macos/Atelier.app`.
  Son process s'appelle **`tauri-app`** (PAS « Atelier ») → `pkill -x Atelier` ne matche jamais.
- 3 familles de process : l'app (`tauri-app`), le **sidecar chat**
  (défaut R10 : `Resources/rust-server/atelier-studio-server` ; soak Node :
  `Resources/sidecar/index.mjs` si `ATELIER_BACKEND=node`), les **serveurs galerie**
  (`node …/server/main.mjs`, un par projet ouvert — ils SURVIVENT aux relances et
  l'app les réutilise → zombies = vieux code servi).
- `npm run tauri dev` ne survit PAS lancé par un agent (reaping du harness).
  Seul Thierry le lance depuis son terminal. Les agents utilisent le BUILD.
- Vite dev sert `src/` en direct, mais l'app buildée fige tout au build :
  **aucun changement n'est visible sans rebuild.**
- Le build quotidien génère seulement le bundle macOS `.app`. Le DMG est réservé
  aux releases explicites afin d'éviter les grosses images temporaires `rw.*.dmg`.
- Chaque worktree garde ses propres `target/` pour éviter les collisions. Cargo
  passe par `sccache` quand il est installé afin d'accélérer une reconstruction
  après nettoyage ; le wrapper retombe sur `rustc` sinon.
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

### Quel worktree lancer ?

- Test avant fusion : ouvrir un terminal dans le worktree modifié, puis exécuter
  le protocole ci-dessus. Le build et l'app viennent de ce worktree.
- Validation canonique : fusionner d'abord la branche dans `main`, ouvrir un
  terminal dans le checkout principal, puis réexécuter le même protocole.
- Release/DMG : uniquement depuis le checkout principal sur la branche `main`.
- Un worktree ancien n'hérite pas magiquement des fichiers ajoutés sur `main` :
  il doit d'abord intégrer le commit de protocole par merge, rebase ou cherry-pick.

### Développement rapide ou app buildée ?

- Thierry peut lancer `npm run tauri dev` depuis son propre terminal : le frontend
  se recharge sans build release complet et Rust se recompile au besoin.
- Les agents ne lancent jamais ce mode, car leur harness le termine et peut laisser
  des processus orphelins. Ils valident avec le protocole `.app` ci-dessus.
- Avant de déclarer une modification de l'app terminée, effectuer au moins une
  validation complète avec le `.app` du bon worktree.
- Une modification de documentation ou de plan seulement ne nécessite pas de
  reconstruire ni de relancer Atelier.

## Discipline disque Rust / Tauri

- Build et relance ordinaires : `npm run tauri:build:app`.
- Cette commande prend un verrou atomique propre au worktree et refuse un second
  build simultané qui écrirait dans le même `target/`.
- DMG de release seulement : `npm run tauri:build:dmg`. Ce wrapper supprime
  uniquement les images temporaires `bundle/macos/rw.*.dmg` avant et après le build.
- Aperçu sans suppression des `target/` inactifs : `npm run rust:targets:prune`.
- Application après lecture de l'aperçu :
  `npm run rust:targets:prune -- --apply` (seuil par défaut : 14 jours).
- Le checkout principal, le worktree courant et tout worktree où Cargo/Rustc
  tourne sont exclus du nettoyeur. Les branches et fichiers sources ne sont jamais touchés.
- État du cache partagé plafonné à 10 Gio : `npm run rust:cache:status`.

## Interdits

- ❌ `pkill -x Atelier` / `pgrep -x Atelier` (mauvais nom ; utiliser `tauri-app`)
- ❌ `open Atelier.app` sans avoir tué l'existant (active le zombie, ne relance rien)
- ❌ builder sans avoir tué les serveurs galerie (ils serviront le vieux code)
- ❌ `npm run tauri dev` depuis un agent (meurt en ~2 min, laisse des orphelins sur :1420)
- ❌ construire un DMG pour une simple relance locale
- ❌ contourner `tauri:build:app` avec un build direct lorsqu'un autre build peut tourner
- ❌ définir un `CARGO_TARGET_DIR` unique pour plusieurs worktrees parallèles
- ❌ lancer le nettoyeur avec `--apply` sans avoir lu son aperçu
- ❌ modifier `src-tauri/gallery-dist/` directement (écrasé au prochain stage — modifier `gallery/`)
- ❌ conclure « le fix ne marche pas » sans avoir vérifié qu'AUCUN zombie ne sert l'ancien code

## Workflow shadcn/ui

Pour toute création, utilisation ou mise à jour d'une primitive shadcn :

- lire le skill projet `.agents/skills/shadcn/SKILL.md` et vérifier le contexte
  avec `npx shadcn@latest info --json` ;
- consulter `npx shadcn@latest docs <component>` et rechercher le registre avant
  d'inventer une primitive ;
- lancer `add <component> --dry-run`, puis examiner `--diff` si un fichier
  existant est concerné ;
- ne jamais utiliser `--overwrite`, `--force` ou `add --all` sans demande
  explicite ; les sources shadcn restent dans `src/components/shadcn/` et
  l'API produit dans `src/components/ui/` ;
- conserver le préfixe Tailwind `tw`, les tokens Precision Native, l'absence de
  Preflight et les règles de composition/a11y du skill ;
- le serveur MCP de projet est déclaré dans `.mcp.json`. Le MCP Codex global,
  s'il est nécessaire, se configure séparément dans `~/.codex/config.toml` et
  ne doit pas être modifié depuis ce dépôt sans autorisation explicite.

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
