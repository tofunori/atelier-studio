# Plan 065: Retrait complet de Node — Rust seul au runtime (chantier 1.x)

> **Executor instructions**: plan de DIRECTION en 4 phases livrables séparément.
> Chaque phase suit son propre cycle exécution→revue. Ne jamais entamer une
> phase avant que la précédente soit DONE et soakée. Drift check par phase :
> `git diff --stat <planned-at>..HEAD -- <paths de la phase>`.

## Status

- **Priority**: P2 (après la v1 commercialisable — NE PAS bloquer la signature)
- **Effort**: L (2-4 semaines réparties)
- **Risk**: MED (parité fonctionnelle KB)
- **Depends on**: soak chat Rust acté (plan 047), soak galerie Rust (PORTA-14)
- **Category**: tech-debt / architecture
- **Planned at**: commit `9217a839`, 2026-08-15

## Why this matters

Le runtime Node embarqué pèse **108 Mo** dans le bundle, impose les
entitlements `allow-jit`/`unsigned-executable-memory` à la notarisation (le
point le plus risqué de DIST-02), maintient une surface CVE npm au runtime, et
surtout perpétue la taxe « toute fonctionnalité portée en double » (mjs + rs).
État vérifié le 2026-08-15 : le terminal est DÉJÀ Rust (`portable-pty`,
`rust/crates/atelier-workspace/src/term.rs`) ; le serveur Rust n'invoque plus
que DEUX points d'entrée Node : `kb_cli.mjs` et `kb_prompt.mjs` (grep des
`.mjs` dans `rust/crates`), qui tirent ~2 500 lignes
(`knowledge.mjs`, `article.mjs`, `article_meta.mjs`, `zotero_passages.mjs`,
`csv_digest.mjs`). Rien de structurellement lié à Node.

## Phase A — Acter le retrait du sidecar chat (S)

Le plan `047-soak-retrait-node.md` existe et définit le contrat de soak
(`scripts/check-backend-policy.mjs`, fichier `docs/soak/033-COMPLETE.md`).
Exécuter ce plan tel quel : vérifier le critère de soak, puis retirer le spawn
sidecar Node de `src-tauri/src/sidecar.rs` et `stage-sidecar.sh` du
beforeBuildCommand. GARDER `sidecar/` dans le repo tant que la phase C n'a pas
porté les .mjs (ils y vivent).

**Done**: l'app buildée ne contient plus `Resources/sidecar` ; protocole de
relance vert ; `ATELIER_BACKEND=node` documenté comme retiré.

## Phase B — Retirer les serveurs galerie Node et Python (S-M)

Motif PORTA-14 : reproduire le contrat de soak du chat pour la galerie
(fichier `docs/soak/galerie-COMPLETE.md` signé après N jours sans bascule).
Puis : supprimer `GalleryBackend::{Node,Python}` de `src-tauri/src/atelier.rs`
(:94-105, :320-333), restreindre `scripts/stage-gallery.sh` à `assets/` + UI
construite (exclure `gallery/server/`), archiver `gallery/server/routes/*.mjs`.
ATTENTION : `gallery/server/tests/*` (diff_suite, parity) restent — ce sont des
harnais de test des ASSETS, pas du serveur ; vérifier leurs imports avant.

**Done**: bundle sans `gallery/server` ; `diff_suite` et e2e verts ;
`ATELIER_GALLERY_BACKEND` retiré.

## Phase C — Porter la chaîne KB en Rust (L, le cœur)

1. **Spike d'inventaire (1 j, AVANT tout code)** : cartographier ce que
   `knowledge.mjs`/`kb_cli.mjs` utilisent réellement — stockage (JSON ?
   SQLite ?), ranking, appels réseau (MinerU, Crossref), spawns (pdftotext,
   ssh gbrain). Sortie : liste de commandes CLI × entrées/sorties JSON.
2. **Fixtures de parité D'ABORD** : geler pour chaque commande de `kb_cli.mjs`
   des paires entrée→sortie réelles (motif : `gallery/server/tests/parity.mjs`
   et `033-parity-matrix.md`). C'est le contrat ; le port ne commence pas sans.
3. **Sauvegarde du store KB** avant toute activation du moteur rust :
   copie datée du répertoire de données KB, vérifiée, conservée jusqu'à la fin
   du soak (décision opérateur 2026-08-15, question des risques).
4. **Crate `atelier-kb`** : porter commande par commande —
   `rusqlite`/serde_json pour le store, `reqwest` (déjà en arbre) pour
   MinerU/Crossref, spawns inchangés (pdftotext, gbrain restent des binaires
   externes). `kb_cli_run`/`kb_cli_stream` (`ws_router.rs`) basculent vers un
   appel in-process (plus de spawn du tout) derrière un flag
   `ATELIER_KB_ENGINE=node|rust` pendant le soak.
4. **Wrappers agents** : `sidecar/atelier-kb` et `atelier-zotero-passages`
   deviennent de petits binaires Rust (modèle : `atelier-gallery-tool` Rust
   déjà stagé dans rust-server-dist). Les chemins injectés dans les prompts
   (`kb_block.rs:280`, `send.rs:47-49`) ne changent pas de nom.
5. **Soak KB** : N jours en `rust` par défaut avec repli `node` documenté,
   puis suppression des .mjs et du flag. ATTENTION (constat vague 4,
   KBG-02) : `ATELIER_KB_ENGINE=rust` ne bascule QUE les appels in-process
   du serveur (`ws_router.rs` — kbAdd, kbSourceText, gbrainSearch, etc.).
   Les wrappers agents `sidecar/atelier-kb`/`sidecar/atelier-zotero-passages`
   restent des scripts shell qui `exec node kb_cli.mjs …`
   INCONDITIONNELLEMENT, flag ou pas — et c'est PAR CE CHEMIN que les
   agents lancent `search`/`kb-text`/`article-import` (prompt
   `<atelier-kb>`, `kb_block.rs:280`). Tant que l'étape 4 (wrappers Rust)
   n'est pas faite, un soak en `rust` n'exerce donc PAS `search` en usage
   réel — seulement la surface UI. Ordonner l'étape 4 avant ou pendant le
   soak, jamais après, sous peine de « soaker » une commande qui ne tourne
   jamais réellement sur le moteur rust.

**Done**: fixtures de parité 100 % vertes sur l'engine rust (couvre le
CONTRAT CLI, pas l'usage réel) ; zéro `.mjs` invoqué depuis `rust/crates`
(grep) ; wrappers agents (`sidecar/atelier-kb`,
`sidecar/atelier-zotero-passages`) basculés sur les binaires Rust AVANT que
le soak ne soit déclaré concluant — sinon `search` (la commande la plus
utilisée par les agents) n'a jamais tourné sur le moteur rust pendant le
soak ; import d'article + épinglage + passages Zotero vérifiés dans l'app,
PAR LES DEUX CHEMINS (UI et wrapper agent).

## Phase D — Retirer le runtime Node du bundle (S)

Après C soaké : retirer `node-runtime` de `tauri.conf.json` resources et
`stage-node-runtime.sh` du beforeBuildCommand ; purger `ATELIER_NODE_BIN`
(plan 061 devient historique) ; simplifier les entitlements à la release
suivante (retirer `allow-jit`/`unsigned-executable-memory` si aucun autre
binaire n'en a besoin — node-pty a disparu avec le sidecar). Mesurer le bundle
avant/après (attendu : ~−108 Mo).

**Done**: DMG allégé, notarisation verte avec entitlements réduits, smoke Mac
vierge (KB fonctionnelle sans Node système — reprend le smoke du plan 061).

## STOP conditions (toutes phases)

- Une fixture de parité diverge sans explication fonctionnelle → STOP, ne pas
  « ajuster la fixture ».
- Découverte d'un troisième point d'entrée Node non inventorié → retour au
  spike.
- Le soak révèle une régression KB → rester sur le flag, ne pas supprimer.

## Maintenance notes

- Règle post-phase C : toute nouvelle fonctionnalité KB s'écrit UNE fois, en
  Rust. La mémoire « features à porter en double » devient caduque.
- Interactions : plans 060/061 restent utiles pendant la transition (sonde,
  env var) et se simplifient d'eux-mêmes en phase D.
