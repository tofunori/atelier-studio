# Plan 047 : Soak des backends Rust puis retrait du runtime Node embarqué

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git log --oneline -5 -- scripts/stage-rust-server.sh scripts/stage-sidecar.sh scripts/stage-node-runtime.sh src-tauri/src/sidecar.rs src-tauri/src/atelier.rs sidecar/gallery_tool_cli.mjs sidecar/zotero_passages.mjs`
> Si un fichier in-scope a bougé depuis l'écriture du plan (2026-07-16),
> comparer les extraits « état courant » ci-dessous au code vivant avant de
> continuer.

## Contexte (2026-07-16)

Les deux backends tournent en Rust par défaut :

- **Chat** : `atelier-studio-server` (plan 033) ; fallback soak
  `ATELIER_BACKEND=node` ([sidecar.rs](../src-tauri/src/sidecar.rs)).
- **Galerie** : `atelier-gallery-server` (bascule 2026-07-16) ; fallback
  `ATELIER_GALLERY_BACKEND=node` ([atelier.rs](../src-tauri/src/atelier.rs)).
  Fermé à la bascule : `/latex-suggest` (process chaud haiku,
  `suggest.rs`), `/commitmsg` en GET, cache-bust `?v=BUNDLE_HASH`, garde
  d'origine global (plan 005) en middleware, coquille live `/` +
  `/figures_index.html` servie depuis le template bundlé (immunisée contre
  l'écrasement du fichier disque par cmux — collision vécue le jour même).

Ce qui reste embarqué en Node dans le bundle (`Atelier.app/Contents/Resources`) :

| Composant | Taille | Rôle actuel |
|---|---|---|
| `node-runtime/` | ~108 Mo | exécuter les fallbacks + les outils agent |
| `sidecar/` (Node complet) | ~46 Mo | fallback soak chat |
| `gallery/server/*.mjs` | (dans gallery/ ~16 Mo) | fallback soak galerie |
| `rust-server/{gallery_tool_cli,zotero_passages,zotero_passage_cli}.mjs` + wrappers | ~16 Ko | **outils agent au runtime** (référencés par les prompts, `send.rs`) |

But du plan : après une période de soak concluante, retirer tout Node du
bundle (~−170 Mo, zéro zombie Node possible, fin de la double maintenance
mjs/rs).

## Phase 0 — Soak (aucun code ; démarré 2026-07-16)

Critères de sortie, TOUS requis :

- [ ] **2 à 3 semaines d'usage réel** sans avoir eu besoin de
      `ATELIER_BACKEND=node` ni `ATELIER_GALLERY_BACKEND=node`. Tout usage
      d'un fallback = bug à corriger côté Rust, et le compteur repart.
- [ ] **Checklist workflows couverte au moins une fois chacun** :
  - chat : tours Claude / Codex / Grok, steering en cours de tour, queue,
    mode plan, permissions Ask, interruption, reprise de session, handoff ;
  - rendu : todos, diff immédiat Edit/Write, ticker tokens, libellés Bash ;
  - galerie : grille + filtres + favoris, rescan, thumbs, diff/versions
    (`diff_versions.js`), commit IA (`/commitmsg`), ghost-text
    (`/latex-suggest`), compile LaTeX + synctex, export PNG/zip, annotations
    PDF + quote → Claude, sélection live (`/selinfo`), boards/notes, Zotero ;
  - cohabitation cmux ouverte sur le même projet (la coquille live doit
    rester saine).
- [ ] **Redaction du journal Rust atterrie** (tâche parallèle en cours le
      2026-07-16) : parité `sanitizeForWrite` — dernier trou sécurité connu.
- [ ] Incidents consignés ci-dessous (section Journal du soak) ; aucun
      incident ouvert.

## Phase 1 — Porter les outils agent Node → Rust

`send.rs` injecte dans les prompts les chemins de `atelier-gallery-tool` et
`atelier-zotero-passages` (wrappers shell → `node …/*.mjs`). Les porter en
binaires Rust au **contrat CLI identique** (mêmes argv, même JSON stdout —
les prompts et les agents ne doivent voir aucune différence) :

1. `atelier-gallery-tool show --project-root <root> -- <fichiers…>`
   (source : `sidecar/gallery_tool_cli.mjs`).
2. `atelier-zotero-passages search --pdf … --zotero-key … --query … --limit 5`
   (source : `sidecar/zotero_passages.mjs` + `zotero_passage_cli.mjs`).
3. Stage : remplacer les .mjs par les binaires dans
   `scripts/stage-rust-server.sh` ; supprimer la copie des .mjs.

Vérification : exécuter chaque binaire sur un cas réel et diff du JSON avec
la version Node ; `cargo test` des nouveaux crates/bins ; un tour agent réel
qui affiche des figures dans la galerie.

## Phase 2 — Retirer le fallback chat Node

1. `src-tauri/src/sidecar.rs` : supprimer la branche `ATELIER_BACKEND=node`
   (log explicite « fallback retiré, plan 047 » si la variable est posée).
2. `src-tauri/tauri.conf.json` : retirer `stage-sidecar.sh` et
   `stage-node-runtime.sh` du `beforeBuildCommand` **seulement après la
   phase 1** (le node-runtime sert encore aux outils agent sinon).
3. Le code `sidecar/` reste dans le repo (tests vitest = harnais de
   non-régression du contrat d'événements) mais gèle : plus d'obligation de
   double implémentation pour les nouvelles features — mettre à jour
   [atelier-rust-backend-default](mémoire projet) et CLAUDE.md.

## Phase 3 — Retirer le serveur galerie Node du bundle

1. `scripts/stage-gallery.sh` : exclure `server/` du rsync (les **assets**
   — templates, éditeurs, cm6 — restent : le serveur Rust les sert).
2. `src-tauri/src/atelier.rs` : supprimer la branche `GalleryBackend::Node`
   (et `Python`), garder l'erreur claire si `ATELIER_GALLERY_BACKEND` est posé.
3. `package.json` : `test:gallery:parity` (Node↔Python) devient obsolète —
   le retirer du pipeline et documenter que la parité vit dans
   `rust/crates/atelier-gallery/tests/http_smoke.rs` (l'étendre si un
   comportement n'est couvert que par parity.mjs).

## Phase 4 — Retirer le node-runtime

1. Vérifier qu'AUCUN spawn Node ne reste au runtime :
   `grep -rn "node-runtime\|node " src-tauri/src rust/crates --include="*.rs" | grep -v test`
   → uniquement des références mortes/documentaires.
2. Retirer `stage-node-runtime.sh` du build + le dossier des resources.
3. Build + mesure : `du -sh …/Atelier.app/Contents/Resources` avant/après —
   attendu ≈ −170 Mo.

## Phase 5 — Nettoyage documentaire

- `docs/PROTOCOLE_RELANCE.md` : kill list sans les variantes Node ;
  supprimer la mention des fallbacks.
- `CLAUDE.md` (projet) : retirer les règles spécifiques au sidecar Node.
- Mémoires projet : mettre à jour [Backends par défaut = Rust] (plus de
  double implémentation) ; garder la leçon de la collision cmux.

## STOP conditions

- Un fallback Node est utilisé pendant le soak → corriger côté Rust,
  documenter dans le journal, **recommencer la phase 0**.
- Un outil au runtime dépend encore de Node à la phase 4 → ne pas retirer
  le node-runtime ; revenir en phase 1.
- `test:gallery:parity` couvre un comportement absent de `http_smoke.rs`
  → porter le test AVANT de retirer le serveur Node galerie.
- Tout échec de build/relance qui ne suit pas le protocole → PROTOCOLE_RELANCE.md.

## Journal du soak

| Date | Incident / observation | Fallback utilisé ? | Résolution |
|---|---|---|---|
| 2026-07-16 | Bascule galerie : grille vide (collision cmux sur `figures_index.html`), `/commitmsg` 405, `/latex-suggest` absent, `/data` sans garde d'origine | non | corrigés le jour même (coquille live, GET, port du process chaud, middleware origine) |

## Vérification finale (après phase 5)

```bash
npx tsc --noEmit && npx vite build
(cd sidecar && npx vitest run)          # contrat d'événements (harnais gelé)
cargo test --manifest-path rust/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
# relance protocolaire puis :
pgrep -fl "node" | grep -i atelier      # attendu : AUCUN process Node Atelier
du -sh src-tauri/target/release/bundle/macos/Atelier.app/Contents/Resources
```
