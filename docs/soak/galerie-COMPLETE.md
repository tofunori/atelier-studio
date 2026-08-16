# Soak galerie — COMPLETE

> Contrat PORTA-14 : reproduit pour la galerie ce que
> [`SOAK_033_RUST_BACKEND.md`](../SOAK_033_RUST_BACKEND.md) définit pour le
> chat. Ce fichier documente la fin du soak du backend galerie Rust
> (`atelier-gallery-server`) avant retrait des fallbacks Node et Python
> (plan `065-retrait-node.md`, Phase B).

## Date

Rédigé le **2026-08-16**.

## Date réelle de bascule (confirmée)

**2026-07-16.** Deux sources indépendantes concordent :

1. Commentaire dans le code au moment de l'exécution de cette phase :
   `src-tauri/src/atelier.rs` — `// Défaut Rust (bascule 2026-07-16) —
   fallback soak : ATELIER_GALLERY_BACKEND=node`.
2. Le commit qui a effectivement basculé le `match` de
   `gallery_backend_kind()` (`_ => GalleryBackend::Node` →
   `_ => GalleryBackend::Rust`) est `b52cf2bc` (Thierry, 2026-07-16 12:34:34
   -0400). Le message de commit (« auto: Mettre à jour l'index des figures »)
   est un libellé d'auto-commit générique — le diff réel montre la bascule
   sans ambiguïté (voir aussi la leçon mémoire « Auto-commits galerie
   balaient le worktree »).

Aucun commit entre le 2026-07-16 et le 2026-08-16 ne repasse le `match` par
défaut sur `Node` ou `Python` ; aucune trace de bascule manuelle
`ATELIER_GALLERY_BACKEND=node` n'a été trouvée dans l'historique
(`git log` sur la période, recherche par mot-clé).

## Durée du soak

**2026-07-16 → 2026-08-16 : 31 jours** en Rust par défaut, sans repli.

## Incidents connus

Seule source consignée : le journal du soak de `plans/047-soak-retrait-node.md` :

| Date | Incident | Fallback utilisé ? | Résolution |
|---|---|---|---|
| 2026-07-16 | Bascule galerie : grille vide (collision cmux sur `figures_index.html`), `/commitmsg` 405, `/latex-suggest` absent, `/data` sans garde d'origine | non | corrigés le jour même (coquille live rendue en mémoire depuis le template bundlé, `/commitmsg` passé en GET, port du process chaud latex-suggest aligné, middleware de garde d'origine plan 005 ajouté) |

Aucun autre incident n'est consigné dans les journaux disponibles
(`plans/047-soak-retrait-node.md`, historique git, plans référençant
`gallery/server/tests/parity.mjs` ou `atelier-gallery-server`) entre le
2026-07-16 et le 2026-08-16. Cette absence de trace ne remplace pas un usage
réel attesté : voir la ligne de signature ci-dessous.

## Endpoints portés

Le serveur `atelier-gallery-server` (`rust/crates/atelier-gallery/src/main.rs`,
construction du `Router` dans `async fn main()`, table `.route(...)` à partir
de la ligne ~2062) sert l'intégralité de la surface HTTP de la galerie —
c'est la liste vivante faisant foi, résumée ici par catégorie (ne pas
dupliquer cette liste ailleurs sans la faire vivre) :

- **Coquille et cycle de vie** : `/`, `/figures_index.html`, `/ping`,
  `/health`, `/rev`, `/data`, `/rescan`, `/state` (GET/POST).
- **Fichiers et éditeurs** : `/ls`, `/snippet`, `/raw`, `/code`, `/codesave`,
  `/save-svg`, `/statfile`, `/texroot`, `/findscript`, `/findfile`,
  `/selinfo`, `/lint`.
- **Galerie / figures** : `/thumb`, `/rasterize`, `/delete`, `/export`,
  `/export-png`, `/open`, `/save` (annotations), `/regenerate`,
  `/provenance`.
- **Git** : `/githead`, `/gitlog`, `/gitshow`, `/commitmsg`, `/gitcommit`,
  `/versions` (GET/POST).
- **LaTeX / documents** : `/latex-suggest`, `/compile`, `/synctex`.
- **Notes et tableau blanc** : `/notes/load`, `/notes/save`, `/board/load`,
  `/board/save`, `/board/poll`, `/board/command`, `/notes/open-surface`,
  `/board/open-surface`.
- **Zotero** : `/zotero-items`, `/zotero-collections`, `/zotero-fav`,
  `/zotero-add`, `/zotero/{key}/{fname}`, `/kb-pdf/{id}`.
- **Agents (sélection, annotations, événements)** : `/claude-targets`,
  `/quote` (GET/POST), `/clear-quote`, `/agent-events`, `/claude-events`,
  `/agent-event`, `/claude-event`, `/agent-status`, `/agent-selection`,
  `/agent-consumers/register`, `/agent-selections`,
  `/agent-selections/ack`, `/agent-annotations/release`,
  `/agent-annotations/delete`, `/agent-annotations/restore`,
  `/agent-annotations/status`, `/agent-preferences`,
  `/agent-batches/release`, `/agent-batches/cancel`.
- **Divers** : `/orca-fullscreen-exit`.

Couverture de non-régression : `rust/crates/atelier-gallery/tests/http_smoke.rs`
(9 tests intégration, backend Rust réel, aucun process Python) +
`rust/crates/atelier-gallery/src/**` (30 tests unitaires) + garde d'origine
plan 005 + `gallery/server/tests/diff_suite.mjs` (183 tests, assets/éditeurs)
+ `gallery/server/tests/parity.mjs` (parité historique Node↔Python, conservée
en local — voir note ci-dessous).

Note de portée : la comparaison Node↔Python de `parity.mjs` ne couvre qu'un
sous-ensemble legacy des routes ci-dessus (celles qui existaient déjà côté
Node au moment du portage). Les routes ajoutées depuis au serveur Rust
(board, zotero étendu, agent-events/selections/batches, compile/synctex,
versions, etc.) n'ont jamais eu d'équivalent Node testé — elles sont
Rust-natives depuis leur création.

## Fallback retiré dans cette même phase

`ATELIER_GALLERY_BACKEND` / `ATELIER_GALLERY_ENGINE` et les variantes
`GalleryBackend::{Node, Python}` de `src-tauri/src/atelier.rs` sont retirés
par le plan 065 Phase B (commit(s) de cette branche). Il n'existe plus de
sélecteur d'environnement pour revenir à Node/Python au runtime de l'app —
le repli, s'il devait être nécessaire, exigerait de revenir sur ce commit.

## Signature

Validation humaine de l'usage réel (workflows galerie, cohabitation cmux,
absence de régression ressentie) :

Signature : _______________________  Date : ___________
