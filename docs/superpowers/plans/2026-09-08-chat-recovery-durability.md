# Fiabilité du chat : réception durable, reprise et endurance

## Mandat et responsabilités

Demande de Thierry : plan détaillé, goal, implémentation par GPT-5.6-Luna avec
effort maximal, puis vérification indépendante par l’agent parent.

- Luna possède l’implémentation runtime/client, ses tests et le banc de mesure.
- Le parent possède ce plan, la revue finale, les critères de réception et la
  validation du bundle avec `docs/agent-reference/atelier-runtime.md`.
- Aucune validation finale ne repose uniquement sur le compte rendu de Luna.
- Pas de commit/push ni de modification des travaux LaTeX/galerie en cours.
- Conserver les modifications existantes de l’isolation des requêtes, y compris
  les modules non suivis `ws_connection.rs` et `ws_dispatch.rs`.

## Problème et résultat attendu

Une socket connectée ne prouve pas que le message est reçu, et une réponse absente
ne prouve pas que l’envoi a échoué. Les coupures, mises en veille, réponses tardives
et historiques coûteux doivent avoir des issues explicites et testables.

Résultat : un envoi accepté reste identifiable après une reconnexion ; une
répétition du même envoi ne lance pas une deuxième exécution ; le client récupère
les événements manqués ; une lecture défaillante se répare sans perturber les
autres chats ; l’utilisateur distingue réception, travail et reconnexion.

## Référence et point de départ

Comparer les mécanismes, sans transposer la pile de Synara : snapshot local
`/tmp/synara-stream-audit-20260907`, révision `8599826`.

- `apps/server/src/orchestration/Layers/OrchestrationEngine.ts` : reçus et identité.
- `apps/server/src/wsSnapshotLiveStream.ts` : curseur, replay et repli sûr.
- `apps/web/src/wsTransport.ts` : récupération ciblée et attente progressive.
- `apps/server/perf/` : mesures d’historiques et de flux concurrents.

Atelier dispose déjà d’un journal avec séquences, d’identifiants de messages,
de révisions d’historique et de liste, de brouillons persistants, d’un affichage
virtualisé, de Stop/queue/steer et de voies réseau séparées. Auditer et réutiliser
ces contrats avant de créer un autre store ou une nouvelle file.

## Lot 1 — Inventaire, contrats et mesure initiale

1. Tracer un send depuis le composer jusqu’au provider, la confirmation, le
   journal et le rendu ; relever les fenêtres de coupure et de redémarrage.
2. Identifier les types d’événements effectivement durables, les séquences,
   les effets d’un rewind, d’une suppression et d’une rotation du runtime.
3. Définir les nouveaux messages et leurs consommateurs, en conservant un repli
   compatible lorsqu’un pair ne fournit pas le nouveau protocole.
4. Mesurer un historique synthétique long et plusieurs flux concurrents avant
   modification ; conserver commande, paramètres, version et résultats JSON.

## Lot 2 — Reçus durables et dédoublonnage des envois

1. Utiliser un identifiant d’envoi stable, créé avant le premier envoi réseau.
2. Réserver atomiquement l’identité côté serveur avant tout effet sur le provider.
   La persistance doit distinguer au minimum réception, issue et cas incertain.
3. Vérifier l’identité de la requête : même identifiant avec contenu différent
   doit échouer explicitement, y compris options pertinentes et pièces jointes.
4. Une répétition identique renvoie l’état connu ; elle ne répète pas le tour.
   Tester deux sockets concurrentes et un redémarrage du runtime.
5. Prévoir une consultation/réconciliation du reçu pour une confirmation perdue.
   Ne jamais transformer un timeout en nouvelle exécution automatique.
6. Si un crash laisse l’état d’un effet externe incertain, le rendre explicite.
   Un reçu local ne fournit pas une garantie d’exécution exactement une fois
   chez un fournisseur externe. Ne pas prétendre le contraire dans l’interface.
7. Borner/nettoyer la persistance sans supprimer trop tôt la protection contre
   les répétitions ; documenter durée et comportement après expiration.

## Lot 3 — Reprise des événements après coupure

1. Garder le dernier curseur effectivement appliqué par chat, avec une identité
   permettant d’invalider un curseur après reset, suppression ou rewind.
2. Rejouer la portion manquée lorsque le journal le permet ; sinon obtenir un
   historique complet. Ne pas annoncer le replay pour des événements non durables.
3. Fermer la course snapshot/flux : attacher ou tamponner le direct, fixer une
   borne, appliquer snapshot/replay puis événements nouveaux sans trou ni doublon.
4. Ignorer les réponses d’une ancienne socket/génération et empêcher un ancien
   historique de ressusciter des messages supprimés.
5. Réconcilier les états de tour : un done manqué doit arrêter le spinner ; un
   tour encore actif doit rester actif. Préserver le texte déjà affiché.
6. Borner les buffers et les tentatives ; un trou trop grand provoque un repli
   explicite, jamais une boucle infinie de resynchronisation.

## Lot 4 — Récupération ciblée et états visibles

1. Pour les lectures idempotentes essentielles, coordonner les nouvelles
   tentatives avec attente progressive bornée et annulation à la navigation.
2. Fusionner les demandes identiques en vol lorsque leur contrat le permet.
   Une récupération de catalogue ne doit pas reconnecter tous les chats.
3. Distinguer envoi non confirmé, reçu, réponse en cours, récupération de connexion
   et échec nécessitant une action. Ne pas utiliser le silence du modèle comme
   preuve de panne ; conserver les interactions et permissions en attente.
4. Rattacher erreurs et récupération au bon chat/projet/requête ; retirer une
   erreur après un succès pertinent, sans masquer les échecs encore présents.
5. Conserver Stop utilisable, les brouillons et pièces jointes, et la sémantique
   des messages mis en file ou de steer. Aucun changement esthétique général.
6. Demande utilisateur ajoutée pendant la revue : après Stop volontaire,
   ne montrer ni « Arrêté après Ns », ni « Tour interrompu », ni croix jaune.
   Conserver le texte partiel, les informations de fichiers utiles et le
   composeur disponible. Les vraies erreurs restent visibles. Test indépendant
   ajouté dans `src/App.recoveryReview.test.tsx` ; correction validée par le
   parent : 71 tests ciblés passent, TypeScript/Vite/sidecar 656/parity/diff 207
   passent, build `.app` exit 0 (`/tmp/atelier-stop-build.log`). Bon processus
   87019 vérifié. Test UI réel : demande de compter, Stop pendant la réponse,
   texte reçu jusqu'à 156 conservé, pas de libellé d'arrêt/croix, composeur
   revenu à Envoyer. Capture `/tmp/atelier-stop-silent-live.jpeg`. Ce sous-lot
   est terminé ; le goal complet reste ouvert pour reprise/endurance/revue.

## Lot 5 — Régressions, performance et endurance

Tests déterministes requis :

- confirmation perdue après acceptation ; répétition sur deux sockets ; collision
  d’identité ; redémarrage entre acceptation et réponse ; stockage défaillant ;
- événements pendant snapshot/replay ; coupure entre deux deltas ; done manqué ;
  curseur périmé, rewind, suppression, ancienne réponse après nouvelle connexion ;
- rafale de lectures, historique sous catalogues lents, plusieurs chats, Stop,
  queue/steer, reconnexion et absence de fuite après cycles répétés ;
- reprise ciblée sans effacer le brouillon ni rendre une erreur étrangère visible.

Banc reproductible sur données synthétiques isolées :

- 1, 5 et 10 chats, historiques courts et longs, plusieurs cycles de reconnexion ;
- latence admission/confirmation, ping, récupération, taille des réponses,
  durée et mémoire lorsque mesurables ; médiane, p95 et maximum ;
- au moins 10 minutes d’endurance locale avec provider simulé, sans coût externe
  ni écriture dans les projets scientifiques ; vérifier stabilisation des tâches
  et de la mémoire plutôt qu’exiger une RSS instantanément identique ;
- consigner paramètres et résultats, séparer temps fournisseur et temps Atelier ;
- ne pas présenter un benchmark runtime comme une preuve de fluidité du rendu.

Seuils initiaux sur fixture locale sans provider externe : ping et confirmation
visés sous 250 ms p95 pendant lectures lentes ; aucune exécution dupliquée ni
perte d’événement ; reprise petite coupure visée sous 2 s une fois le serveur
disponible. Signaler tout dépassement et son attribution, sans ajuster un seuil
simplement pour obtenir du vert. Ces valeurs ne sont pas une promesse réseau.

## Lot 6 — Revue indépendante et validation du produit

1. Luna livre le diff, les contrats réellement implémentés, commandes exécutées,
   résultats, limites et risques ; le parent les vérifie indépendamment.
2. Corriger les défauts importants puis rejouer les tests concernés.
3. Exécuter TypeScript, build web, tests sidecar et suites Rust/frontend touchées.
   Respecter le protocole de relance ; aucune build simultanée ni `tauri dev`.
4. Le parent reconstruit le bon `.app`, vérifie le chemin du processus et observe
   création visible, envoi/réponse, changements de chats et récupération. Les
   tests destructifs de coupure utilisent une fixture, pas un tour utilisateur.
5. Si l’utilisateur travaille dans l’app, ne pas interférer avec ses saisies ;
   observer et réserver les manipulations aux chats de test autorisés.
6. Marquer le goal terminé uniquement après ces vérifications ; distinguer ce
   qui est testé en fixture, dans le runtime du bundle et dans l’interface.

## Suivi

- [x] Plan et goal créés.
- [x] Audit et contrats arrêtés par Luna.
- [x] Implémentation et tests de chaque lot.
- [x] Mesures et endurance exécutées (rapport indépendant ci-dessous ; limites explicites).
- [x] Revue indépendante et corrections.
- [x] Bundle final et validation dans l’app.

Les journaux de travail sont propres à cette tâche. Aucun document de mémoire
ni transaction d’une autre tâche ne doit être modifié ou clôturé.

## Référence indépendante avant implémentation

Le parent a exécuté `/tmp/atelier-parent-receipt-check.mjs` sur le serveur du
bundle actuellement installé, avec le provider `fake` et un profil temporaire.
Aucun processus de l’app utilisateur n’a été arrêté.

| Étape | Messages utilisateur | Réponses texte |
| --- | ---: | ---: |
| Premier envoi | 1 | 1 |
| Même clientMessageId après fin du tour | 2 | 2 |
| Redémarrage, même profil et même clientMessageId | 3 | 3 |

Preuve : `/tmp/atelier-parent-receipt-baseline.json`. Critère après correction :
les trois étapes doivent rester à 1/1. Ce contrôle prouve l’absence de déduplication
sur ce chemin actuel ; il ne mesure pas encore un crash au milieu d’un effet externe.

## Revue intermédiaire du parent

- Endurance indépendante terminée : 610,009 s, 2 634 envois, six scénarios,
  18 reconnexions. Audit durable : 2 634 messages, réponses et fins de tour,
  aucune perte ni double exécution. Rapport et mesures versionnables dans
  `docs/benchmarks/2026-09-08-parent-review.md`. L'admission dépasse 250 ms p95
  avec dix chats ; les mesures ne valent pas un benchmark du rendu WebKit.
- Dernier critère client ajouté : un getHistory refusé REQUEST_BUSY doit
  déclencher une reprise bornée, sans reconnecter ni effacer le brouillon.
  Ce test échoue encore (9/10 contrôles indépendants passent). Lot 4 en cours.
- Dernière exécution après les corrections de corrélation et de parité :
  7/7 tests client indépendants, 225/225 runtime et 27/27 stockage passent.
  Ces résultats remplacent les échecs intermédiaires décrits plus bas.
- Essai court indépendant du banc fourni par Luna : arrêt sur `WS request
  timeout`, aucun rapport final produit. Le profil conserve 344 reçus. Il faut
  identifier la requête expirée et rendre le rapport exploitable avant de
  recevoir le lot endurance. Logs `/tmp/atelier-parent-bench-smoke.log`,
  lanceur `/tmp/atelier-parent-bench-smoke.mjs` ; aucun processus utilisateur
  touché. Une exécution en erreur n'est pas une mesure d'endurance validée.
- Régression indépendante supplémentaire après le hotfix : six contrôles client
  passent, dont redémarrage avec envoi non confirmé. Le septième reproduit une
  perte du texte direct à la deuxième réponse d'historique retardée après
  navigation aller-retour. Correction demandée à Luna ; ce cas bloque la
  réception finale. Log `/tmp/atelier-parent-recovery-review.log`.
- Régressions runtime Rust exécutées : 224 réussites, un échec d'inventaire
  de protocole (`receiptStatus` absent de l'ancien routeur Node). Correction
  de parité demandée ; log `/tmp/atelier-parent-recovery-rust-tests.log`.
- Hotfix utilisateur du bandeau normal : les reçus `received`/`started` ne
  créent plus d'alerte orange. Les cinq tests indépendants passent : éviction,
  rewind, absence de fausse confirmation, consultation bornée de l'accusé perdu,
  absence de bandeau pour les états normaux. Log
  `/tmp/atelier-parent-recovery-review.log`.
- Build du hotfix : TypeScript et Vite passent, sidecar 656 tests, galerie
  parity et diff 207 tests passent. Build `.app` exit 0, log
  `/tmp/atelier-recovery-hotfix-build.log`. Processus 17395 du bon checkout
  vérifié après relance. Observation du chat utilisateur : nouveau tour actif,
  puis réponse terminée sans bandeau orange, capture
  `/tmp/atelier-recovery-banner-fixed.jpeg`. Aucune saisie utilisateur modifiée.
  Cette validation du hotfix ne clôture pas les lots endurance/reprise restants.
- Revue frontend indépendante : `src/App.recoveryReview.test.tsx` reproduit
  l'éviction du cache et le retour arrière manqué. Après correction de Luna,
  le premier passe ; le second échoue encore, y compris avec les bornes exactes
  du protocole. Ne pas réceptionner la reprise tant que ce cas reste rouge.
- Suite ciblée App orchestration + harnessEvents + revue : 115/116 passent,
  log `/tmp/atelier-parent-recovery-regressions.log`.
- Deux sockets envoyant simultanément la même identité : 1 message / 1 réponse,
  test indépendant sur le runtime release du 8 septembre à 18:32,
  preuve `/tmp/atelier-parent-concurrent-candidate.json`.
- Le second build partagé a été relancé avec succès (processus vérifié dans le
  bon checkout). Il ne vaut pas validation finale des fonctionnalités chat.
- Modules de reçus et reprise en cours d’écriture ; ne pas les considérer livrés.
- Constats transmis à Luna : rétention des reçus terminaux avant éviction,
  persistance réellement synchronisée avant effet fournisseur, restauration de
  l’état mémoire après échec d’écriture d’une annulation.
- Deux erreurs de compilation du premier lot ont bloqué le build d’une autre
  tâche du checkout : durée de vie de journalEpoch et emprunt mutable d’un reçu.
  Corrigées par Luna ; `cargo check -p atelier-runtime` vérifié indépendamment,
  succès, log `/tmp/atelier-recovery-compile-check.log`.
- La galerie et les contrôles du composer reçoivent parallèlement des modifications
  d’autres tâches. Coordonner les builds et préserver ces modifications.

## Vérification indépendante du premier bundle candidat

Après le build partagé et la relance confirmés par la tâche CSS, le parent a
rejoué le même script de fournisseur simulé sur le serveur inclus dans le bundle :

- premier envoi : 1 message utilisateur, 1 réponse ;
- répétition identique après fin du tour : 1/1 ;
- redémarrage avec le même profil, puis répétition : 1/1, reçu `completed` ;
- contenu différent avec le même identifiant : `SEND_ID_COLLISION`, historique 1/1.

Preuve : `/tmp/atelier-parent-receipt-candidate.json`. Le test a utilisé un profil
isolé, sans arrêter l’app utilisateur. Ce succès ne valide pas encore les crashs
pendant le provider, la rétention au seuil, la reprise d’un flux actif ni les lots
client/endurance. Le gel des écritures lié au build partagé est levé.

### Crash pendant un envoi : preuve indépendante

`/tmp/atelier-parent-crash-check.mjs` arrête brutalement son propre serveur
fixture dès le reçu `started`, puis redémarre avec le même profil. Résultat :
reçu `uncertain`, historique 1 message/0 réponse avant et après répétition,
`duplicateBlocked: true`. Preuve : `/tmp/atelier-parent-crash-candidate.json`.
Ce test n’a touché aucun processus utilisateur.

### Points encore ouverts avant réception

- Calcul cohérent snapshot/curseur : pas de relecture de head après snapshot.
- Reprise d’un texte actif et gestion des événements éphémères manqués.
- États client, nouvelle tentative ciblée et réconciliation des reçus.
- Exécution du benchmark : corrélation des confirmations, file client bornée,
  fixture d’historique réellement longue, matrice courte puis endurance10min.
- Revue finale de tous les tests et observation du bundle final.

## Réception indépendante finale du lot 4

Luna a livré les reprises bornées et coalescées des lectures, annulées à la
navigation et à la rotation de socket. La revue parent a détecté puis fait
corriger la conservation d'une lecture refusée après épuisement des reprises,
qui pouvait empêcher les demandes suivantes. Les erreurs terminales libèrent
également la demande. Aucune reprise de lecture ne renvoie le prompt au modèle.

Preuves indépendantes du 8 septembre :

- 143 tests frontend passent avant les deux derniers cas ajoutés ;
- 71 tests parent + orchestration passent après correction, dont 12 scénarios
  parent (arrêt silencieux, accusés, brouillon, navigation, refus répétés,
  remontage, réponse historique tardive, éviction et rewind) ;
- 225 tests runtime et 27 store passent avec sockets locales autorisées ;
- coupure effective sur premier delta du fake puis reconnexion : un utilisateur,
  un texte complet, un done, sans nouvel envoi
  (`/tmp/atelier-parent-stream-cut.json`) ;
- TypeScript, Vite, sidecar 656, galerie parity et diff 207 passent.

Le premier préflight lancé en parallèle a dépassé les délais de fixtures Kimi
et du Chrome de parité ; les reprises séparées passent sans modification de ces
fixtures. La référence historique exacte de performance n'est pas disponible :
voir la limite documentée dans `docs/benchmarks/2026-09-08-parent-review.md`.
Le build final est en cours ; cette entrée ne vaut pas encore validation UI.

## Validation du bundle final et clôture

Build `npm run tauri:build:app` terminé avec exit 0, journal
`/tmp/atelier-recovery-final-build.log`. Les occurrences du mot error dans ce
journal sont des lignes source Swift `NSError *error` affichées avec un warning,
aucune erreur de compilation. Relance du bon bundle, processus 90562 vérifié :
`/Users/tofunori/Documents/atelier-studio/src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app`.

Validation UI du parent après relance :

- reprise du chat de test Stop ; réponse exacte `ATELIER_FINAL_OK` reçue d'un
  vrai tour Codex sans outil ni modification de fichier ;
- création d'un chat Codex, visible dans la barre de conversations ;
- retour au chat précédent : réponse présente et brouillon de test conservé ;
- brouillon de test effacé après vérification, aucune saisie utilisateur touchée ;
- aucun bandeau orange pour les états normaux, aucun libellé d'arrêt ni croix
  jaune dans le tour arrêté ; capture `/tmp/atelier-recovery-final-live.jpeg`.

Le test d'arrêt pendant le flux avait été observé dans le bundle précédent
contenant le même correctif Stop ; le bundle final confirme sa présentation
après rechargement. Les coupures destructives et l'endurance ont été exécutées
sur serveurs/profils factices isolés, pas sur les tours de travail de Thierry.
L'endurance mesure le runtime, pas la mémoire WebKit ou une session de plusieurs
jours. La référence numérique exacte avant/après manque, comme documenté.
Le périmètre d'implémentation et de validation du goal est terminé avec ces
limites explicites. Aucun commit ni push effectué.
