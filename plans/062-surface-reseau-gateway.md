# Plan 062: Refermer la surface réseau du gateway distant et les jetons faibles

> **Executor instructions**: Follow this plan step by step, verify each step.
> On a STOP condition, stop and report. Update `plans/README.md` when done.
> Sécurité : ne JAMAIS coller de valeur de jeton dans un commit, un log de test
> ou ce plan.
>
> **Drift check (run first)**: `git diff --stat 49c52384..HEAD -- src-tauri/src/remote_gateway.rs rust/crates/atelier-remote/src rust/crates/atelier-gallery/src/main.rs src/App.tsx`

## Status

- **Priority**: P1
- **Effort**: S→M (quatre correctifs S regroupés)
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `49c52384`, 2026-08-15

## Why this matters

Findings SEC-01/-02/-03/-08 — le bloc « exposition réseau + credentials » qu'un
audit d'achat regarde en premier. Dès que le companion mobile est actif, la
machine écoute sur TOUTES les interfaces (0.0.0.0, port fixe 18765 + un second
listener 1421 sans aucune auth), le contrôle d'accès repose sur l'en-tête
`Host` (falsifiable), le jeton admin part en clair dans un log, et le jeton
galerie peut silencieusement devenir 32 octets de zéros. Quatre correctifs
courts, un gain de posture majeur.

## Current state

- `src-tauri/src/remote_gateway.rs:255-256` :
  ```rust
  let ip = tailscale_ip()?;
  let bind = format!("0.0.0.0:{GATEWAY_PORT}");
  ```
  L'IP résolue ne sert qu'à l'allowlist Host. `:291` pose
  `ATELIER_REMOTE_ALLOW_ANY_BIND=1`, neutralisant le garde-fou du crate
  (`rust/crates/atelier-remote/src/lib.rs:160-171`).
- `remote_gateway.rs:300` — `.env("ATELIER_MOBILE_BIND", "0.0.0.0:1421")` ;
  `lib.rs:125-144` : ce listener est un `ServeDir` nu, hors CORS/check_host/
  require_device, et `validate_bind` ne contrôle que `config.bind`. Le bundle
  mobile est AUSSI servi en fallback par le routeur principal (`lib.rs:101-107`).
- `rust/crates/atelier-remote/src/main.rs:26-29` — jeton admin imprimé en clair
  sur stderr (commentaire périmé « loopback only ») ; stderr est redirigé en
  append vers `…/atelier-studio/remote/gateway.log` (`remote_gateway.rs:279-285`)
  SANS `mode(0o600)` ; `:320-328` remonte la dernière ligne du log dans l'UI.
- `rust/crates/atelier-remote/src/hostcheck.rs:6-31` + allowlist contenant
  `127.0.0.1`/`localhost` (`remote_gateway.rs:288`) → `Host: 127.0.0.1` passe.
- `routes.rs:27-28,123-134` — `/remote/health` sans `guard_headers` (expose
  versions + nombre d'appareils appairés).
- `rust/crates/atelier-gallery/src/main.rs:1824-1831` :
  ```rust
  let mut bytes = [0u8; 32];
  if let Ok(mut f) = fs::File::open("/dev/urandom") { let _ = f.read_exact(&mut bytes); }
  let tok = hex::encode(bytes);
  ```
  Échec silencieux → jeton constant tout-zéros. Ce jeton autorise la sortie du
  sandbox projet (`gallery/server/shared.mjs:129-140`).
- `src/App.tsx:2052` et `:2142` — jeton galerie passé en query string.
- Bon modèle de permissions fichier : `rust/crates/atelier-runtime/src/instance.rs:190-194`
  (OpenOptions + mode 0o600).
- Rotation admin disponible : `AuthStore::rotate_admin`
  (`rust/crates/atelier-remote/src/auth.rs:196-199`) ; stockage serveur des
  jetons déjà en SHA-256 (`auth.rs:51-52`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests remote | `cd rust && cargo test -p atelier-remote` | verts |
| Tests gallery | `cd rust && cargo test -p atelier-gallery` | verts |
| Check Tauri | `cd src-tauri && cargo check` | exit 0 |
| Typecheck front | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** : `src-tauri/src/remote_gateway.rs`,
`rust/crates/atelier-remote/src/{lib.rs,main.rs,routes.rs}`,
`rust/crates/atelier-gallery/src/main.rs` (génération du jeton),
`src/App.tsx` (transport du jeton) + le côté serveur qui le lit
(`gallery/server/shared.mjs`, `rust/crates/atelier-gallery` middleware).

**Out of scope** :
- Le protocole d'appairage lui-même (code, rate-limit) — sain, ne pas toucher.
- Keychain mobile (SEC-04) — c'est le plan 042 existant.
- CORS du sidecar Node — noté sans effet en prod par l'audit, hors périmètre.

## Git workflow

- Branch: `advisor/062-surface-reseau` ; commits `fix(remote): …` / `fix(gallery): …`.

## Steps

### Step 1: binder l'IP Tailscale, retirer ALLOW_ANY_BIND

`remote_gateway.rs` : `let bind = format!("{ip}:{GATEWAY_PORT}")` ; supprimer
l'env `ATELIER_REMOTE_ALLOW_ANY_BIND`. Si `tailscale_ip()` échoue, comportement
actuel (gateway ne démarre pas) avec message clair — c'est déjà le contrat.
Ajouter un test dans `atelier-remote` : `validate_bind` refuse
`0.0.0.0` sans opt-in, et le config produit par l'app ne l'utilise plus
(test sur la string de bind : `!addr.ip().is_unspecified()`).

**Verify**: `cargo test -p atelier-remote` ; smoke : gateway démarré, `lsof -nP
-iTCP:18765` montre l'IP Tailscale, pas `*`.

### Step 2: fermer/attacher le listener mobile

Supprimer le listener séparé `mobile_bind` (le fallback du routeur principal le
remplace, `lib.rs:101-107`) OU le faire passer par `validate_bind` + bind
Tailscale. Préférence : suppression (moins de surface). Retirer
`ATELIER_MOBILE_BIND` du spawn.

**Verify**: `lsof -nP -iTCP:1421` vide ; le PWA reste servi via le port
gateway (GET de la racine → 200).

### Step 3: jeton admin hors des logs, log 0600, rotation

`main.rs:26-29` : n'imprimer qu'une empreinte (`&admin[..6]` + « … voir
/remote/admin »). Ouvrir `gateway.log` avec `OpenOptions … .mode(0o600)`
(modèle `instance.rs:190-194`). Tronquer ce qui remonte dans l'UI
(`remote_gateway.rs:320-328`) à 200 chars APRÈS filtrage d'un motif
`[0-9a-f]{32,}` → `[jeton]`. Puis, à la première exécution post-correctif,
appeler `AuthStore::rotate_admin` si le log existant contenait un jeton
(pragmatique : toujours faire la rotation une fois, flag persistant).

**Verify**: `cargo test -p atelier-remote` + test : la ligne de démarrage ne
contient plus 64 hex consécutifs ; `stat -f "%Lp" …/remote/gateway.log` → 600.

### Step 4: `/remote/health` derrière guard_headers

Appliquer `guard_headers` aux deux routes health (`routes.rs:27-28,123-134`).
Si le mobile appairé sonde health avant auth, dégrader : réponse `{ok:true}`
sans versions ni compte d'appareils pour les non-authentifiés.

**Verify**: test : GET /remote/health sans en-têtes → 200 minimal SANS
`devices`/`startedAt` ; avec device token → payload complet.

### Step 5: jeton galerie — échec bruyant + transport hors URL

`main.rs:1824-1831` : remplacer par `getrandom::getrandom(&mut bytes)` (ou
`rand`) et **panic/refus de démarrage** si l'entropie échoue (jamais un jeton
constant). Au démarrage, si le fichier jeton existant est entièrement `0` →
le régénérer et logger l'événement. Côté transport : remplacer `&token=` des
URLs (`App.tsx:2052,2142`) par l'en-tête `Authorization: Bearer` quand c'est un
fetch, et pour les iframes (où l'en-tête est impossible) par le fragment
`#atelier_token=` (jamais envoyé au serveur dans les logs de requêtes,
récupéré par le JS de la page comme le nonce l'est déjà —
`gallery/assets/atelier_theme.js:6-8`) ; adapter la lecture côté
`gallery/server/shared.mjs:129-134` et le middleware Rust équivalent pour
accepter header OU parer le fragment transmis en query interne. ATTENTION
piège connu : le serveur galerie sert une coquille en mémoire — après modif,
suivre docs/PROTOCOLE_RELANCE.md pour valider dans l'app.

**Verify**: `cargo test -p atelier-gallery` ; grep `"&token="` dans src/ → 0 ;
ouverture d'un fichier hors-projet fonctionne encore dans l'app relancée.

## Test plan

- 4 tests Rust listés dans les steps (bind, empreinte, health, jeton zéro).
- Smoke manuel : appairage iPhone complet après les changements (le happy path
  ne doit pas casser) — si pas d'iPhone sous la main, STOP avant merge et
  demander à l'opérateur.

## Done criteria

- [ ] `lsof` : aucun listener `*:18765` ni `*:1421`
- [ ] gateway.log en 0600, sans jeton complet ; rotation admin faite
- [ ] health non authentifié minimal
- [ ] Jeton galerie : génération faillible-forte, plus de token en query string
- [ ] cargo test -p atelier-remote / -p atelier-gallery verts ; tsc vert
- [ ] `plans/README.md` à jour

## STOP conditions

- Drift sur les excerpts.
- Le companion mobile ne parvient plus à s'appairer après step 1-2 (re-bind au
  changement d'IP Tailscale manquant) : signaler, ne pas élargir le bind.
- Step 5 : si le fragment ne peut pas atteindre le serveur galerie sans le
  réécrire en query quelque part, documenter le compromis et s'arrêter.

## Maintenance notes

- Règle : tout nouveau listener passe par `validate_bind` ; tout nouveau
  fichier de log par `mode(0o600)` ; tout secret transite par header/fragment.
- L'audit a noté le commentaire « loopback only » périmé — le mettre à jour.
