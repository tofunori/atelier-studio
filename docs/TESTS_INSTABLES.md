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

Chaque entrée non corrigée porte un **propriétaire** et une **échéance**. Ceux
inscrits le 2026-10-19 sont des propositions de l'audit de maturité, à
confirmer par Thierry ; une échéance dépassée se traite comme un rouge.

## Entrées

### `gallery/tests/e2e/diff.spec.ts` — « two open pages converge through one 409 retry without losing either intervention »

- **Vu** : runs 230 (main, 2026-09-30), 233 (PR #45), 275 (main d754592), 283
  (PR #60, 2026-10-18).
- **Symptôme** : `Expected revision: 2, Received revision: 3` avec count 2 et
  distinctIds 2 ; au run 233, **une seule intervention** côté serveur (perte
  réelle).
- **Cause** (un défaut serveur qui explique la perte, un défaut client vu en
  unitaire, plus une attente trop stricte) :
  1. Serveur (`rust/crates/atelier-gallery/src/git.rs`) : `POST /versions`
     lisait la révision, vérifiait puis écrivait sans verrou, sur un runtime
     multi-thread. Deux POST simultanés à la même révision étaient acquittés
     tous les deux et le second écrasait le premier. Le nom de fichier
     temporaire (pid + millisecondes) était en outre partagé entre deux
     écritures de la même milliseconde. C'est ce défaut qui produit la perte
     en E2E : avec le serveur de main et le client de la branche, le test
     « racing » perd une intervention (mesure ci-dessous) ; avec le serveur
     de la branche et le client de main, il n'en perd aucune. La perte du
     run 233 s'explique par lui.
  2. Client (`gallery/src/browser/diff_versions.ts`) : une vue qui enregistre
     avant la fin de son premier `restoreVersions` voyait son intervention
     effacée par `replaceWithV2`, qui rechargeait le journal d'une **autre**
     vue laissé dans le `localStorage` partagé de l'origine ; elle n'envoyait
     ensuite qu'un `set-current`. Défaut prouvé par le test unitaire B16b
     (`gallery/tests/unit/diff_suite.mts`), qui échoue avec le client de main ;
     aucun lien établi avec un run CI, et l'E2E ne le fait pas apparaître.
  3. Test : la révision 3 est **légitime** quand la vue A écrit sa baseline
     (init) avant les deux ⌘S. Le test 409 attend désormais cette baseline,
     puis vérifie révision 3, 3 acquittements et 1 seul 409. Ainsi
     restructuré, il ne met plus la course en jeu : il passe aussi avec le
     code de main et ne prouve rien sur le correctif. C'est le test
     « saves racing the first restore of a second page keep both
     interventions » qui la met en jeu.
- **Statut** : corrigé le 2026-10-18 (branche `claude/maturite-3-ci`).
- **Mesures** (Chromium Linux des agents, sous charge) :
  - Ancien test 409, code de main (9bcdc0e), `--repeat-each=12 --workers=3`,
    rejoué le 2026-10-19 : 12 échecs sur 12, dont 11 « revision 3 au lieu
    de 2 » (l'attente illégitime) et 1 avec count 1 et distinctIds 1 (perte
    réelle). Un premier décompte du 2026-10-18, cité dans le message du
    commit b7ad92a, donnait 2 cas avec count 1 ; il n'a pas été rejoué.
  - Test « racing », `--repeat-each=20 --workers=4`, deux séries de 20 par
    combinaison, le 2026-10-19 (`ATELIER_GALLERY_SERVER_BIN` pour le serveur,
    `gallery/assets/diff_versions.js` échangé pour le client) :
    serveur et client de main : 1 puis 2 échecs sur 20 (count 1,
    distinctIds 1) ; serveur de main et client de la branche : 3 puis 2
    échecs ; serveur de la branche et client de main : 0 et 0 ; serveur et
    client de la branche : 0 et 0. L'E2E ne détecte la course qu'environ
    une fois sur dix : la preuve déterministe est le test Rust.
  - `des_post_versions_concurrents_ne_perdent_aucune_intervention`
    (`rust/crates/atelier-gallery/tests/http_smoke.rs`, 8 écrivains, 4 tours),
    rejoué le 2026-10-19 : avec le `git.rs` de main, 3 échecs sur 3 ; avec
    celui de la branche, 3 passages sur 3.
  - `diff_suite.mts` avec le `diff_versions.js` de main, le 2026-10-19 :
    échecs de B16b (« push avant le premier restore survit au journal d'une
    autre vue »), de B17b (« deux 409 de suite ») et de « 409 sans fin »,
    puis « diff suite: ÉCHEC après 291 tests verts » ; avec celui de la
    branche, « diff suite: ok (294 tests) ».

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
  d'exécution est vérifié par un journal des sondes.
- **Mesures** (binaire de test lancé seul, 3 instances en parallèle par tour,
  avec des boucles CPU, le 2026-10-19) : version de main, avec 2 boucles,
  36 passages sur 36 ; avec 4 boucles, 2 échecs sur 60 (`left: "input"
  right: "open"`). Version de la branche, avec 4 boucles : 60 sur 60. Le
  décompte « 8 échecs sur 36 » du 2026-10-18 (message du commit 0818527)
  n'a pas été reproduit à cette charge.

### `rust/crates/atelier-runtime/src/server_socket_tests.rs` — `stop_does_not_cancel_a_send_received_after_it`

- **Vu** : rejoué en local sous charge (même famille que le précédent).
- **Symptôme** : `left: "new" right: "stop"` (ligne 432 de l'ancienne version).
- **Cause** : la même (ordre des réponses supposé, délai d'horloge).
- **Statut** : corrigé le 2026-10-18.
- **Mesures** (mêmes conditions, le 2026-10-19) : version de main, avec
  2 boucles CPU, 5 échecs sur 36 (`left: String("new") right: "stop"`).
  Version de la branche, avec 4 boucles : 60 sur 60.

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
- Sous Chromium Linux (machines des agents), le même test échoue à chaque
  passage, avec le code de main comme avec celui de la branche (3 sur 3 le
  2026-10-19), sur des `pageerror` « The source image cannot be decoded » et
  « Failed to fetch » : symptôme distinct, propre à cet environnement, jamais
  vu en CI macOS.
- **Propriétaire** : Thierry (proposé). **Échéance** : 2026-11-01, à rejouer dans le job CI e2e (macOS).

### `gallery/tests/e2e/diff.spec.ts:348` — « latex: reload preserves the latest content after historical navigation »

- **Vu** : machine Linux des agents, Chromium, 2026-10-19 ; jamais signalé en
  CI macOS.
- **Symptôme** : après `page.reload()`, `#diffTag` reste actif et le compteur
  affiche `3/3` au lieu de `0` (ligne 377 ou 378).
- **Mesure** : sous charge (`--repeat-each=12 --workers=3`), 9 échecs sur 12
  avec le code de main (9bcdc0e) et 10 sur 12 sur `claude/maturite-3-ci` :
  le défaut précède les correctifs du 409. Une pause de 2 s avant le reload
  ne change rien (10 sur 12) : ce n'est pas une écriture en vol coupée par
  le rechargement.
- **Statut** : ouvert. Le test attend qu'aucune intervention ne reste à revoir
  après rechargement, alors que le journal du serveur en rend trois. Il faut
  établir laquelle des deux est la règle voulue avant de corriger le code ou
  l'attente.
- **Propriétaire** : Thierry (proposé). **Échéance** : 2026-11-01, décider d'abord de la règle voulue.

### `gallery/tests/e2e/pdf_toolbar.spec.ts:383` et `:477`

- **Vu** : `:477` au run 39149035918 (PR #56, chromium **et** webkit-reading) ;
  `:383` deux fois (confiance moyenne).
- **Symptôme** : `Received 80` au glisser d'une note ou d'un tampon PDF ; le
  test passe ensuite sur main sans changement dans `gallery/`.
- **Statut** : ouvert. Ce test garde le déplacement des annotations PDF : à
  traiter comme une régression possible, pas comme du bruit.
- **Propriétaire** : Thierry (proposé). **Échéance** : 2026-11-01.

### `gallery/tests/e2e/core.spec.ts:699`

- **Vu** : une fois dans les 100 derniers runs (audit du 2026-10-18).
- **Statut** : ouvert, cause non analysée.
- **Propriétaire** : Thierry (proposé). **Échéance** : 2026-11-15.

### `mobile-native` — `ChatTests.testWebQuoteSurvivesSelectionClearedWhileMenuDismisses`

- **Vu** : run 202 (job 109381033810), deux fois au total.
- **Statut** : ouvert. Swift ne compile pas sous Linux : à reproduire dans le
  job CI `mobile-native` ou sur le Mac.
- **Propriétaire** : Thierry (proposé). **Échéance** : 2026-11-15, job CI mobile-native ou Mac.

### `zotero.rs:1051` — `add_pdfs_reports_zotero_off`

- **Vu** : run 164 (job 108731485458).
- **Symptôme** : « error sending request » reçu au lieu de « zotero-off ».
- **Statut** : ouvert. Probablement une dépendance à l'état du réseau local
  (un port Zotero joignable ou non) plutôt qu'un réglage simulé.
- **Propriétaire** : Thierry (proposé). **Échéance** : 2026-11-15.

### Vitest — `EnvironmentTeardownError` dans `src/components/chat/turnAnatomy.test.tsx`

- **Vu** : run 39092563007 (job 117572201867, `verify`).
- **Symptôme** : « Closing rpc while onUserConsoleLog was pending » ; les 2444
  tests passent mais le processus sort en 1.
- **Statut** : ouvert. Un `console.*` émis après la fin du test (minuterie ou
  promesse non attendue) ; à chercher dans ce fichier.
- **Propriétaire** : Thierry (proposé). **Échéance** : 2026-11-15.
