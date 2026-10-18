# Registre des tests instables

Un test qui échoue puis passe sans changement de code n'est jamais « juste un
flaky » : soit il garde un invariant que le code viole par moments, soit il
dépend d'une horloge ou d'un ordre que rien ne garantit. Les deux cas se
corrigent. Ce registre recense chaque instabilité observée en CI, avec ce
qu'on sait de sa cause, pour que le rouge reste un signal.

Règles :

- Un échec intermittent s'inscrit ici **le jour où il est vu** : test, run,
  symptôme exact, cause supposée.
- On ne relance pas un run rouge pour fusionner par-dessus sans qu'une entrée
  existe (ou soit mise à jour) ici.
- Pas de `retries` globaux dans Playwright, pas de `#[ignore]`, pas de
  `test.skip` : ils cacheraient précisément la régression qu'on veut voir.
  Une quarantaine éventuelle est explicite, datée, et inscrite ici.
- Preuve de correction : rejouer le test sous charge (`--repeat-each` avec
  plusieurs workers pour Playwright, une boucle d'au moins 30 passages en
  parallèle avec des processus CPU pour Rust) **avant et après** le correctif,
  et citer les deux décomptes.

Statuts : `ouvert` (cause inconnue), `cause identifiée` (pas encore corrigé ou
pas vérifiable ici), `corrigé` (preuve avant / après citée).

## Entrées

### `gallery/tests/e2e/diff.spec.ts` — « two open pages converge through one 409 retry without losing either intervention »

- **Vu** : runs 230 (main, 2026-09-30), 233 (PR #45), 275 (main d754592), 283
  (PR #60, 2026-10-18).
- **Symptôme** : `Expected revision: 2, Received revision: 3` avec count 2 et
  distinctIds 2 ; au run 233, **une seule intervention** côté serveur (perte
  réelle).
- **Cause** (deux défauts réels, plus une attente trop stricte) :
  1. Client (`gallery/src/browser/diff_versions.ts`) : une vue qui enregistre
     avant la fin de son premier `restoreVersions` voyait son intervention
     effacée par `replaceWithV2`, qui rechargeait le journal d'une **autre**
     vue laissé dans le `localStorage` partagé de l'origine. Elle n'envoyait
     ensuite qu'un `set-current` : intervention perdue (le run 233).
  2. Serveur (`rust/crates/atelier-gallery/src/git.rs`) : `POST /versions`
     lisait la révision, vérifiait puis écrivait sans verrou, sur un runtime
     multi-thread. Deux POST simultanés à la même révision étaient acquittés
     tous les deux et le second écrasait le premier. Le nom de fichier
     temporaire (pid + millisecondes) était en outre partagé entre deux
     écritures de la même milliseconde.
  3. Test : la révision 3 est **légitime** quand la vue A écrit sa baseline
     (init) avant les deux ⌘S. Le test attend désormais cette baseline,
     puis vérifie révision 3, 3 acquittements et 1 seul 409.
- **Statut** : corrigé le 2026-10-18 (branche `claude/maturite-3-ci`).
  Avant : 12 échecs sur 12 (`--repeat-each=12 --workers=3`, sous charge),
  dont 2 avec count 1. Après : 24 passages sur 24 pour le test et le nouveau
  test « saves racing the first restore of a second page keep both
  interventions ». Tests ajoutés : `des_post_versions_concurrents_ne_perdent_aucune_intervention`
  (`http_smoke.rs`, 3 échecs sur 3 avant le verrou), B16b, B17b et « 409 sans
  fin » dans `gallery/tests/unit/diff_suite.mts`.

### `rust/crates/atelier-runtime/src/server_socket_tests.rs` — `slow_knowledge_read_and_terminal_open_do_not_block_stop`

- **Vu** : runs 161, 246 (main), 38068219143, 39159420692.
- **Symptôme** : `left: "input" right: "open"` (ligne 417 de l'ancienne
  version).
- **Cause** : le test supposait un ordre fixe des **réponses**, alors que le
  socket libère la réservation avant que la réponse soit relayée par des
  tâches indépendantes : seul l'ordre d'**exécution** par voie est garanti
  (FIFO). Il dépendait aussi d'un `testDelay` de 100 ms pour « tenir » la
  requête lente.
- **Statut** : corrigé le 2026-10-18. La requête lente est retenue par une
  barrière (`testGate`, sémaphore à 0 permit) libérée par le test lui-même,
  les réponses concurrentes sont comparées comme un ensemble et l'ordre
  d'exécution est vérifié par un journal des sondes. Avant : 8 échecs sur 36
  passages sous charge. Après : 36 sur 36.

### `rust/crates/atelier-runtime/src/server_socket_tests.rs` — `stop_does_not_cancel_a_send_received_after_it`

- **Vu** : rejoué en local sous charge (même famille que le précédent).
- **Symptôme** : `left: "new" right: "stop"` (ligne 432 de l'ancienne version).
- **Cause** : la même (ordre des réponses supposé, délai d'horloge).
- **Statut** : corrigé le 2026-10-18. Avant : 3 échecs sur 36. Après : 36 sur 36.

### `gallery/tests/e2e/standalone_editors.spec.ts:39` — tableau blanc (projet `webkit-standalone-editors`)

- **Vu** : run 284 (main 423caaf, 2026-10-18), alors que la PR #41 était verte.
- **Symptôme** : `pageerror` « Fetch API cannot load …/board/poll due to
  access control checks » juste après `page.reload()` (ligne 55).
- **Cause identifiée, non vérifiée** : le tableau blanc interroge
  `/board/poll` toutes les secondes (`gallery/whiteboard-src/src/App.tsx`).
  Un poll en vol au moment du `reload` est annulé ; WebKit consigne cette
  annulation comme une erreur console de source JavaScript, et Playwright
  WebKit convertit toute erreur console de cette source en `pageerror`, même
  si l'application intercepte bien le rejet (`.catch(console.warn)`). Le
  produit n'est pas en faute ; le test échoue quand le reload tombe pendant
  une requête.
- **Statut** : cause identifiée. WebKit n'est pas disponible sur les machines
  Linux des agents : aucun correctif n'est proposé tant qu'il ne peut pas être
  rejoué. Piste : arrêter le poll sur `pagehide` dans `App.tsx` (puis
  reconstruire `gallery/assets/whiteboard/`), ou attendre la fin du poll en
  cours avant `page.reload()` dans le test.

### `gallery/tests/e2e/pdf_toolbar.spec.ts:383` et `:477`

- **Vu** : `:477` au run 39149035918 (PR #56, chromium **et** webkit-reading) ;
  `:383` deux fois (confiance moyenne).
- **Symptôme** : `Received 80` au glisser d'une note ou d'un tampon PDF ; le
  test passe ensuite sur main sans changement dans `gallery/`.
- **Statut** : ouvert. Ce test garde le déplacement des annotations PDF : à
  traiter comme une régression possible, pas comme du bruit.

### `gallery/tests/e2e/core.spec.ts:699`

- **Vu** : une fois dans les 100 derniers runs (audit du 2026-10-18).
- **Statut** : ouvert, cause non analysée.

### `mobile-native` — `ChatTests.testWebQuoteSurvivesSelectionClearedWhileMenuDismisses`

- **Vu** : run 202 (job 109381033810), deux fois au total.
- **Statut** : ouvert. Swift ne compile pas sous Linux : à reproduire dans le
  job CI `mobile-native` ou sur le Mac.

### `zotero.rs:1051` — `add_pdfs_reports_zotero_off`

- **Vu** : run 164 (job 108731485458).
- **Symptôme** : « error sending request » reçu au lieu de « zotero-off ».
- **Statut** : ouvert. Probablement une dépendance à l'état du réseau local
  (un port Zotero joignable ou non) plutôt qu'un réglage simulé.

### Vitest — `EnvironmentTeardownError` dans `src/components/chat/turnAnatomy.test.tsx`

- **Vu** : run 39092563007 (job 117572201867, `verify`).
- **Symptôme** : « Closing rpc while onUserConsoleLog was pending » ; les 2444
  tests passent mais le processus sort en 1.
- **Statut** : ouvert. Un `console.*` émis après la fin du test (minuterie ou
  promesse non attendue) ; à chercher dans ce fichier.
