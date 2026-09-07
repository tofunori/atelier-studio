# Plan 077 : Un onglet galerie périmé ne peut plus écraser les favoris, notes et tags posés ailleurs

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- rust/crates/atelier-gallery/src/main.rs gallery/assets/gallery_template.html gallery/server/tests`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

L'état de la galerie (favoris, notes, tags, collections, workflow, filtres) vit
dans `.fig_state.json`. La page galerie le charge une fois puis, à chaque
changement, **renvoie tout son snapshot** par `POST /state` ; le serveur
réécrit le fichier à partir de ce corps, en ne repêchant que six clés de
réglages. Un favori posé depuis l'app (`toggle_favorite`, qui relit et ne touche
que `favs` — son commentaire décrit exactement le danger), une annotation, une
note posée par un agent : tout est effacé au prochain `POST /state` d'un onglet
resté ouvert avec son ancien snapshot. Après ce plan, le fichier porte une
version, le client renvoie celle qu'il a lue, et un snapshot périmé est refusé
(`409`) puis rechargé et refusionné côté client — le pattern
lire-fusionner-réécrire de `toggle_favorite`, généralisé.

## Current state

- `rust/crates/atelier-gallery/src/main.rs:203-274` `async fn save_gallery_state(State(state), headers, Json(value))` : `request_allowed`, refus si non-objet ou > 8 Mio, `sanitize_gallery_state(&value)`, puis pour `["fileTypes","pinnedTypes","filePresets","presentation"]` et `["texAutoRewrap","texAutoCompile"]` : si absents du corps, relire `.fig_state.json` et conserver ; `retain(!null)` ; `atomic_write_json(&root.join(".fig_state.json"), &sanitized)` ; réponse `{ok, favs, ratings, hidden}` (compteurs).
- `main.rs:178` `fn default_gallery_state()` → `{"favs":[],"ratings":{},"hidden":[],"tags":{},"hideRules":[],"collections":{},"workflow":{}}` (les clés de filtre restent absentes par défaut : absent = « jamais choisi »).
- `main.rs:282-330` `async fn toggle_favorite` : relit `.fig_state.json`, modifie `favs` seulement, réécrit — **le pattern à généraliser**.
- `main.rs:349` `fn sanitize_gallery_state(request: &Value) -> Value`.
- Client `gallery/assets/gallery_template.html:1130-1140` `function pushState()` : ne poste jamais avant le chargement initial (`stateLoaded`), debounce, corps `{favs, ratings, hidden, tags, hideRules, collections, workflow, fileTypes: …|null, …}` ; chargement `fetch('/state')` l.1176 qui fusionne l'état reçu dans les variables locales.
- Tests : `main.rs` a deux modules `#[cfg(test)]` (l.2179, 2205) ; aucun test sur `save_gallery_state`/`toggle_favorite` (grep). Les tests galerie Node (`gallery/server/tests/*.test.mjs`, `diff_suite.mjs`) couvrent le template ; **lire `docs/PIEGES_CONNUS.md` avant de toucher au template**.
- Contrainte documentée dans le code : « clé absente = pas touchée » pour les filtres — à conserver ; `null` explicite = réinitialiser (`retain(!null)` après fusion).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests galerie Rust | `cargo test -q -p atelier-gallery --manifest-path rust/Cargo.toml` | `test result: ok` |
| Template | `cd gallery && node server/tests/parity.mjs && node server/tests/diff_suite.mjs` | ok |
| Syntaxe template | `node -e '…vm.Script sur chaque <script> inline de gallery_template.html…'` (voir `docs/PIEGES_CONNUS.md` ou les plans précédents) | `ok` |

## Scope

**In scope**: `rust/crates/atelier-gallery/src/main.rs` (`save_gallery_state`, `gallery_state`, `toggle_favorite` si besoin d'aligner la version, un nouveau module de tests), `gallery/assets/gallery_template.html` (`pushState`, chargement `/state`, gestion du `409`), un test `gallery/server/tests/state_version.test.mjs` (créer).
**Out of scope**: `/save-annotation`, `/pdfannot` et tout autre endpoint ; le format des clés métier ; le viewer PDF.

## Git workflow

Branche `advisor/077-etat-galerie-version` ; commits Rust puis template ; ne pas pousser.

## Steps

### Step 1 : Version dans le fichier et dans `GET /state`
Le serveur ajoute/incrémente `"rev": <u64>` à chaque écriture de `.fig_state.json` (dans `save_gallery_state` **et** `toggle_favorite`, et toute autre écriture : `grep -n "fig_state.json" rust/crates/atelier-gallery/src/main.rs`). `GET /state` le renvoie tel quel. Un fichier sans `rev` vaut `0`.
**Verify**: `cargo build -q --manifest-path rust/Cargo.toml` → exit 0.

### Step 2 : Fusion par présence + refus des snapshots périmés
Dans `save_gallery_state` : (a) relire le fichier courant (`current`) ; (b) si le corps porte `"rev"` et qu'il diffère de `current.rev` → répondre `409 Conflict` `{"error":"state_stale","rev": current.rev, "state": current}` sans écrire ; (c) sinon, **pour chaque clé présente** dans le corps sanitisé, remplacer la valeur de `current` (une clé absente n'est pas touchée — c'est déjà la sémantique des six clés repêchées, généralisée ; `null` explicite = retrait, comme aujourd'hui via `retain`), incrémenter `rev`, écrire, répondre avec les compteurs **et** le nouveau `rev`. Un corps sans `rev` (client ancien) reste accepté en fusion par présence (pas de 409) — documenter que c'est une transition.
**Verify**: `cargo build -q` → exit 0.

### Step 3 : Tests Rust
Nouveau module `#[cfg(test)]` près des deux existants : construire un `AppState` sur `tempdir` (voir comment `main.rs:2366` construit `AppState { … }` et les tests l.2179/2205), puis (a) POST avec `favs` seulement → `tags`/`collections` existants conservés ; (b) POST avec un `rev` périmé → `409` et fichier inchangé ; (c) deux POST successifs avec le bon `rev` → `rev` incrémenté de 1 à chaque fois ; (d) `toggle_favorite` puis POST d'un ancien snapshot sans `rev` → le favori survit (fusion par présence : le corps porte `favs`… **attention** : dans ce cas le corps porte bien `favs` et l'écrase — c'est précisément pourquoi le `rev` est nécessaire ; écrire le test avec `rev` périmé → 409, et documenter que sans `rev` l'écrasement de `favs` reste possible pendant la transition).
**Verify**: `cargo test -q -p atelier-gallery --manifest-path rust/Cargo.toml state` → tests verts.

### Step 4 : Client — porter le `rev`, gérer le `409`
Dans `gallery_template.html` : conserver `stateRev` reçu par `GET /state` ; `pushState()` l'envoie dans le corps ; sur `409`, recharger `/state`, refusionner l'état serveur dans les variables locales (mêmes règles que le chargement initial l.1176 : le serveur fait foi pour ce que l'onglet n'a pas modifié), poser `stateRev`, puis rejouer **une fois** le `POST` ; si nouveau `409`, afficher un message discret dans la zone de statut existante (« État rechargé depuis le disque ») et abandonner l'écriture. Toujours mettre `stateRev` à jour à partir de la réponse `200`.
**Verify**: contrôle de syntaxe des scripts inline → `ok` ; `cd gallery && node server/tests/parity.mjs && node server/tests/diff_suite.mjs` → ok.

### Step 5 : Test du template
`gallery/server/tests/state_version.test.mjs` (node:test, modèle `theme_contract.test.mjs`) : le corps de `pushState` contient `rev` ; le gestionnaire de `409` existe (regex sur le source) ; `stateRev` est posé au chargement.
**Verify**: `cd gallery && node --test server/tests/state_version.test.mjs` → pass.

## Done criteria

- [ ] `cargo test -q -p atelier-gallery --manifest-path rust/Cargo.toml` → ok, ≥ 3 tests de plus.
- [ ] `grep -n '"rev"' rust/crates/atelier-gallery/src/main.rs` → présent dans lecture, écriture et 409.
- [ ] Suites galerie Node ok ; syntaxe template ok.
- [ ] `git status --short` limité au scope.

## STOP conditions

- Une autre route écrit `.fig_state.json` sans passer par un point commun et l'ajout du `rev` exige de la refactorer au-delà du scope — rapporte la liste des écritures.
- La fusion par présence change le résultat d'un test Node existant du template (`diff_suite`) — rapporte le test.
- Le chargement initial `/state` (l.1176) fusionne déjà différemment de ce que l'étape 4 suppose — décris l'écart avant de coder.

## Maintenance notes

- `rev` est un compteur de fichier, pas un horodatage : ne jamais le dériver de `mtime`.
- Reviewer : vérifier qu'un `409` ne fait pas perdre une modification locale non encore envoyée (elle doit être refusionnée puis renvoyée), et qu'aucune boucle 409 infinie n'est possible (une seule relance).
