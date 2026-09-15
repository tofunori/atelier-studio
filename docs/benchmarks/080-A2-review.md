# Plan 080 — dossier A2 (implémenté à vérifier)

**État actuel : correctifs Codex appliqués et tests ciblés réussis ; validation du
bundle en attente d’autorisation de reconstruire/relancer l’instance ouverte.
Voir section 7. Les sections 1–6 conservent le contexte de livraison et l’audit initial.**

Grok, 2026-09-14. Statut du lot : **implémenté à vérifier**. Pas DONE.

## 1. Contexte

- **HEAD au moment de la livraison :** `93db097079b6e651da8c07d3d7711d1959938d46` (des commits auto ont pu avancer pendant le lot).
- **Fichiers principaux :**
  - `rust/crates/atelier-store/src/reviews.rs` (nouveau)
  - `rust/crates/atelier-runtime/src/review.rs` (étendu depuis A1)
  - `rust/crates/atelier-runtime/src/state.rs`, `ws_router.rs`, `ws_dispatch.rs`, `parity.rs`
  - `rust/crates/atelier-providers/src/traits.rs`, `fake.rs`, `registry.rs`
  - `rust/crates/atelier-protocol/src/lib.rs`
  - `packages/atelier-protocol/src/envelopes.ts`, `index.ts`, `tests/validate.test.ts`
  - `src/App.tsx`, `src/components/Chat.tsx`, `src/components/chat/ChatTimeline.tsx`, `src/lib/i18n.ts`, `src/lib/providers.ts`
  - `src/components/Chat.review.test.tsx` (nouveau)
- **Modifications hors lot :** non reprises.
- **Instance ouverte :** `tauri-app` déjà lancé. Pas d’arrêt, pas de rebuild.

### Décisions par rapport à l’annexe

- Aucun adaptateur Codex/Claude complet. `structuredReview` est `false` partout sauf le `FakeProvider` de test. Un provider réel répond `REVIEW_UNSUPPORTED` sans retomber sur `native_command('review')`.
- Le dossier Git est figé depuis le journal du tour (`filesChanged` + diffs d’`edit`), pas depuis le worktree courant. Les fichiers préexistants hors tour n’y entrent pas.
- Mode `claims` sans `requiredChecks` de profil : couverture partielle, jamais `passed` global.
- `error` de `reviewResult` devient `{code, message}` pour les records A2. Les clients lisent encore `verdict`.
- `getReviews` part avec `getHistory` à la sélection/reconnexion.

## 2. Scénarios

| Commande | Tests | Résultat |
| --- | --- | --- |
| `cargo test … -p atelier-store review` | réserve idempotente, collision, version future, liste par fil, input adressé, requestId path traversal | 6 ok |
| `cargo test … -p atelier-providers review` | `structured_review_defaults_to_unsupported` | ok |
| `cargo test … -p atelier-runtime review` | A1 conservés + décision (preuve inconnue, zéro contrôle, omission, doublon, couverture proclamée, échec) + isolation session + config + retry figé + autre projet + getReviews reload | 26 ok (filtre, dont 1 test `send` hors A2) |
| `npx vitest run src/components/Chat.review.test.tsx` | tardif N pendant N+1 ; reconnexion `reviews` | 2/2 ok |
| `npx vitest run src/components/chat/ChatTimeline.review.test.tsx` | A1 bandeau/détail | 10/10 ok |
| `npx vitest run src/App.orchestration.test.tsx -t '/review demande'` | `/review` → `requestReview` `mode: git` + `requestId` | ok |
| `npm run test:protocol` | 50 ok, dont contrat requestReview/getReviews |
| `npx tsc --noEmit` | ok |

Une commande avec zéro test sélectionné n’a pas été présentée comme preuve.

## 3. Contrats

Record disque : `<app_dir>/reviews/<uuid>.json` + `inputs/<sha256>.json`.

Projection `queued` → `status: running`, `executionStatus: queued`, `verdict` nul.

`ReviewRequest` n’a pas de `sessionId` ni d’outils. `native_command('review')` n’est plus appelé par `requestReview`.

Relecture après restart : `get_reviews_is_filtered_and_survives_reload` rouvre le store. Pas de relance d’app.

## 4. Défaut avant / après

Avant A2, `/review` lançait `native_command('review')` sur la session du fil et le worktree mouvant.

Après : réservation durable, dossier du tour, reviewer isolé ou `REVIEW_UNSUPPORTED`. L’UI nomme le périmètre « changements du tour ». Un verdict du tour N n’écrase pas N+1.

## 5. Bundle

**En attente.** Instance `tauri-app` ouverte. Pas d’essai provider réel (capability absente). A3 (déclenchement auto, crash, autofix) non commencé.

## 6. Revue indépendante Codex — 2026-09-14

**Verdict : A2 non validé, corrections demandées avant A3.**

Checkout vérifié à HEAD `07133d6fd9fa0588027d0021a46e52c2f5fa425a`, avec les
modules et tests A2 non suivis présents dans le worktree. Deux lectures indépendantes
du backend/store ont recoupé les constats ci-dessous. Codex a ajouté uniquement
deux fichiers de reproduction et cette section ; aucun code applicatif corrigé,
aucun commit, staging, build, arrêt ou lancement de l’app.

### Défauts prioritaires et critères de correction

1. **P1 — Verdict positif malgré la troncature du dossier transmis.**
   [review.rs:837](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/src/review.rs:837).
   Au-delà de 128 KiB, `transmitted_dossier` retire le contenu des preuves et
   déclare `partial`. `run_isolated_review` appelle ensuite `decide_review` avec
   l’input original ; il remplace cette couverture par `complete`, avec un
   `passed` possible. Reproduction : gros diff, réponse JSON positive qui cite
   `git-diff` ; résultat observé `coverage was partial, now complete`.
   **Attendu :** calculer la décision avec l’inventaire réellement transmis ;
   toute preuve obligatoire retirée interdit `passed`. Ajouter un test du
   chemin complet avec FakeProvider et du record final persisté. La reproduction
   jointe compose les deux fonctions actuellement appelées par `run_isolated_review` ;
   elle devra suivre la nouvelle API si la correction transporte explicitement
   les métadonnées de transmission.

2. **P1 — Diff incomplet déclaré complètement couvert.**
   [review.rs:256](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/src/review.rs:256).
   Un événement `edit` fournit le diff de `a.py` ; `done.filesChanged` annonce
   `a.py` et `b.py`. Le dossier contient uniquement le chemin de `b.py`, sans son
   diff, mais sa couverture vaut `complete`. Cas concret : second fichier modifié
   par une commande shell, sans événement d’édition détaillé.
   **Attendu :** vérifier la disponibilité du diff pour chaque fichier du périmètre
   figé ; tout manque doit rendre la couverture partielle et empêcher `passed`.
   Ne pas relire le worktree ultérieur comme s’il représentait le tour passé.

3. **P1 — Crash React à l’ouverture du détail d’une erreur A2.**
   [ChatTimeline.tsx:839](/Users/tofunori/Documents/atelier-studio/src/components/chat/ChatTimeline.tsx:839)
   et [Chat.tsx:452](/Users/tofunori/Documents/atelier-studio/src/components/Chat.tsx:452).
   Le backend émet `error: {code, message}` ; le frontend conserve `error?: string`
   et rend directement cet objet. Résultat reproduit : `Objects are not valid as
   a React child`. Cela concerne notamment `REVIEW_UNSUPPORTED`, actuellement
   retourné par tous les providers de production.
   **Attendu :** décoder le contrat A2 et afficher le message, tout en acceptant
   les anciennes erreurs textuelles. Tester une projection réelle du protocole.

4. **P1 — Ancien verdict attribué au nouveau tour ; restauration incorrecte.**
   [Chat.tsx:434](/Users/tofunori/Documents/atelier-studio/src/components/Chat.tsx:434)
   et [Chat.tsx:460](/Users/tofunori/Documents/atelier-studio/src/components/Chat.tsx:460).
   Trois scénarios reproduits :
   - le `ok` de N est déjà affiché, puis N+1 termine : le même bandeau reste sur
     le dernier tour, car l’état n’est réinitialisé qu’au changement de fil ;
   - la liste de revues arrive avant les événements historiques : elle est jetée
     quand `lastTurnId` est nul, et n’est plus appliquée à l’arrivée de l’historique ;
   - le serveur retourne les revues de la plus récente à la plus ancienne
     (`reviews.rs:355`), mais `reverse().find()` choisit la plus ancienne du tour.
   **Attendu :** état indexé par `(threadId, turnId, reviewId)`, sélection dérivée
   du tour affiché et conservation des résultats indépendamment de l’ordre des
   réponses. Tester aussi un changement de tour sans nouvel événement review.

5. **P2 — Retry après un nouveau tour : collision au lieu de la réservation initiale.**
   [review.rs:683](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/src/review.rs:683)
   et [reviews.rs:392](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-store/src/reviews.rs:392).
   Une requête sans `turnId` est réservée sur N ; N+1 termine ; la même requête
   renvoie `REQUEST_COLLISION`. Le tour implicite est recalculé avant la recherche
   de réservation. Le test livré `retry_keeps_frozen_turn_when_a_newer_turn_exists`
   vérifie seulement le record restant et ignore la réponse du retry : il passe
   aussi lorsque le retry échoue.
   **Attendu :** retrouver le `requestId` et comparer la requête d’origine avant
   de résoudre un nouveau tour. Même payload : mêmes `reviewId`, `turnId` et
   `inputHash`, y compris après réouverture du store ; payload modifié : collision.

6. **P2 — Contrôle réussi sans citer sa preuve obligatoire.**
   [review.rs:531](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/src/review.rs:531).
   `git-turn-diff` avec `outcome: passed` et `evidenceIds: []` produit `passed`.
   Citer seulement `prompt` est également accepté par le code : les références
   connues sont contrôlées, mais pas les références obligatoires de chaque check.
   **Attendu :** confronter les preuves de chaque contrôle à ses
   `requiredEvidenceIds` et `targetEvidenceIds`, et conserver la cause du manque.

7. **P2 — Intégrité du dossier durable non vérifiée à la lecture.**
   [reviews.rs:259](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-store/src/reviews.rs:259).
   Après `put_input`, modifier le prompt du JSON en gardant le nom `<ancien-hash>.json`
   reste accepté par `get_input`. La lecture vérifie seulement la version.
   **Attendu :** vérifier le hash global, les longueurs et hashes des preuves ;
   retourner une erreur sans écraser les données. L’exécution actuelle utilise
   l’input en mémoire : ce défaut concerne le lecteur durable, sans prétendre
   qu’une reprise automatique A3 existe déjà.

8. **P2 — Plafond UTF-8 dépassé.**
   [review.rs:361](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/src/review.rs:361).
   `.chars().take(MAX_DOSSIER_BYTES)` borne les caractères. Un prompt rempli de
   `é` transmet **261 707 octets** au lieu des **131 072** autorisés.
   **Attendu :** couper à une frontière UTF-8 valide en respectant la limite
   d’octets ; garder une couverture partielle et la limitation explicite.

9. **P2 — Contexte et limites des preuves outils perdus.**
   [review.rs:198](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/src/review.rs:198).
   Seuls `name/status/output` sont conservés. Commande/arguments, `exitCode`,
   identité de l’événement et indicateurs `truncated/outputLength/storageFault`
   ne sont pas repris. Constat par lecture du code, sans test ajouté pour ce cas.
   **Attendu :** conserver les références et métadonnées nécessaires ; une sortie
   déjà tronquée ou indisponible en amont doit rester identifiée comme telle.

### Vérifications exécutées

| Vérification | Résultat de cette revue |
| --- | --- |
| Rust fourni, filtre `review`, packages store/runtime/providers | 34 réussites : 6 store, 26 runtime, 2 providers ; le filtre inclut aussi des tests hors A2 |
| Tests UI fournis A2 + A1 | 12/12 réussis |
| `src/App.orchestration.test.tsx`, fichier complet | 63 réussites, 8 échecs ; attribution à A2 non établie, ne pas présenter la suite globale comme verte |
| `npm run test:protocol` | 50/50 réussis |
| `npm run typecheck` | réussi |
| Nouvelles reproductions UI | **4/4 échouent sur les comportements attendus** |
| Nouvelles reproductions Rust | **6/6 échouent sur les comportements attendus** |

Les huit échecs d’orchestration concernent notamment les contrôles Stop/Interrupt,
le retrait de refus historiques, les panneaux d’automatisation/rail et Edit & resend.
Ils ne sont pas utilisés comme preuve causale des défauts A2 listés ci-dessus.

Tests ajoutés, volontairement rouges tant que les défauts restent présents :

- [Chat.review.audit.test.tsx](/Users/tofunori/Documents/atelier-studio/src/components/Chat.review.audit.test.tsx)
- [review_a2_audit.rs](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/tests/review_a2_audit.rs)

```sh
./node_modules/.bin/vitest run src/components/Chat.review.audit.test.tsx
cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime --test review_a2_audit
```

### Limites fonctionnelles et livraison

- `structuredReview=false` pour tous les providers de production ; seul
  FakeProvider exécute ce contrat. Le retour explicite unsupported est prévu par
  l’annexe et évite un fallback non isolé. En revanche, aucune revue utilisateur
  effective ni isolation d’un provider réel n’est validée. Documenter la vérification
  des capacités installées demandée par l’annexe avant de conclure à leur absence ;
  cela ne constitue pas une demande d’ajouter un adaptateur complet hors lot.
- Le mode `claims` sans profil reste non concluant, conformément au garde-fou.
- Aucun bundle reconstruit ni comportement observé dans l’app pour cette revue.
  Les défauts reproductibles suffisent à refuser la validation actuelle.
- Les nouveaux modules `atelier-runtime/src/review.rs`, `atelier-store/src/reviews.rs`
  et les nouveaux tests sont encore non suivis par Git. Le HEAD seul ne représente
  donc pas la livraison compilable examinée. Inclure les chemins exacts lorsque
  le commit du lot sera autorisé ; Codex n’a rien ajouté à l’index.

**Retour à Grok : corriger ces cas, joindre les résultats ciblés et représenter A2
à la vérification avant de commencer A3.**

## 7. Correctifs Codex appliqués — 2026-09-14

Suite à « ok corrige toi meme », les défauts de la section 6 ont été corrigés
localement. Pas de commit, de staging, de push ni de modification du stream.
Les références de lignes de l’audit initial décrivent le code avant correction.

### Comportement corrigé

- **Couverture et verdict :** le calcul tient compte des limites du dossier
  réellement transmis. Les références obligatoires et cibles de chaque contrôle
  doivent être présentes dans sa réponse. Un dossier partiel reste non concluant,
  même si le modèle renvoie tous les contrôles comme réussis.
- **Diffs :** chaque chemin modifié doit avoir ses preuves d’édition. Un appel
  shell/MCP ou un outil hors primitives d’édition peut avoir changé un fichier
  après son snippet ; sans état final capturé, le marqueur
  `git-diff:tool-effects-unverified` interdit alors une couverture complète.
  Ce choix est volontairement conservateur : une commande inoffensive peut aussi
  empêcher `passed`. Aucun diff du worktree courant n’est attribué au tour passé.
- **Preuves outils :** conservation de l’événement complet, avec invocation,
  résultat, code retour, identité et marqueurs de perte. Les `activity` produits
  par le journal pour un payload absent/corrompu sont également conservés comme
  limitations et rendent la couverture partielle.
- **UTF-8 :** le dossier respecte 131 072 octets, avec coupure sur une frontière
  valide ; le contenu original reste intégralement stocké.
- **Idempotence :** empreinte persistée de la requête originale, recherche avant
  résolution du tour implicite, puis second contrôle sous le mutex de réservation.
  Un retry retrouve sa première réservation malgré un nouveau tour ou un reload.
  Un payload différent provoque une collision sans nouvel appel reviewer.
- **Intégrité :** vérification du hash global, des tailles et hashes de contenu
  et des `payloadRef`. Une entrée existante corrompue n’est pas remplacée lors
  d’un `put_input`. Écriture du record et mise à jour de l’index sous le même verrou.
- **Concurrence :** une revue en attente derrière une autre sur le même fil ne
  réserve plus inutilement une place globale aux dépens d’un autre fil.
- **Interface :** normalisation de l’erreur `{code,message}` en texte, cache par
  identité fil/tour/revue, conservation des listes arrivées avant l’historique,
  sélection par dates et ordre serveur. Un résultat ancien ne remonte pas sur le
  nouveau tour ; un `running` tardif ne remplace pas un résultat terminal. Les
  anciens résultats sans identité de tour ne sont pas attribués arbitrairement.
  Le bouton Corriger redevient disponible après la nouvelle revue terminale.

Fichiers de production :

- [review.rs](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-runtime/src/review.rs)
- [reviews.rs](/Users/tofunori/Documents/atelier-studio/rust/crates/atelier-store/src/reviews.rs)
- [useReviews.ts](/Users/tofunori/Documents/atelier-studio/src/components/chat/useReviews.ts)
- [Chat.tsx](/Users/tofunori/Documents/atelier-studio/src/components/Chat.tsx)

### Vérifications après correction

| Vérification | Résultat |
| --- | --- |
| `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime --test review_a2_audit` | **10/10**, aucune exclusion |
| Runtime, filtre `review` | **28/28** ; inclut FakeProvider → verdict tronqué non concluant → record relu, plus équité de la file |
| Providers, filtre `review` | **2/2**, dont un test hors A2 |
| `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-store` | **41/41**, paquet entier |
| `Chat.review.audit.test.tsx` | **9/9** |
| Tests UI A2 fournis + présentation A1 | **12/12** ; fixtures A1 munies des identités A2, assertions de verdict conservées |
| `/review demande` dans `App.orchestration.test.tsx` | **1/1**, 70 autres tests non sélectionnés |
| `npm run test:protocol` | **50/50** |
| `npm run typecheck`, `git diff --check` | réussis |

Le filtre Rust `review` ne sélectionne qu’un des dix tests d’intégration : la
commande explicite `--test review_a2_audit` a donc été exécutée séparément.
La suite complète d’orchestration, qui avait huit échecs d’attribution indéterminée
lors de l’audit initial, n’est pas déclarée corrigée par ces changements.

Deux relectures indépendantes ont examiné les corrections. Elles ont conduit à
ajouter les cas de réécriture shell d’un même fichier et d’erreur `activity` du
journal. Après ces corrections, aucun défaut matériel restant n’a été identifié
dans les périmètres confiés. Les relectures sont statiques ; les tests ci-dessus
ont été exécutés séparément par l’agent principal.

### Limites restantes, explicites

1. **Validation applicative en attente.** Instance observée ouverte, PID 61296,
   chemin du checkout courant :
   `/Users/tofunori/Documents/atelier-studio/src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app`.
   Aucun build, arrêt ou lancement pendant la correction. La procédure
   [atelier-runtime.md](/Users/tofunori/Documents/atelier-studio/docs/agent-reference/atelier-runtime.md)
   exige une autorisation explicite avant de reconstruire une instance ouverte.
   Les tests ne prouvent pas que le bundle affiché contient ces correctifs.
2. **Providers de production toujours non implémentés pour `structuredReview`.**
   Le retour reste `REVIEW_UNSUPPORTED`, sans fallback natif. Vérification locale
   en lecture seule : Codex CLI **0.154.0**, Claude Code **2.1.270**. L’aide Claude
   annonce `--tools ""`, `--strict-mcp-config`, `--no-session-persistence` et
   `--permission-mode dontAsk`. Cela indique des primitives candidates pour un
   futur adaptateur ; cela ne prouve ni l’isolation effective ni une impossibilité
   du provider. Aucun appel modèle réel effectué. L’interdiction d’ajouter un
   adaptateur complet hors de ce lot, dans l’annexe A2, reste respectée.
3. **Anciennes réservations sans empreinte de requête :** retry refusé par
   `REQUEST_COLLISION` faute de payload d’origine vérifiable. Utiliser une nouvelle
   requête explicite ; les données historiques restent lisibles et conservées.
   La garantie de retry après reload porte sur les nouvelles réservations.
4. **Capture finale complète :** le garde-fou sur les effets d’outils restera
   conservateur jusqu’à la capture fiable de l’état final prévue en A3.

**Conclusion de cette étape : corrections appliquées et contrôles ciblés réussis ;
acceptation dans le bundle encore en attente.**
