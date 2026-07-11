# Plan 013: Préparer une distribution partageable sur un Mac propre

> **Executor instructions**: charger `/efficient-fable`. Commencer par un spike
> et une décision humaine. Ne télécharger, embarquer, signer, notariser ou publier
> aucun runtime avant validation design/licences.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- src-tauri/src/bin_resolver.rs src-tauri/src/atelier.rs src-tauri/src/sidecar.rs src-tauri/tauri.conf.json scripts/stage-sidecar.sh .github/workflows/release.yml README.md`

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 008, 022
- **Category**: direction / distribution
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

README dit « fully self-contained », mais `bin_resolver.rs:58-62` exige Node
système et la release annonce Node >=20, app non signée et xattr. Cela convient
au développement, pas au partage avec des chercheurs externes.

## Scope

**Phase A in scope**: document de décision, mesures du bundle actuel, prototype
jetable hors ressources finales, validation des licences/checksums et parcours
sur Mac/compte propre.

**Phase B in scope après approbation uniquement**: résolution Node Rust, staging
du runtime choisi, resources/config Tauri, setupStatus, workflows release,
onboarding et README.

**Out of scope**: publication publique, dépôt de secrets, support Windows/Linux,
promesse Intel sans matrice CI dédiée, embarquement des comptes ou credentials
Claude/Codex.

## Phase A — spike, aucun code produit

Créer `docs/distribution-decision.md` avec matrice:

- Node embarqué vs sidecar compilé vs Node requis;
- taille app/DMG, temps CI, arm64/Intel;
- node-pty natif;
- mises à jour sécurité runtime;
- licences/NOTICE, provenance/checksum;
- signature/notarisation et secrets CI;
- CLIs Claude/Codex externes + onboarding.

Prototype au maximum jetable hors bundle final. Recommandation approuvée par
Thierry avant Phase B. Pour usage personnel, Node documenté peut être préférable.

## Phase B — seulement si décision embed Node

1. Script déterministe: runtime versionné, checksum vérifié, copie minimale.
2. `node_bin()` préfère embedded, fallback système dev.
3. setupStatus indique runtime bundled/version.
4. Adapter cache CI/resources; garder node-pty darwin-arm64.
5. Tester compte/Mac propre sans Homebrew/Node, CLIs absents puis présents;
   onboarding explicite, aucun crash.
6. Signature/notarisation workflow séparé avec secrets, jamais repo/logs.
7. RC privée 2–3 chercheurs avant public.

## Acceptance matrix

- Lancement depuis Applications sur Mac propre.
- Sidecar/galerie sans Node système si embed.
- Absence CLIs affiche onboarding.
- Surlignages, galerie, PDF, terminal, Zotero optionnel, historique survivent.
- verify + smoke Tauri avant packaging.
- Signature/notarisation vérifiées si externe.
- README sans contradiction.

## Done criteria

- [ ] Phase A produit une matrice chiffrée et une recommandation approuvée.
- [ ] Si Node requis est conservé, README/onboarding le disent sans ambiguïté.
- [ ] Si Node est embarqué, checksum/licence/version sont traçables et le smoke
  passe sans Node système sur un environnement propre.
- [ ] Absence de CLIs externes produit une erreur actionnable, jamais un crash.
- [ ] `npm run verify`, build Tauri et contrôle des fonctionnalités critiques passent.
- [ ] Aucune release publique n'est créée par l'exécuteur.

## STOP conditions

- Pas de choix humain runtime/cible.
- Licence/checksum non vérifiable.
- Secrets signature indisponibles.
- Prototype gonfle/casse node-pty sans bénéfice.
- Publication avant Mac propre + RC privée.

## Maintenance notes

Documenter cadence de mise à jour runtime et test CI version. Embarquer Node
transfère à Atelier la responsabilité de suivre ses correctifs de sécurité.

## État d'exécution — 2026-07-11

- Décision humaine: Node embarqué approuvé.
- Implémenté: Node 22.22.3 darwin-arm64, checksum officiel, licence, copie
  minimale, ressource Tauri, résolution embarquée obligatoire en release et
  fallback système limité aux builds debug.
- Vérifié: `npm run verify`, build Tauri/DMG, Node arm64/version dans le bundle,
  sidecar et galerie réellement lancés avec le chemin `node-runtime/bin/node`,
  endpoint santé vert et diagnostic Settings `bundled`.
- Mesuré: `.app` 243 Mo contre 135 Mo avant; DMG 80 Mo.
- À faire avant DONE: essai sur un autre Mac/compte sans Node, scénario CLI
  Claude/Codex absente puis présente, puis RC privée. Aucune release publique
  n'a été créée.
