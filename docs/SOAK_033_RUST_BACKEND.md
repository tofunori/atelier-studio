# Soak plan 033 — backend Rust (Porte 11)

> **Statut** : soak **CLOS** — voir [`soak/033-COMPLETE.md`](soak/033-COMPLETE.md)
> (2026-08-16). Le repli chat `ATELIER_BACKEND=node` a été retiré de
> `src-tauri/src/sidecar.rs` (plan 065 phase A) ; il n'existe plus.
> `sidecar/` reste dans le dépôt (harnais vitest de référence + repli
> `ATELIER_KB_ENGINE=node`, soak séparé et **toujours ouvert**, plan 065
> phase C — ne pas le retirer pour cette raison-là).
>
> Le reste de ce document est conservé tel quel comme **trace historique** du
> soak (checklist, dates prévues) : les dates ci-dessous n'ont pas toutes été
> recochées manuellement item par item, voir `soak/033-COMPLETE.md` pour ce
> qui est vérifiable et ce qui ne l'est pas.

## Objectif

Prouver en usage réel que le sidecar **Rust par défaut** (Porte 10) est assez
stable pour retirer Node de la production (checklist « Retrait » du plan 033).

## Prérequis

```bash
cd ~/Documents/atelier-studio
# binaire chat
cargo build -p atelier-server --release --manifest-path rust/Cargo.toml
bash scripts/stage-rust-server.sh
# app (optionnel pour les items purement sidecar)
# suivre docs/PROTOCOLE_RELANCE.md puis npm run tauri build
```

**Ne pas** exporter `ATELIER_BACKEND=node` pendant le soak principal.

## Checklist soak minimal

Cocher au fil de l'eau ; dater chaque item.

| # | Critère | Comment prouver | Date | OK |
|---|---------|-----------------|------|----|
| S1 | ≥ 2 semaines d'usage normal, Rust défaut | journal perso / commits d'usage | | ☐ |
| S2 | 20 relances **release** sans orphelin | `npm run soak:sidecar` → ligne `COUNTS_FOR_S2=yes` (exige `target/release`) | | ☐ |
| S3 | Plusieurs projets + galeries simultanés | 2+ projets ouverts, galeries vivantes | | ☐ |
| S4 | Codex + Claude actifs en parallèle | 2 threads, providers distincts | | ☐ |
| S5 | Interrupt puis nouveau tour immédiat | UI Stop → renvoyer | | ☐ |
| S6 | Crash backend → reconnexion | `kill -9` pid sidecar, UI reconnecte | | ☐ |
| S7 | Ancien backend encore présent (upgrade) | app R10+ sur profil qui avait Node | | ☐ |
| S8 | Profil volumineux / long historique | threads + harness-history lourds | | ☐ |
| S9 | Aucun P0/P1 Rust ouvert | issues / notes ci-dessous | | ☐ |

### Notes / incidents

```
# date — symptôme — mitigation — P0/P1?
```

## Smoke automatisé (à chaque jour de soak)

```bash
# S2 officiel : 20 cycles sur le binaire **release** uniquement
cargo build -p atelier-server --release --manifest-path rust/Cargo.toml
npm run soak:sidecar
# attendu en fin de log : COUNTS_FOR_S2=yes

# Smoke debug (ne compte PAS pour S2) :
# SOAK_ALLOW_DEBUG=1 SOAK_ROUNDS=5 npm run soak:sidecar

# Politique défaut Rust encore en place
npm run check:backend-policy
# --strict-no-node exige le fichier signé docs/soak/033-COMPLETE.md
# (ATELIER_SOAK_COMPLETE=1 est volontairement ignoré)

# Corpus lecture seule (optionnel, deux backends si ports dispo)
# node sidecar/scripts/parity_ws_compare.mjs --node ws://… --rust ws://…
```

## Clôture soak → retrait Node

Quand **S1–S9** sont OK :

1. Créer `docs/soak/033-COMPLETE.md` avec date, signature Thierry, résumé incidents.
2. PR de retrait (lot séparé) :
   - retirer `stage-sidecar` / `stage-node-runtime` du `beforeBuildCommand` **chat**
     (la galerie Node peut rester jusqu'à bascule `ATELIER_GALLERY_BACKEND`) ;
   - retirer resources `sidecar` / `node-runtime` du chat si plus utilisés ;
   - retirer `ATELIER_BACKEND=node` du code Tauri ;
   - CI : `check:backend-policy --strict-no-node` (échec si Node chat embarqué) ;
   - conserver `sidecar/` en sources **uniquement** pour vitest de référence tant
     que des tests n'ont pas d'équivalent Rust (ou migrer les tests).
3. Ne **pas** supprimer `gallery/server` tant que la galerie n'est pas Rust défaut.

## Anti-patterns

- ❌ Basculer le soak sur `ATELIER_BACKEND=node` « pour avancer » sans le noter
- ❌ Retirer Node du bundle avant S1–S9
- ❌ Déclarer COMPLETE sans preuve S2 (20 relances) et S6 (crash recovery)
