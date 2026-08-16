# Soak plan 033/047 — backend chat Rust — COMPLETE

**Date de clôture** : 2026-08-16
**Signé par l'opérateur** :

## Ce qui est déclaré clos

Le soak du **backend chat** (`atelier-studio-server`, plan 033 Porte 10, checklist
détaillée dans [`../SOAK_033_RUST_BACKEND.md`](../SOAK_033_RUST_BACKEND.md) et
[`plans/047-soak-retrait-node.md`](../../plans/047-soak-retrait-node.md)). Ce
fichier est le marqueur exigé par `npm run check:backend-policy --
--strict-no-node` (voir [`README.md`](README.md)).

Ne couvre PAS : le moteur base de connaissances (`ATELIER_KB_ENGINE`, plan 065
phase C) ni le backend galerie (`ATELIER_GALLERY_BACKEND`, plan 065 phase B) —
ces deux soaks sont distincts et **restent ouverts** (voir « Ce qui n'est PAS
retiré » ci-dessous).

## Durée réelle constatée

Le défaut **Rust** pour le sidecar chat date du commit `8389719d` — **2026-07-11**
(« feat(tauri): Porte 10 — Rust défaut pour le sidecar chat »), vérifié via
`git log -1 --format=%ad 8389719d` : `Sat Jul 11 17:23:32 2026 -0400`.

> Correction par rapport à la consigne d'exécution initiale, qui mentionnait
> 2026-07-16 : cette date est celle de la bascule par défaut de la **galerie**
> (`gallery_backend_kind()` dans `src-tauri/src/atelier.rs`, commentaire
> « Défaut Rust (bascule 2026-07-16) »), un sous-système distinct. Le chat a
> basculé 5 jours plus tôt, le 2026-07-11. Vérifié dans `git log` avant
> rédaction de ce document, comme demandé.

Du 2026-07-11 au 2026-08-16 : **36 jours** (~5 semaines) en usage réel avec
Rust par défaut, soit au-delà du seuil minimal de 2-3 semaines fixé par
`SOAK_033_RUST_BACKEND.md` (S1) et `plans/047-soak-retrait-node.md` (Phase 0).

## Ce qui a été soaké (faits vérifiables dans git log)

- **2026-07-09** (`44c94d0c`) : durcissement pré-soak — boucle d'entre-tuerie
  du sidecar au premier lancement post-build corrigée (chmod TCC dans le
  bundle) avant même la bascule du défaut.
- **2026-07-11** (`8389719d`) : bascule du défaut chat vers Rust
  (`ATELIER_BACKEND` vide/`rust` → Rust ; `node` explicite = seul repli).
- **2026-07-11**, même jour (`0fbfc7ae`) : correctif de suivi « report live
  Rust providers and prefer bundled server » (fiabilisation de la sélection
  du binaire stagé vs. checkout local).
- **2026-07-11** (`e169745c`) : outillage de soak (Porte 11) —
  `scripts/check-backend-policy.mjs`, `npm run soak:sidecar`.
- **2026-07-12** (`1f705a28`) : CI — stage de toutes les ressources Tauri
  avant `cargo test` (préexistant ; retrouvé indépendamment pendant
  l'exécution de la phase A du plan 065, cf. vérification ci-dessous).
- Journal de soak du plan 047 (`plans/047-soak-retrait-node.md`, section
  « Journal du soak ») : une seule entrée, 2026-07-16, concernant la bascule
  **galerie** (pas le chat) — fallback utilisé : non, corrigé le jour même.
- Recherche `git log --grep="ATELIER_BACKEND"` et `--grep="sidecar"` sur la
  fenêtre 2026-07-11 → 2026-08-16 : aucun commit n'indique un usage du repli
  `ATELIER_BACKEND=node` en production ni une régression du backend chat Rust
  nécessitant un retour à Node.

## Ce qui n'a PAS été re-vérifié dans cette session

- La checklist manuelle S1–S9 de `SOAK_033_RUST_BACKEND.md` (usage
  multi-projets, Codex+Claude en parallèle, crash-recovery, etc.) n'a pas été
  recochée item par item ici — un agent exécutant la phase A n'a pas de moyen
  de constater l'usage réel vécu par l'opérateur. La clôture s'appuie sur (a)
  les faits vérifiables ci-dessus et (b) la décision opérateur déjà actée dans
  `plans/README.md` (ligne plan 061, 2026-08-15 : « objectif zéro Node — on va
  droit au plan 065 »), qui a explicitly choisi de ne pas attendre un cycle de
  clôture séparé.
- Le smoke automatisé S2 (`npm run soak:sidecar`, 20 relances sur binaire
  **release**) n'a pas été relancé dans cette session : il exige un build
  release + des relances de l'app packagée, hors du périmètre d'un harness
  d'agent (voir contrainte d'exécution de la phase A : pas de build Tauri
  complet ni `npm run tauri dev` depuis ce worktree).

## Incidents connus

Aucun incident ouvert. Le seul incident consigné dans les journaux de soak
(plan 047) concerne la bascule galerie du 2026-07-16 (grille vide, `/commitmsg`
405, `/latex-suggest` absent, `/data` sans garde d'origine — hors périmètre
chat), corrigé le jour même ; voir `plans/047-soak-retrait-node.md`.

Un défaut préexistant, sans rapport avec ce retrait, a été repéré pendant la
vérification de cette phase : `kb_block::tests::compose_inline_fiche_gbrain_et_strip`
(`rust/crates/atelier-runtime/src/kb_block.rs:497`) échoue car le commit
`83e5e162` (2026-08-16, plan 065 activation KB) a fait basculer
`with_kb_block_for_thread` sur `atelier-kb-rs` sans mettre à jour cette
assertion de test. Sans rapport avec le backend chat (module `kb_block.rs`,
hors périmètre de cette phase) — signalé séparément, non corrigé ici.

## Retrait acté par ce document

- `ATELIER_BACKEND=node` (repli chat Node, `sidecar/index.mjs`) est **retiré**
  de `src-tauri/src/sidecar.rs` (plan 065 phase A) : plus de branche
  `BackendKind::Node`, plus de résolution de `sidecar/index.mjs`, plus de
  lecture de la variable d'environnement `ATELIER_BACKEND`. Rust est
  désormais le seul backend chat, sans sélecteur.
- `scripts/stage-sidecar.sh` ne construit plus un runtime Node complet
  (`node_modules`, `providers/`, `package.json`) pour le chat — il ne reste
  stagé que la chaîne CLI base de connaissances (repli
  `ATELIER_KB_ENGINE=node`, soak séparé et **toujours actif**, plan 065
  phase C) et les wrappers agent encore résolus par du code Rust.

## Ce qui n'est PAS retiré (hors périmètre de ce document)

- `ATELIER_KB_ENGINE=node` (repli moteur base de connaissances,
  `rust/crates/atelier-runtime/src/ws_router.rs`) — soak commencé
  aujourd'hui même (2026-08-16, commit `83e5e162`), doit rester fonctionnel.
- `ATELIER_GALLERY_BACKEND=node` (repli backend galerie,
  `src-tauri/src/atelier.rs`) — plan 065 phase B, non commencée.
- Le runtime Node embarqué (`node-runtime`/`node-dist`) — encore nécessaire
  au backend galerie Node et au wrapper agent `atelier-gallery-tool`
  (`sidecar/atelier-gallery-tool`, résolu par
  `rust/crates/atelier-runtime/src/send.rs::with_gallery_tool_instruction`).
- `sidecar/` reste dans le dépôt en sources : les `*.test.mjs` et vitest
  restent des harnais de non-régression de référence (parité), et la chaîne
  KB `.mjs` reste la mise en œuvre du repli de soak plan 065 phase C.
