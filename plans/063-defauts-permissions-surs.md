# Plan 063: Des défauts de permission sûrs (fin du bypassPermissions d'usine)

> **Executor instructions**: Follow this plan step by step, verify each step.
> On a STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 49c52384..HEAD -- src/lib/settings.ts src/components/Chat.tsx rust/crates/atelier-providers/src/claude.rs rust/crates/atelier-gallery/src/gallery.rs rust/crates/atelier-gallery/src/documents.rs`

## Status

- **Priority**: P1
- **Effort**: S→M
- **Risk**: MED (changement de comportement visible)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `49c52384`, 2026-08-15

## Why this matters

Finding SEC-05 : l'app sort d'usine avec `bypassPermissions` — chaque agent
tourne SANS aucune barrière d'approbation sur le projet ouvert, et le backend
ajoute `--dangerously-skip-permissions` même quand le mode est absent de la
requête. Un dépôt cloné contenant des instructions hostiles obtient l'exécution
sans un clic. L'incohérence avec Codex (défaut `read-only`) montre que ce n'est
pas une décision assumée. S'y greffent deux durcissements S de la même famille
« un clic exécute » : SEC-06 (`/open-path` lance les `.app`/`.command` du
projet) et SEC-07 (nom de fichier commençant par `-` injecté comme option de
latexmk).

## Current state

- `src/lib/settings.ts:57` — `defaultPermissionMode: "bypassPermissions",`
- `src/components/Chat.tsx:225` — `useState("bypassPermissions")`.
- `rust/crates/atelier-providers/src/claude.rs:205-209` :
  ```rust
  let permission_mode = req.permission_mode.as_deref().unwrap_or("bypassPermissions");
  ```
- Contraste : `rust/crates/atelier-providers/src/codex.rs:105-113` — absence →
  `("read-only", "on-request")`.
- `rust/crates/atelier-gallery/src/gallery.rs:922-946` — `open_path` :
  sandbox de chemin OK puis `Command::new("open").arg(&full)` sans contrôle du
  type. Le même serveur applique une allowlist deux routes plus loin :
  `host.rs:73-80` (`NATIVE_FULLSCREEN_EXTS`).
- `rust/crates/atelier-gallery/src/documents.rs:105-115` — `basename` du
  fichier projet passé en dernier argv à `latexmk` sans `./` ni `--` ;
  `:167-170` idem pour `tectonic`.
- Réglages : les modes disponibles côté UI sont dans `Chat.tsx` (sélecteur) ;
  la migration de settings a un précédent — chercher `migrate` dans
  `src/lib/settings.ts` et imiter le motif existant.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Vitest front ciblé | `npx vitest run src/lib src/components --reporter=basic` | verts |
| Tests providers | `cd rust && cargo test -p atelier-providers` | verts |
| Tests gallery | `cd rust && cargo test -p atelier-gallery` | verts |

## Scope

**In scope** : `src/lib/settings.ts`, `src/components/Chat.tsx`,
`rust/crates/atelier-providers/src/claude.rs`,
`rust/crates/atelier-gallery/src/gallery.rs`,
`rust/crates/atelier-gallery/src/documents.rs`, clés i18n si un libellé change.

**Out of scope** :
- Kimi/Grok/opencode providers — vérifier seulement qu'ils ne fabriquent pas
  leur propre fallback dangereux ; s'ils le font, le NOTER dans le rapport
  final sans le corriger ici (scope créep).
- Toute UI d'explication/onboarding du choix (peut venir avec DIST-07).
- `sidecar/providers/claude.mjs` (backend Node de soak) — miroir à faire dans
  une passe séparée si le soak est encore vivant ; le signaler.

## Git workflow

- Branch: `advisor/063-defauts-permissions` ; commits `fix(security): …`.

## Steps

### Step 1: nouveau défaut côté réglages et UI

`settings.ts:57` → `defaultPermissionMode: "acceptEdits"`. `Chat.tsx:225` →
`useState("acceptEdits")`. Ajouter une migration de settings : si l'utilisateur
n'a JAMAIS touché le réglage (valeur absente du store persisté), il reçoit le
nouveau défaut ; si `bypassPermissions` a été explicitement enregistré, le
respecter (c'est un choix). Note de release à écrire dans le commit.

**Verify**: `npx tsc --noEmit` ; test unitaire : settings frais →
`defaultPermissionMode === "acceptEdits"` ; settings persistés avec bypass →
inchangé.

### Step 2: fallback backend aligné sur le plus restrictif

`claude.rs:205-209` : `unwrap_or("acceptEdits")` (le mode vient TOUJOURS de
l'UI en pratique ; le fallback ne couvre que les requêtes malformées — il doit
être sûr). Ajouter le test qui verrouille : « aucune combinaison d'entrée
absente ne produit `--dangerously-skip-permissions` ».

**Verify**: `cargo test -p atelier-providers` — nouveau test vert.

### Step 3: allowlist d'extensions sur open_path

`gallery.rs:922-946` : partager la liste de `host.rs` (extraire une constante
commune, ex. `OPENABLE_EXTS` dans un module partagé du crate) couvrant les
types légitimes de la galerie : images, pdf, vidéos, `.tex .md .py .r .ipynb
.csv .txt .json .svg`. Refuser bundles/exécutables : `.app .command .sh
.terminal .workflow .webloc` + tout fichier au bit exécutable. Réponse 403
`{error:"type non ouvrable"}`.

**Verify**: `cargo test -p atelier-gallery` — nouveau test : un `.command`
dans le projet → 403 ; un `.pdf` → 200 (mock de `open` : cfg(test) court-circuit
ou vérification en amont du spawn).

### Step 4: neutraliser l'injection d'options latexmk/tectonic

`documents.rs:105-115` et `:167-170` : passer `format!("./{basename}")`
(équivalent, `current_dir` est déjà posé). Refuser en amont tout nom commençant
par `-` (déjà couvert par `./` mais ceinture-bretelles + message clair).

**Verify**: `cargo test -p atelier-gallery` — test unitaire sur la construction
de l'argv : basename `-evil.tex` → argv contient `./-evil.tex`.

## Test plan

- 4 tests neufs (settings frais/persistés, fallback provider, open_path 403,
  argv `./`). Modèles : tests existants de `claude.rs` (bas du fichier) et de
  `gallery.rs`.
- Manuel : un chat neuf affiche « acceptEdits » dans le sélecteur ; une session
  existante de l'opérateur garde son mode.

## Done criteria

- [ ] Install fraîche → `acceptEdits` partout ; aucun chemin ne fabrique
      `--dangerously-skip-permissions` sans demande explicite
- [ ] `.command` du projet refusé par /open-path ; `.pdf` toujours ouvert
- [ ] argv latexmk/tectonic préfixé `./`
- [ ] cargo test ×2 + tsc + vitest ciblé verts ; `plans/README.md` à jour

## STOP conditions

- Drift sur les excerpts.
- La migration de settings s'avère impossible à distinguer (« jamais touché »
  vs « choisi bypass ») avec le format persisté actuel : STOP, proposer le
  schéma de migration plutôt que de deviner.
- Un test e2e existant dépend du mode bypass par défaut : le lister et STOP
  (décision d'adaptation à l'opérateur).

## Maintenance notes

- Tout nouveau provider DOIT définir son fallback explicitement — le test du
  step 2 sert de gabarit.
- Quand l'onboarding (DIST-07) arrivera, il expliquera ce choix à l'utilisateur
  au premier lancement ; ce plan n'attend pas ça.
