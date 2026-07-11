# Protocole de relance d'Atelier Studio (agents : Codex, Claude, forks)

**À suivre EXACTEMENT après toute modification. Aucune improvisation.**
Le non-respect crée des zombies (serveurs galerie/sidecar orphelins) qui servent
du vieux code et font croire que le fix « ne marche pas ».

## Ce qu'il faut savoir (2 min)

- L'app buildée = `src-tauri/target/release/bundle/macos/Atelier.app`.
  Son process s'appelle **`tauri-app`** (PAS « Atelier ») → `pkill -x Atelier` ne matche jamais.
- 3 familles de process : l'app (`tauri-app`), le **sidecar chat** (défaut R10+ :
  `Resources/rust-server/atelier-studio-server` ; soak Node si `ATELIER_BACKEND=node`),
  les **serveurs galerie** (`node …/server/main.mjs`, un par projet — zombies si non tués).
- `npm run tauri dev` ne survit PAS lancé par un agent (reaping du harness).
  Seul Thierry le lance depuis son terminal. Les agents utilisent le BUILD.
- Vite dev sert `src/` en direct, mais l'app buildée fige tout au build :
  **aucun changement n'est visible sans rebuild.**
- La galerie a 2 copies : source `gallery/` (à committer) et bundle
  `src-tauri/gallery-dist/` (régénéré par `scripts/stage-gallery.sh`).
  Modifier `gallery/assets/*` sans restager = bundle périmé.

## Protocole (copier-coller)

```bash
cd ~/Documents/atelier-studio

# 1. VÉRIFICATIONS (obligatoires avant tout build)
npx tsc --noEmit          # doit passer
npx vite build            # doit passer
(cd sidecar && npx vitest run)   # 19+ tests verts
# si gallery/ touché (serveur OU assets éditeurs) :
(cd gallery && node server/tests/parity.mjs)      # « parity: ok »
(cd gallery && node server/tests/diff_suite.mjs)  # « diff suite: ok (N tests) »

# 2. TUER TOUT (l'ordre importe peu, l'exhaustivité oui)
pkill -9 -f tauri-app
pkill -9 -f "Resources/sidecar/index.mjs"
pkill -9 -f "sidecar/index.mjs"
pkill -9 -f "atelier-studio-server"
pkill -9 -f "Resources/rust-server/atelier-studio-server"
for p in $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep node | awk '{print $2}' | sort -u); do
  case "$(ps -p $p -o command= 2>/dev/null)" in *"server/main.mjs"*) kill -9 $p;; esac
done
sleep 1

# 3. BUILD (stage-gallery/stage-sidecar sont dans beforeBuildCommand — automatiques)
rm -rf src-tauri/target/release/bundle/dmg   # sinon bundle_dmg.sh échoue parfois (exit 1 cosmétique)
npm run tauri build > /tmp/tauri-build.log 2>&1
# exit 0 attendu ; exit 1 acceptable UNIQUEMENT si la seule erreur est bundle_dmg.sh
grep -iE "error" /tmp/tauri-build.log | grep -v dmg   # doit être VIDE

# 4. RELANCER + VÉRIFIER (jamais « open » seul sans vérif)
open src-tauri/target/release/bundle/macos/Atelier.app
sleep 4
pgrep -f tauri-app >/dev/null && echo "OK" || echo "ÉCHEC — investiguer, ne pas réessayer en boucle"
```

## Interdits

- ❌ `pkill -x Atelier` / `pgrep -x Atelier` (mauvais nom de process)
- ❌ `open Atelier.app` sans avoir tué l'existant (active le zombie, ne relance rien)
- ❌ builder sans avoir tué les serveurs galerie (ils serviront le vieux code)
- ❌ `npm run tauri dev` depuis un agent (meurt en ~2 min, laisse des orphelins sur :1420)
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
