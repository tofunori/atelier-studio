# Plan 064: Lot pré-signature — identité, notes de release, README, épinglage

> **Executor instructions**: Follow this plan step by step, verify each step.
> On a STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 49c52384..HEAD -- src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/src/appsnap.rs .github/workflows/release.yml README.md src/App.tsx`

## Status

- **Priority**: P1 (fenêtre courte : AVANT toute signature Developer ID)
- **Effort**: M
- **Risk**: MED
- **Depends on**: none — et DIST-01/02 (notarisation, plan futur) dépendent de LUI
- **Category**: distribution
- **Planned at**: commit `49c52384`, 2026-08-15

## Why this matters

Findings DIST-09/-03/-08/-10. Trois faits : (1) l'identifiant de bundle est
encore celui du scaffold (`com.tofunori.tauri-app`) — le changer APRÈS la
première distribution signée ferait perdre à chaque client ses autorisations
TCC et ses préférences ; la fenêtre pour le renommer à bas coût, c'est
maintenant. (2) La release publiée v1.4.0 porte les notes de la v1.3.6 (bloc
littéral dans le workflow) — la page de téléchargement ment. (3) Le README
donne un nom de DMG introuvable et omet le prérequis CLI qui bloquera le
premier lancement. Plus un épinglage de dépendance git sur le chemin de release.

## Current state

- `src-tauri/tauri.conf.json:5` — `"identifier": "com.tofunori.tauri-app"`.
  Le companion iOS utilise déjà `com.tofunori.atelier.companion`
  (`mobile/src-tauri/tauri.conf.json:5`).
- `src-tauri/src/appsnap.rs:238` — identifiant codé en dur :
  `.arg("com.tofunori.tauri-app")` (`--excluded-bundle-id`). Après renommage
  sans correction, Atelier se capture elle-même.
- `src-tauri/src/appsnap.rs:97-101` — dossier de captures dérivé de
  `app_data_dir()` (donc de l'identifiant). Les VRAIES données vivent hors
  identifiant (`~/Library/Application Support/atelier-studio` —
  `rust/crates/atelier-runtime/src/paths.rs:17`) ; le `localStorage` WKWebView
  est par contre indexé par identifiant, et `src/App.tsx:743-755` miroite déjà
  projets/projMeta/settings sur disque.
- `src-tauri/Cargo.toml:2-5` — `name = "tauri-app"`, `description = "A Tauri
  App"`, `authors = ["you"]`. `:24` — `fix-path-env = { git = … }` sans `rev`
  (lockfile épingle `c4c45d5…` — `Cargo.lock:985-987`).
- `.github/workflows/release.yml:66-85` — `releaseBody:` littéral « Atelier
  Studio 1.3.6 … », renvoie vers `docs/releases/v1.3.6.md` ; `docs/releases/v1.4.0.md`
  existe et n'est jamais utilisé. `:92-95` — `gh release edit --draft=false --latest`.
- `README.md:14` — badge 1.3.6 ; `:110` — « Download `Atelier_1.3.6_aarch64.dmg` » ;
  `:104-106` — « End users do not need to install Node or Python » sans
  mentionner les CLI Claude/Codex requis ; `:112-117` — `xattr -cr` comme étape
  normale (restera vrai jusqu'à DIST-01, à encadrer d'un « temporaire »).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Check Tauri | `cd src-tauri && cargo check` | exit 0 |
| Build app complet | `npm run tauri:build:app` | exit 0 (suivre docs/PROTOCOLE_RELANCE.md : tuer avant) |
| Lint workflow | `gh workflow view release.yml` (lecture) | syntaxe ok au push d'un tag de test — ne PAS pusher |

## Scope

**In scope** : `src-tauri/tauri.conf.json`, `src-tauri/tauri.release.conf.json`
(si l'identifier y est répété), `src-tauri/Cargo.toml`, `src-tauri/src/appsnap.rs`,
`src-tauri/src/lib.rs` (migration app_data_dir), `.github/workflows/release.yml`,
`README.md`.

**Out of scope** :
- Developer ID / notarisation / entitlements (DIST-01/02) — plan suivant.
- Updater (DIST-04). Licences (DIST-05/06).
- `mobile/` en entier.

## Git workflow

- Branch: `advisor/064-pre-signature` ; commits `build: …` / `docs: …`.
- NE PAS créer/pusher de tag.

## Steps

### Step 1: renommer l'identifiant + métadonnées

`tauri.conf.json:5` → `"identifier": "com.tofunori.atelier"`. `Cargo.toml` :
`name = "atelier"`, description réelle, author. `appsnap.rs:238` : remplacer le
littéral par l'identifiant lu depuis le `AppHandle`
(`app.config().identifier.clone()` passé au spawn — le helper reçoit déjà des
args, en ajouter un). Vérifier qu'aucun autre littéral ne traîne :
`grep -rn "tauri-app" src-tauri/src rust/crates --include="*.rs"` ne doit plus
matcher que des commentaires/chemins de build.

**Verify**: `cargo check` exit 0 ; grep ci-dessus propre.

### Step 2: migration one-shot du répertoire app_data + localStorage

Au setup Tauri (`lib.rs`) : si `…/com.tofunori.tauri-app` existe et
`…/com.tofunori.atelier` n'existe pas → copier (rename) le répertoire. Pour le
localStorage WKWebView (préférences UI cosmétiques), s'appuyer sur le miroir
disque existant (`App.tsx:743-755` recharge projets/projMeta/settings) ; NE PAS
tenter de copier les fichiers WebKit internes. Documenter dans le commit ce qui
est perdu (favoris/épinglages non mirrorés — vérifier la liste à
`App.tsx:553,572,687,697` et étendre le miroir disque à ces clés AVANT le
renommage si c'est < 1 h de travail, sinon le noter).

**Verify**: build + lancement : projets et réglages présents ; appsnap
fonctionne (une capture d'essai n'inclut pas la fenêtre d'Atelier).

### Step 3: notes de release dérivées du tag

`release.yml` : remplacer le bloc littéral par une étape qui lit
`docs/releases/${GITHUB_REF_NAME}.md` et échoue si absent
(`test -f docs/releases/${{ github.ref_name }}.md || exit 1`), en gardant un
pied de page stable (prérequis CLI ≥ 2.1.139, plateforme). Retirer `--latest`
de `gh release edit` tant que DIST-01 n'est pas fait (laisser en draft=false
mais sans marquer latest — décision de l'audit, la commenter dans le YAML).

**Verify**: `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/release.yml'))"`
exit 0 ; relecture du diff.

### Step 4: README aligné et honnête

Badge et lien : « latest release » sans numéro codé en dur (ou dérivé) ; section
**Prerequisites** : macOS Apple Silicon 12.3+, Claude Code CLI ≥ 2.1.139,
Codex CLI (optionnel), pdftotext/poppler pour les fonctions PDF, MacTeX/TeX
Live pour la compilation LaTeX ; clarifier ce que « self-contained » couvre
(Node, Python) ; encadrer `xattr -cr` d'une note « temporaire, jusqu'à la
signature notariée ». Garde CI légère : une étape du workflow ci.yml qui échoue
si `README.md` contient un numéro de version différent de `tauri.conf.json`
(grep simple) — optionnelle, faire si < 30 min.

**Verify**: relecture ; aucun chiffre de version en dur restant
(`grep -n "1\.3\.6\|1\.4\.0" README.md` → 0 hors changelog éventuel).

### Step 5: épingler fix-path-env

`Cargo.toml:24` → ajouter `rev = "c4c45d503ea115a839aae718d02f79e7c7f0f673"`
(le commit déjà dans Cargo.lock).

**Verify**: `cargo check` exit 0 ; `Cargo.lock` inchangé sur ce paquet.

## Test plan

- Pas de tests unitaires nouveaux (config/docs) sauf le grep-guard optionnel.
- Smoke OBLIGATOIRE : app buildée → données présentes, appsnap s'exclut,
  TCC re-demandé UNE fois (attendu, le noter dans le rapport — c'est le coût
  unique du renommage, payé maintenant plutôt qu'après la première vente).

## Done criteria

- [ ] identifier `com.tofunori.atelier` partout ; aucun littéral orphelin
- [ ] Migration : projets/réglages survivent au renommage sur la machine de dev
- [ ] release.yml lit `docs/releases/<tag>.md` et échoue si absent
- [ ] README sans version en dur, avec Prerequisites complets
- [ ] fix-path-env épinglé par rev
- [ ] `plans/README.md` à jour

## STOP conditions

- Drift sur les excerpts.
- La migration app_data échoue partiellement (données mixtes dans les deux
  répertoires) : restaurer l'ancien identifiant et signaler.
- Découverte d'un autre consommateur de l'identifiant (URL scheme, appairage
  mobile) : lister et STOP avant de renommer.

## Maintenance notes

- Après CE plan : DIST-01/02 (Developer ID + entitlements + notarisation) puis
  DIST-04 (updater). L'ordre est contractuel — l'identifiant est l'identité TCC
  et updater.
- Toute nouvelle référence à l'identifiant passe par la config, jamais en dur.
