# Plan 080 — Annexe d'exécution pour Grok et de vérification pour Codex

Révision du 2026-09-14, sources examinées à `4dc49144` avec état local présent.
Complète le [plan principal](080-harness-recherche-scientifique.md).
**Tous les nouveaux types, chemins et messages ci-dessous sont à implémenter.**
Ils ne désignent pas des API déjà disponibles.

## 0. Mode de livraison et décisions transversales

Grok implémente ; Codex vérifie indépendamment. Livraisons : A1, A2, A3, B,
C1a, C1b, C2a, C2b, C2c, D, E. Aucun lot suivant avant le retour de revue du
précédent. B reste indépendant si l'ordre est explicitement adapté.

Avant chaque livraison :

1. Lire AGENTS.md, le lot et les fichiers qu'il cite ; relever HEAD et
   `git status --short`. Ne pas reprendre les transactions d'une autre tâche.
2. Comparer les symboles avec l'audit ; adapter les détails mécaniques au code
   courant. Documenter une divergence qui change un contrat avant de l'implémenter.
3. Capturer le diff initial des fichiers déjà modifiés. Limiter les changements
   aux surfaces nécessaires ; ne pas reformater un module entier.
4. Ajouter les scénarios de régression pertinents, les exécuter, implémenter,
   puis vérifier. Ne pas faire passer un test en retirant la condition qu'il vérifie.
5. Remettre le dossier de revue défini en section 8. Le statut TODO n'est pas
   remplacé par DONE sur le seul compte rendu de l'implémenteur.

Décisions communes :

- **Pas de nouvelle base de données ni de framework d'orchestration.** Stores
  JSON versionnés et fichiers par enregistrement ; réutiliser les primitives
  `write_file_atomic_durable` d'`atelier-store` et les verrous partagés existants.
- **Écriture durable avant effet externe.** Aucun verrou de store conservé pendant
  un appel provider/SSH/processus. Après erreur de persistance, ne pas poursuivre
  l'action qui dépend de cet enregistrement.
- **Autorité unique par donnée.** `run.json` appartient au runner ; le coordinateur
  écrit son dossier séparé. La galerie et le chat consomment ces données.
- **Identités.** UUID v4 pour les nouveaux records ; clés idempotentes en SHA-256
  d'un JSON canonique (clés triées, UTF-8, tableaux ordonnés). Pas de hash dépendant
  du processus Rust. Validation des identifiants avant de construire un chemin.
- **Évolutions additives.** Nouveau champ optionnel et lecteur ancien conservé ;
  `null`/absent signifie inconnu, jamais réussite. Les champs inconnus ne sont pas
  effacés par une lecture/réécriture partielle. Version future => erreur explicite.
- **Portée.** Les routes de lecture et de mutation réutilisent l'authentification,
  les permissions et l'autorisation de projet existantes. Aucun accès par chemin
  arbitraire fourni par le client. Tests de refus interprojets pour les nouvelles routes.

## 1. Carte d'intégration

Les symboles sont plus stables que les numéros de ligne. Les nouveaux modules
sont des emplacements prescrits ; une fusion avec un module déjà équivalent est
acceptable si justifiée dans le dossier de revue.

| Domaine | Existant à réutiliser | Ajout ciblé |
| --- | --- | --- |
| Clôture de tour | `atelier-harness/src/thread.rs::terminal`, `atelier-runtime/src/send.rs` pompe et terminal de repli | Préparation des entrées de revue, notification après append réussi |
| Stores/boot | `atelier-store/src/lib.rs`, `receipts.rs`, `atelier-runtime/src/state.rs`, `server.rs::serve_once` | `reviews.rs`, puis `experiments.rs` et `research_state.rs` côté store |
| Exécution de revue | `atelier-providers/src/traits.rs`, `claude.rs`, `codex.rs` | Contrat de requête de revue isolée et contrôles de capacité |
| Revue runtime | `ws_router.rs::requestReview`, `ws_dispatch.rs` | `atelier-runtime/src/review.rs`, routage et file bornée |
| Revue affichée | `src/components/Chat.tsx`, `chat/ChatTimeline.tsx`, `chat/turns.tsx`, `src/App.tsx` | Attribution au tour, lecture après reconnexion, état non concluant |
| Protocole | `rust/crates/atelier-protocol/src/lib.rs`, `packages/atelier-protocol/src/`, `src/lib/ws.ts` | Types/fixtures additifs ; export des nouveaux types depuis les index |
| Épingles | `evidence.rs`, handlers pin/list/unpin de `ws_router.rs` | Erreurs typées et conservation des octets |
| Calculs | `scripts/atelier-run`, `atelier-workspace/src/compute/{local,nas,slurm,types}.rs` | Manifeste v2 et projection compatible |
| Coordination | Adaptateurs Calculs, `state.rs`, `server.rs` | `atelier-runtime/src/experiments.rs` ; état durable distinct du runner |
| Provenance | `atelier-runtime/src/prov.rs::record_done` | Référence au producteur exact lorsqu'il est déclaré |
| Contexte | `send.rs::handoff_context`, `prepare_provider_handoff`, injection KB, reçu de contexte | `atelier-runtime/src/research_state.rs` ; projection bornée |

## 2. A — Revue : contrats et étapes

### A1. Faire disparaître les faux résultats positifs

Corriger d'abord le chemin actuel, avant la nouvelle orchestration :

1. `requestReview` ne doit plus convertir texte vide ou sous-chaîne « no findings »
   en succès. Le texte natif sans résultat structuré est conservé, avec verdict
   non concluant. Les erreurs provider conservent leur raison.
2. Dans le détail de `ChatTimeline`, `issues.length === 0` ne doit jamais suffire
   à afficher `review.ok-detail`. Vérifier explicitement un verdict positif.
3. Conserver la revue Git native et la désigner comme telle ; l'absence de finding
   n'atteste ni une affirmation ni une propriété scientifique.
4. Utiliser la barre de revue existante ; ne pas recréer le badge de ResultCapsule
   retiré volontairement. Tests concernés : rendu compact et détail développé.

**Tests A1 :** vide, espaces, sortie sans champ attendu, erreur provider, phrase
« no findings dans X, mais erreur dans Y », verdict non concluant sans issue.
Vérifier bandeau ET détail développé. Aucun de ces cas ne montre de validation.

### A2. Stocker et exécuter une revue isolée

Créer `atelier-store/src/reviews.rs` et `atelier-runtime/src/review.rs`.
Stockage proposé : `<app_dir>/reviews/<reviewId>.json` et `inputs/<inputHash>.json`.
Ne pas modifier les fichiers du projet analysé pour stocker une revue.

Contrat persistant minimal (camelCase, sauf la configuration historique conservée) :

```typescript
type ReviewRecord = {
  schemaVersion: 1;
  reviewId: string; threadId: string; turnId: string;
  inputHash: string; configHash: string; dedupKey: string;
  clientRequestId: string | null;
  mode: 'claims' | 'git';
  trigger: 'manual' | 'automatic' | 'correction';
  config: { provider: string; model: string; effort: string };
  policy: { enabled: boolean; trigger: 'always' | 'files-changed' | 'manual';
    autofix: boolean; maxCorrections: 1 };
  status: 'queued' | 'running' | 'completed' | 'error' | 'cancelled' | 'interrupted';
  outcome: 'passed' | 'failed' | 'inconclusive' | null;
  coverage: 'complete' | 'partial' | 'unavailable';
  checks: Array<{ id: string; claim: string;
    outcome: 'passed' | 'failed' | 'inconclusive'; evidenceIds: string[] }>;
  limitations: string[];
  attempt: number; createdAt: string; updatedAt: string;
  error: { code: string; message: string } | null;
};
```

`ReviewInput` contient le prompt et les réponses du tour (tous les blocs finaux),
des références résolubles aux événements outils avec résultat/code retour, les
artefacts connus et un diff **figé au tour ciblé**. Chaque preuve a un `evidenceId`,
son origine et son empreinte. La liste indique les données manquantes et les
troncatures. Les gros objets utilisent un stockage adressé par contenu et le
même principe de vérification longueur/SHA-256 que les payloads du journal.

Le dossier fixe **avant** la réponse un `scopeId` et des `requiredChecks` :
`{id, claim, targetEvidenceIds, requiredEvidenceIds}`. IDs uniques, issus du
périmètre demandé/profil de projet ; le résultat doit répondre à chacun. L'exécutant
de la revue ne choisit pas seul le sous-ensemble facile à certifier. Pour une
demande libre dont on ne peut délimiter les contrôles, conserver les constats
individuels et une couverture partielle : ne pas produire un passed global.
Le backend calcule coverage à partir de cette table et des preuves disponibles.
La configHash inclut aussi la policy capturée et la version du protocole de revue.

Règles de décision appliquées par le backend :

- JSON conforme et verdict par contrôle obligatoire ; pas de recherche de mots.
- Toute référence inconnue est rejetée. Un contrôle échoué impose `failed`.
- Zéro contrôle, couverture partielle/inaccessible, preuve requise manquante ou
  contrôle non concluant => résultat global `inconclusive` s'il n'y a aucun échec.
- `passed` exige au moins un contrôle, tous réussis et couverture complète du
  périmètre déclaré. Il signifie « contrôles déclarés réussis », jamais « science vraie ».
- Le modèle propose ses constats ; le backend calcule le résultat global.

**Isolation provider :** ne pas réutiliser `session_id` ni `set_handler` du fil
source. Ajouter une méthode dédiée au trait Provider, par exemple
`review(ReviewRequest) -> ReviewResponse`, avec une capacité explicite et un
résultat unsupported par défaut. Ce nom est nouveau, pas une API native supposée.
Pour cette première version, le dossier de preuves est fourni à une session
distincte **sans outils**, ni MCP hérité ni interaction permettant d'en autoriser.
Utiliser les contrôles effectifs de désactivation des outils des adaptateurs.
Une évolution autorisant des outils de lecture fera l'objet d'un contrat séparé.
Un simple prompt « lecture seule »
ou un `permissionMode=plan` non contrôlé ne suffit pas. Vérifier les paramètres
effectifs des adaptateurs Codex/Claude installés au moment de l'implémentation.
Si un provider ne permet pas ce contrat, retourner `REVIEW_UNSUPPORTED` sans fallback
silencieux ; garder le réglage choisi. Ne pas ajouter d'adaptateur complet dans ce lot.

La capacité nouvelle `structuredReview` est distincte du booléen `review` existant
dans `ProviderCapabilities`, qui désigne la commande native. Valeur false par
défaut pour un provider sans implémentation et tests de ce contrat.

**Bornes initiales :** deux revues simultanées globalement, une par fil ; timeout
90 s par tentative ; dossier transmis plafonné à 128 KiB UTF-8. Les preuves restent
stockées intégralement ; dossier qui dépasse la capacité sans accès complémentaire
=> couverture partielle. Ce sont des constantes testables, pas des limites des
providers prétendument universelles.

**Compatibilité WS :**

À partir d'A2, `mode: git` évalue le diff figé du tour via le nouveau reviewer sans
outils. `/review` conserve la fonction de revue Git, mais son exécution utilise
ce dossier attribuable au tour plutôt qu'une session native sur le worktree mouvant.
**Changement de périmètre explicite :** A1 conserve provisoirement les modifications
actuellement non commitées ; A2 cible les changements du tour sélectionné. L'interface
doit nommer ce périmètre et le dossier doit l'enregistrer. Ne pas présenter cette
revue comme une vérification de tous les changements du dépôt. Un test avec des
modifications préexistantes hors tour vérifie la différence.
La méthode `native_command('review')` et sa capacité historique restent distinctes ;
le nouvel orchestrateur ne les appelle pas et ne réutilise jamais leur session.
Cette modification de routage doit être couverte par un test de la commande `/review`.

- `requestReview {requestId, threadId, turnId?, mode?, autoReview?}` : défaut `claims`.
  Sans `turnId`, résoudre le dernier tour terminé **à l'admission**, puis figer cet ID.
  `/review` garde son usage Git via `mode: 'git'` explicite dans le frontend.
  Retry avec même requestId => même réservation, mêmes IDs et même dossier figé,
  même si un autre tour s'est terminé entre-temps. Même requestId avec payload
  différent => collision, sans nouvel appel. Un nouvel essai explicite emploie un
  nouvel ID ; l'index peut être reconstruit depuis les records durables.
- `getReviews {requestId, threadId, before?, limit?}` : lecture paginée, défaut 20,
  maximum 100, filtrée au fil autorisé ; réponse `reviews`.
- `reviewResult` conserve `status: running|done` et `verdict` historiques, ajoute
  `reviewId`, `turnId`, `outcome`, `coverage`, `mode`. Mapping : passed→ok,
  failed→issues, inconclusive/interrupted/cancelled→inconclusive, error→error.
  queued se projette en running pour les anciens clients, avec executionStatus
  exact pour les clients récents ; il ne devient jamais un verdict de fin.
- Lecture historique : `unparseable` et `unavailable` deviennent non concluants
  avec la cause conservée ; les anciens `error` restent des erreurs. Ne pas
  promouvoir les anciens `ok` en nouvelles validations complètes sans leur dossier.
- `checkedTools`/`checkedFiles` ne contiennent que les éléments effectivement
  examinés, pas tous les éléments disponibles ; `checks` est leur compte déclaré.
- UI : stockage par `(threadId, turnId, reviewId)`, relecture via `getReviews` à
  la sélection/reconnexion. Un ancien résultat ne remplace pas celui du tour courant.
  Les anciens verdicts sans identité ne sont pas attribués arbitrairement à un tour.

**Tests A2 :** configuration respectée, session isolée, écriture refusée par le
contrat provider, preuve inconnue, aucun contrôle, couverture partielle, résultat
tardif du tour N pendant N+1, reconnexion, ID de fil d'un autre projet refusé.
Ajouter omission d'un requiredCheck, doublon de checkId et sortie qui annonce une
couverture complète malgré une preuve requise manquante : jamais passed.

### A3. Déclenchement automatique, crash et correction

Le point sûr est le **succès de l'écriture du terminal unique**, pas le booléen
en mémoire du tour. `HarnessThread::terminal` peut changer l'état avant que
`try_append` réussisse : son état seul ne prouve pas la durabilité.

1. Figer configuration effective et intention de revue à l'admission du tour,
   selon `enabled` et le trigger `always|files-changed|manual` existant.
   Normaliser explicitement la valeur historique `turn` en `always`. Une valeur
   inconnue est refusée ou signalée, jamais convertie en lancement systématique.
2. À la clôture, capturer le dossier avant qu'un tour suivant puisse changer les
   fichiers ; IO lourdes hors verrou et hors worker async bloquant. Si cette
   capture n'est pas sûre, déclarer les preuves indisponibles, sans lire un diff
   ultérieur en l'attribuant au tour précédent.
3. Inclure la référence du dossier et l'intention/configuration dans le terminal
   durable. Après append réussi, réserver la revue puis réveiller la file.
   Traiter les deux sorties de `send.rs` (pompe native et terminal de repli).
4. Clé automatique : SHA-256 de `{threadId, turnId, inputHash, configHash, mode}`.
   Réservation atomique => un seul record automatique. Un nouvel essai manuel
   après état terminal conserve un lien `supersedesReviewId`, sans l'écraser.
5. Au boot : réconcilier les terminaux portant explicitement cette intention avec
   le store. Terminal écrit mais record absent => réservation ; queued => reprise ;
   running => interrupted. Pas de revue rétroactive de tout l'historique ancien.
6. Une revue interrompue peut avoir une unique nouvelle tentative automatique,
   toujours isolée ; au deuxième arrêt rester interrupted jusqu'à une action
   explicite. Tentative annulée => aucune reprise automatique.
7. Déclenchement uniquement sur tour terminé avec réponse exploitable ; pas sur
   steer isolé, replay, heartbeat, erreur de lancement ou interruption utilisateur.
8. Préserver l'option `autofix` : si activée, au plus une correction automatique
   par chaîne dans cette version, puis revue de correction sans boucle supplémentaire.
   La demande de correction est persistée/dédupliquée et ciblée sur le tour concerné.
   La suspendre si un nouveau tour utilisateur a déjà commencé ; ne jamais injecter
   une correction devenue ancienne dans ce tour. L'action manuelle reste disponible.
   Remplacer l'envoi frontend aveugle dans `App.tsx` pour éviter deux propriétaires.

**Tests A3 :** deux terminaux candidats→un record ; append terminal échoué→zéro appel
provider ; crash entre terminal et réservation ; déconnexion UI sans perte ; boot
sur vieil historique sans revue ; budgets/concurrence ; annulation ; correction
exactement une fois et résultat ancien n'entraînant aucune modification nouvelle.

## 3. B — Contrat d'erreur des preuves

Faire retourner à `load` et aux opérations publiques un `Result` ; erreurs
`Io`, `InvalidJson`, `UnsupportedVersion`. `NotFound` seul retourne un registre neuf.
Accepter les fichiers v1 existants et leurs valeurs par défaut documentées.
Supprimer également dans `save` le fallback de sérialisation vers un registre
vide ; propager l'erreur avant tout remplacement.

- `listPins` : sur erreur conserver l'état UI connu et afficher l'erreur ; ne pas
  envoyer `pins: []` comme une réponse réussie.
- `pinPassage` et `unpinPassage` : transmettre `requestId`, code et message ; aucun
  remplacement ni réinitialisation du fichier. Adapter les noms de réponses à ceux
  des handlers existants, sans créer un deuxième protocole de preuve.
- Ne pas créer d'outil de réparation automatique. Documenter seulement la procédure
  de copie binaire préalable à une réparation explicitement demandée.

Chemins existants à préserver : `evidence_pins_error`, `handle_list_pins`,
`handle_pin_passage`, `handle_unpin_passage` et `src/lib/evidencePins.ts::pushEvidencePins`.
Ce dernier conserve déjà le cache en cas d'erreur ; son comportement est testé
dans `src/components/chat/PassageCard.test.tsx`.

**Scénarios nommés :** `missing_store_is_empty`, `corrupt_add_preserves_bytes`,
`corrupt_remove_preserves_bytes`, `unreadable_store_does_not_clear_ui`,
`future_version_is_rejected`, `v1_source_defaults_and_dedup_unchanged`.
Pour erreur IO reproductible, utiliser une abstraction de lecture injectée ou un
chemin qui est un dossier ; ne pas dépendre d'un chmod inefficace sous privilèges.

## 4. C1 — Manifeste et filiation des résultats

### C1a. Format disque v2 et lanceur

Conserver `<runs_dir>/<id>/run.json` et `log.txt`. Les anciens champs snake_case
restent inchangés pour les lecteurs historiques. Les projections WS restent camelCase.
V2 ajoute un objet `experiment` ; un lecteur v1 ne doit pas être supposé capable de
la lire : publier le lecteur compatible avant d'activer le writer v2 dans le bundle.

```typescript
type ExperimentFields = {
  experiment_id: string; // commun à plusieurs exécutions comparées
  thread_id: string | null; turn_id: string | null;
  submission_key: string;
  argv: string[]; redacted_arg_indices: number[];
  execution_fingerprint: string;
  native_job: { kind: 'local' | 'slurm'; host: string;
    pid?: number; process_started_at?: string; boot_id?: string;
    cluster?: string; job_id?: string; submitted_at?: string } | null;
  inputs: ArtifactIdentity[]; outputs: ArtifactIdentity[];
  code: { head: string | null; snapshot_ref: string | null;
    declared_files: ArtifactIdentity[]; completeness: 'complete' | 'partial' | 'unknown' };
  environment: { executable: string | null; executable_version: string | null;
    lockfiles: ArtifactIdentity[]; declared: Record<string, string>;
    completeness: 'complete' | 'partial' | 'unknown' };
};
type ArtifactIdentity = {
  id: string; uri: string; sha256: string | null; immutable_version: string | null;
  bytes: number | null; observed_at: string;
  status: 'observed' | 'declared' | 'missing' | 'changed_during_read' | 'unknown';
};
```

Nouveaux paramètres CLI : `--experiment-id`, `--thread-id`, `--turn-id`,
`--submission-key`, `--spec <json>`. Garder les options actuelles et `-- cmd args…`.
Sans identifiants, générer une expérience/exécution autonome et laisser les IDs de
conversation à null. Le fichier spec contient `inputs`, `outputs`, `codeFiles`,
`environment` déclarés ; schéma versionné strict, chemins relatifs résolus contre cwd.

1. Construire le manifeste et le persister durablement avant Popen. Sauvegarder
   `argv` comme tableau, pas comme commande shell à rejouer. Une nouvelle exécution
   utilise ce tableau directement ; aucun `shell=True` implicite.
2. Expurger les valeurs explicitement déclarées sensibles ; fingerprint sur la
   représentation expurgée et l'identité de configuration requise, jamais sur un
   secret de faible entropie. Marquer la reproductibilité partielle si besoin.
3. Capturer exécutables/versions sur l'hôte du lancement. `uv`, conda ou un shell
   peuvent masquer l'interpréteur réel : le déclarer inconnu tant qu'une sonde du
   processus d'exécution ne le fournit pas. Aucun Python du serveur comme substitution.
4. Empreintes des entrées avant lancement ; sorties après terminaison. Vérifier
   la stabilité du fichier pendant la lecture. Identité en conflit => aucune
   revendication de reproductibilité complète. Inputs manquants obligatoires => refus.
5. Le pilote déclare ses fichiers de code. Un HEAD seul avec changements locaux
   n'est pas complet ; utiliser le snapshot existant s'il couvre le code réellement
   exécuté, sinon conserver les empreintes et signaler ce qui n'est pas archivé.
6. Une mutation ultérieure des entrées non immuables peut survenir pendant le run :
   recontrôler après, marquer l'expérience non reproductible si elles ont changé.
   Pour une garantie forte, exiger des entrées déclarées immuables ou copiées avant
   exécution dans la portée autorisée ; aucun snapshot massif automatique.

**Tests C1a :** étendre `scripts/tests/test_atelier_run.py` : commande >200 caractères,
arguments espaces/quotes/Unicode, secret déclaré absent du JSON, input absent,
input changé, output manquant, lancement sans thread, v1 projeté sans champs inventés.
Conserver les tests actuels de code retour, signaux, progression et logs.

### C1b. Lier artefact et producteur exact

`run.json` reste la source de vérité. Le store expériences référence son URI,
son hôte, son empreinte/version et l'identité du run ; il n'en devient pas un second
éditeur. Une observation obsolète porte sa date et n'écrase pas une observation récente.

Ajouter à `.prov.json` des références explicites `{experimentId, runId, outputHash}`.
Conserver les entrées historiques et le contexte léger du tour. Classer la relation
`declared_output` si la sortie est enregistrée et son hash concorde ; sinon
`turn_context` ou `unknown`. Un renommage sans hash concordant ne suffit pas.

**Tests C1b :** deux scripts préexistants produisent deux figures pendant le même
tour : chaque figure pointe vers son run ; ancienne provenance lisible ; figure
modifiée après coup identifiée périmée ; `.csv`, `.nc` et fichiers de résultat
peuvent être artefacts même si le viewer ne les classe pas comme figures.

## 5. C2 — Coordinateur et validation scientifique

### C2a. Reprise locale durable

Store proposé : `<app_dir>/experiments/<experimentId>/runs/<runId>.json`.
Inclure `revision`, `submissionKey`, `specHash`, lien vers manifeste, état observé,
intentions de validation et de continuation. Le runner est seul écrivain de son
manifeste ; le coordinateur est seul écrivain de ses intentions.

Transitions du coordinateur :

| État | Observation/action | État suivant et effet permis |
| --- | --- | --- |
| prepared | Intention durable, lancement admis | submitting, puis appel unique à l'adaptateur |
| submitting | Accusé natif connu | queued ou running ; persister l'identité |
| submitting | Timeout/crash après appel possible | unknown ; réconciliation, aucun nouvel appel de lancement |
| queued/running | Identité native toujours active | Conserver l'état observé |
| queued/running | Terminal natif confirmé | completed, failed ou cancelled |
| queued/running | Processus disparu sans terminal fiable | unknown |
| unknown | Identité retrouvée avec corrélation complète | État natif observé |
| unknown | Zéro correspondance ou plusieurs correspondances | Rester unknown, exposer la raison |
| completed/failed/cancelled | Actualisation de l'UI ou boot | Aucun relancement automatique |

Le lanceur accepte une `submissionKey` fournie avant exécution : réservation
durable exclusive par clé, comparaison du specHash, et recherche par clé.
Même clé + même spec => retourne le record existant ; même clé + autre spec =>
collision. Un record réservé dont on ignore s'il a lancé son enfant reste inconnu,
même si cela nécessite une résolution explicite. On préfère cet état à un doublon.

L'exécution gérée doit survivre à la fermeture de sa connexion cliente : runner
détaché sous l'autorité du lanceur local, logs sur fichier, pas de dépendance au
pipe stdout du chat. Garder le mode CLI interactif historique. Ne pas détourner
les signaux des commandes utilisateur non gérées.

Identité locale : hôte, PID, heure de création du processus et identité de boot
quand disponible. Si une composante manque, ne pas conclure à une correspondance
forte sur le seul PID. Le PID réutilisé ne reçoit jamais une annulation destinée
à l'ancien calcul.

### C2b. Contrôles exécutables et invalidation

Profil projet proposé : `.atelier/science.json`, chargé uniquement pour un projet
dans lequel l'exécution de ces commandes est autorisée. Lire le profil n'exécute
rien. Un changement de profil change son hash et ne réautorise pas de nouvelles
actions externes par lui-même.

```json
{
  "schemaVersion": 1,
  "checks": [{
    "id": "linear-fit",
    "cwd": "{projectRoot}",
    "argv": ["python3", "check_result.py", "--result", "{artifact:result}", "--output", "{attemptDir}/result.json"],
    "timeoutSeconds": 30,
    "resultFile": "result.json",
    "required": true,
    "criteria": [
      {"metric": "slope", "expected": 2.0, "absTolerance": 1e-10},
      {"metric": "intercept", "expected": 1.0, "absTolerance": 1e-10}
    ]
  }]
}
```

Exemple de résultat de commande : `{ "schemaVersion": 1, "metrics":
{ "slope": 2.0, "intercept": 1.0 }, "units": { "slope": "m/year" } }`.
Le runner remplace les variables autorisées dans chaque argument, sans shell :
`{projectRoot}` est la racine autorisée, `{attemptDir}` un nouveau dossier absolu
privé de la tentative, `{artifact:result}` le chemin absolu de l'artefact nommé
`result` du run ciblé, après vérification de son hash. Variable inconnue => refus.
`resultFile` se résout exclusivement sous attemptDir, jamais sous cwd ; la commande
reçoit explicitement son chemin de sortie via `--output`. Les checks tournent sur
l'hôte où ces chemins et entrées sont accessibles. Une entrée distante indisponible
ne se résout jamais contre un fichier local homonyme. Les adaptateurs peuvent
transférer une copie vérifiée par hash dans le dossier de tentative autorisé.

Le validateur backend contrôle schéma, valeurs finies, métriques requises,
tolérances et unités lorsqu'un critère les déclare. Il calcule le verdict ; un
champ arbitraire `passed: true` n'est pas une autorité. Refuser NaN/Inf, résultat
ancien non produit par cette tentative, sortie hors périmètre et lien symbolique
qui échappe au dossier autorisé.

Un `ValidationRecord` immuable comprend `validationId`, `runId`, `checkId`,
`profileHash`, `artifactHashes`, `codeHashes`, mesures et journaux, horaires,
et `outcome: passed|failed|inconclusive|error`. Sa projection de lecture ajoute
`freshness: current|stale|unknown` et `observedAt` en comparant les dépendances
actuelles ; elle ne réécrit pas le résultat historique. Persister si nécessaire
des observations versionnées distinctes. Recontrôler avant une décision automatique,
et non seulement lors de la première ouverture de la page.
Une tentative de contrôle a son propre ID et dossier ; publier le résultat par
remplacement atomique seulement après sa réussite d'écriture. Ne pas réutiliser
un fichier de résultat laissé par une exécution précédente.

Séparer statuts de calcul, de validation et de revue LLM. Un résultat validé par
un profil partiel affiche le nom/périmètre du profil. Si aucun contrôle requis
n'est défini, la validation reste absente, pas passed. Profil/code/artefact changé
=> ancien record conservé, fraîcheur stale ; contenu inaccessible => unknown.

Contrôles automatiques de cette version : lectures et écritures de rapports dans
un dossier dédié, jamais soumission d'un nouveau calcul principal. Après crash,
réconcilier une tentative encore active avant de la reprendre. Une nouvelle
tentative conserve l'ancien record ; toute commande à effet externe exige une
politique d'idempotence propre et reste hors exécution automatique par défaut.

### C2c. Adapter NAS/Slurm puis réveiller l'agent

Étendre les adaptateurs existants, sans installer de service distant dans ce lot.
Local/NAS avec runner disponible utilisent la même clé de soumission. Slurm conserve
profil/cluster, job ID et date de soumission, avec clé de corrélation persistée
dans un manifeste de lancement et une métadonnée scheduler supportée. Vérifier
cette capacité sur la version cible ; ne pas inventer une option `sbatch`.

La recherche après accusé perdu utilise l'ensemble des identifiants, pas seulement
le nom de job ni la fenêtre « 200 runs » de l'UI. Rétention scheduler insuffisante
=> unknown. L'impossibilité de retrouver un job n'autorise pas sa resoumission.

Politique de continuation par run : `{allowed, targetThreadId, maxResumes: 1,
remainingBudget}` figée dans le mandat de départ. Par défaut allowed=false si
aucune continuation n'a été autorisée. Persister un message de reprise avec clé
stable fondée sur run+terminal+validation ; utiliser les reçus/idempotence existants
du send. Respecter les nouveaux messages utilisateur et mettre en attente si le
fil travaille déjà. Ni interrogation périodique du LLM ni boucle de réveil.

Les routes proposées sont `experimentGet`, `experimentList`, `experimentLaunch`,
`experimentReconcile`, `experimentValidate`, `experimentCancel` ; réponses avec
`requestId`, `experimentId`, `runId`, `revision` et erreur typée. Les lectures sont
bornées et les mutations classées par la lane du run/projet dans `ws_dispatch`.
Une mutation nécessite `expectedRevision` et `requestId` stable : conflit =>
`REVISION_CONFLICT` sans exécution. Le serveur alloue ou confirme le runId lors de
la réservation ; le retry de la même demande retrouve cette réservation.
Ordre obligatoire : lookup du requestId → comparaison de son empreinte si connu
→ retour du résultat/réservation existants ; pour un ID nouveau seulement, contrôle
expectedRevision puis réservation durable. Même ID et autre payload =>
`REQUEST_COLLISION`. Ainsi un accusé perdu ne devient pas un conflit de révision.

**Tests C2 :** injection de crash avant réservation, après réservation avant appel,
après appel avant ack, après ack avant sauvegarde ; même clé/spec différente ; PID
réutilisé ; job retrouvé hors liste UI ; réseau coupé ; annulation ; deux reprises
concurrentes ; script code 0 avec métrique fausse ; résultats périmés/manquants ;
aucun réveil sans mandat ; un réveil durable malgré deux observations du même terminal.

## 6. D — État scientifique et contexte injecté

Store proposé : `<app_dir>/research-state/<projectKey>/<objectiveId>.json`.
Le projectKey est dérivé de la racine canonique ; un objectif ne se confond pas
avec tous les projets ouverts. Les fils référencent explicitement objectiveId.

```typescript
type ResearchState = {
  schemaVersion: 1; revision: number; objectiveId: string; projectKey: string;
  question: string; constraints: string[];
  entries: Array<{ id: string;
    kind: 'hypothesis' | 'observation' | 'decision' | 'rejected_attempt' | 'limitation';
    text: string; origin: 'user' | 'agent' | 'validator';
    sourceEventIds: string[]; runIds: string[]; validationIds: string[];
    freshness: 'current' | 'stale' | 'unknown' }>;
  activeRunIds: string[]; nextAction: string | null;
};
```

L'origine est attribuée par le backend depuis l'appel authentifié, jamais acceptée
sur parole dans le payload d'un agent. Une décision humaine référence le message
utilisateur correspondant. Une observation de validation référence un record
existant et ses empreintes ; une proposition LLM reste agent/hypothesis.

Ajouter `researchStateGet`, `researchStateUpdate {expectedRevision, patch}` et
`researchContextPreview` ; l'agent reçoit le même accès borné par le mécanisme
MCP existant, après autorisation de projet et de fil. Conflit => relecture et patch
explicite ; pas de last-write-wins sur une décision humaine. Conserver un historique
de révisions permettant de retrouver l'origine d'une entrée modifiée.

Projection déterministe, plafonnée à 8 000 caractères Unicode : contraintes et
décisions, calculs actifs, résultats et limites pertinents, prochaine action ;
indiquer les omissions et donner une référence de lecture. Ne pas résumer une
nouvelle fois avec un modèle pour chaque envoi. Le reçu de contexte stocke
`researchStateRevision`, `researchContextHash`, `providedChars`, `truncated`.

Injecter à l'ouverture d'un fil lié à cet objectif, au handoff et lorsque la
révision change ; proposer la lecture explicite ensuite. Pour un événement de
compaction exposé publiquement, invalider le marqueur de livraison et réinjecter
au prochain tour. Si le provider ne l'expose pas, conserver la commande de lecture
et tester la reprise ; ne pas déduire de l'absence d'événement que le contexte existe.

**Tests D :** révision concurrente refusée sans écrasement ; agent se déclarant
utilisateur refusé ; validation introuvable rejetée ; projection stable/bornée ;
handoff transmet la même décision ; dépendance modifiée produit stale ; journal
du reçu reflète exactement le texte injecté.

## 7. E — Pilote exact et commandes de vérification

Créer `tests/fixtures/science-harness/` avec `data.csv`, `fit.py`,
`check_result.py`, profil science et README. Ajouter `scripts/tests/test_science_harness.py`
et, pour l'orchestration Rust, `atelier-runtime/tests/science_harness.rs`.
Tous les scénarios copient la fixture dans un répertoire temporaire avant exécution.

Fixture sans dépendance scientifique supplémentaire : x=[0,1,2,3,4] années,
y=[1,3,5,7,9] mètres. `fit.py` calcule par moindres carrés avec la stdlib,
écrit `result.json` (pente/intercept/unités) et `figure.svg`. Oracle indépendant
dans le test : pente 2, intercept 1, erreur absolue ≤1e-10. Aucune figure existante
du manuscrit réutilisée ou modifiée.

Matrice minimale :

| ID | Perturbation | Assertion de bout en bout |
| --- | --- | --- |
| S01 | Aucune | Code 0, validation passed/current, hashes et producteur concordants |
| S02 | y multiplié par 1000 mais déclaré en mètres | Code 0, validation failed, aucun succès scientifique affiché |
| S03 | Résultat JSON d'un run précédent laissé sur disque | Rejet du résultat ancien, inconclusive/error |
| S04 | Arrêt du coordinateur après lancement | Retrouve le même run ; compteur de lancements reste 1 |
| S05 | Écriture de reçu revue échouée | Pas de badge positif et aucune revue perdue déclarée terminée |
| S06 | data.csv changé après validation | Ancienne validation conservée, freshness stale |
| S07 | Nouveau tour pendant revue de l'ancien | Verdict reste attribué à l'ancien, aucune correction automatique du nouveau |
| S08 | Handoff avec décision « conserver les unités SI » | Décision et limites présentes dans le contexte réellement transmis |
| S09 | Réseau Slurm interrompu après soumission simulée | État unknown puis job retrouvé, zéro seconde soumission |
| S10 | Annulation puis événements tardifs | Aucun réveil ni relancement, annulation conservée |

Commandes depuis la racine (tests nouveaux marqués dans le tableau) :

| Lot | Commandes exactes minimales |
| --- | --- |
| A1 | `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime review` ; `npx vitest run src/components/chat/ChatTimeline.review.test.tsx` (nouveau) |
| A2/A3 | `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-store -p atelier-runtime -p atelier-providers review` ; `npx vitest run src/components/Chat.review.test.tsx src/App.orchestration.test.tsx` (premier nouveau) ; `npm run test:protocol` ; `npm run typecheck` |
| B | `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime evidence` ; `npx vitest run src/components/chat/PassageCard.test.tsx` |
| C1a | `python3 scripts/tests/test_atelier_run.py` ; `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-workspace compute` |
| C1b | `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime prov` ; tests store expériences nouveaux |
| C2 | `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-store -p atelier-runtime experiments` ; `python3 scripts/tests/test_science_harness.py` (nouveau) |
| D | `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-store -p atelier-runtime research_state` ; `npm run test:protocol` |
| E | `cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime --test science_harness` (nouveau) ; `python3 scripts/tests/test_science_harness.py` ; `npm run verify` pour clôture transversale |

Nommer les tests ajoutés de sorte que les filtres ci-dessus les exécutent.
**Une commande avec zéro test sélectionné n'est pas une preuve.** Si un chemin
est renommé pour respecter l'organisation actuelle, mettre à jour cette table
avant remise au réviseur. Pas d'installation via npx si la dépendance locale manque.
Couverture protocole mobile requise pour les champs consommés par ces clients.

Régressions existantes à conserver, même si un filtre `review` ne les sélectionne
pas : `append_failure_is_visible_and_never_claimed_durable`,
`provider_events_drain_before_synthetic_done`,
`stable_send_id_is_idempotent_and_persists_across_state_reopen`,
`stop_wins_before_a_duplicate_retry`, `permission_modes_map_to_real_codex_policies`,
`evidence_pin_deserializes_legacy_json_without_source_field`. Les exécuter avec
le filtre exact dans leur crate si le lot modifie leur chemin.

Après les tests déterministes : au moins un essai isolé avec chaque provider
annoncé compatible avec la revue, et un essai réel de reprise/handoff. Rapporter
modèle/version, scénario, nombre d'essais, résultat attendu/observé, durée et coût
disponible. Garder « non mesuré » quand indisponible. Essais longs/HPC selon le
budget et les autorisations déjà reçus ; absence d'essai => limitation publiée.

## 8. Dossier de revue obligatoire par livraison

Créer au moment de la livraison `docs/benchmarks/080-<lot>-review.md`, contenant :

1. HEAD, fichiers changés par Grok, modifications initiales préservées et décisions
   différentes de l'annexe avec justification.
2. Tableau de scénarios du lot : commande, test sélectionné, résultat, lien vers
   log ; ne pas seulement annoncer un total de tests.
3. Exemples anonymisés des contrats produits et preuve de relecture après restart.
4. Reproduction du défaut avant/après, ou explication lorsqu'on n'a qu'une preuve
   statique ; limitations de couverture et de providers.
5. Validation du bundle selon la procédure runtime, ou motif précis d'attente.
   Aucun build/arrêt d'une instance ouverte sans l'autorisation correspondante.

Codex vérifie le diff, les contrats, les scénarios et les risques restants sans
reprendre le verdict de Grok. Statuts du lot : TODO → implémenté à vérifier →
corrections demandées ou validé. « Implémenté » n'est pas « observé dans l'app ».
Le registre des décisions et statuts reste documentaire ; aucun envoi de messages
à d'autres tâches ou lancement d'agent n'est déclenché par ce fichier.
