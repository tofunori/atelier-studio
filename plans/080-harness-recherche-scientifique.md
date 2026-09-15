# Plan 080 — Fiabilité du harness pour la recherche scientifique

## Statut et résultat attendu

- **Statut : TODO — spécification ; implémentation confiée à Grok, revue à Codex.**
- **Date :** 2026-09-14.
- **Référence :** `163c11f9`, avec modifications locales présentes lors de l'audit.
- **Priorité :** P1 pour les corrections A et B ; évolution incrémentale pour C à E.
- **Effort relatif :** A M, B S, C L en deux livraisons, D M, E M réparti sur les lots.
- **Objectif :** savoir ce qui a été exécuté, sur quelles entrées, ce qui a été
  effectivement vérifié, et ce qu'il reste à reprendre après une interruption.

Thierry a confié l'implémentation à Grok et la vérification à Codex. La présente
intervention précise les documents, sans appliquer de changement applicatif.
Les autorisations particulières de build/relance et de calcul distant restent
celles d'AGENTS.md et de la session d'implémentation.

**Lire ensuite l'[annexe d'exécution](080-harness-recherche-scientifique-execution.md).**
Elle fixe les contrats, transitions, points d'intégration, scénarios nommés et
preuves à remettre au réviseur. Ses décisions détaillées précisent les lots
ci-dessous. Grok livre un lot à la fois ; Codex le vérifie avant le suivant.

## Périmètre et principes

- Conserver les moteurs agentiques natifs et le stream actuel. Les adaptations
  frontend/protocole se limitent aux statuts, identifiants et erreurs nécessaires.
- Construire sur le journal, les reçus, `atelier-run`, les adaptateurs Calculs,
  la provenance et les mécanismes de contexte existants.
- Garder distincts : fin du tour d'agent, fin du processus, réussite des contrôles
  définis et appréciation scientifique humaine.
- Ne pas déduire automatiquement les dépendances scientifiques d'une commande
  shell : permettre leur déclaration explicite et signaler les informations manquantes.
- Aucune release, installation de provider, mutation de corpus, migration de
  manuscrit ou modification de données scientifiques dans ce plan.
- Aucun commit/push automatique. Préserver les modifications préexistantes.
- Le [plan 068](068-provider-dsh-deepseek.md) d'intégration de DeepSeek est
  indépendant : ce plan ne nécessite pas l'ajout de ce provider.

## État constaté et limites de l'audit

Constats issus du code courant et d'une lecture indépendante, sans reproduction
dans le bundle ouvert. Revalider les chemins avant chaque lot : le dépôt contient
du travail en cours. Une différence impose une adaptation du plan, pas un arrêt
systématique si elle reste compatible avec son objectif.

| Surface | Existant et limite constatée | Conséquence |
| --- | --- | --- |
| [Revue Rust](../rust/crates/atelier-runtime/src/ws_router.rs) : `requestReview` | Force Codex, n'exploite pas `autoReview`, transforme une revue vide ou contenant certaines expressions en `ok` | Assurance injustifiée possible ; configuration et déclenchement automatique à restaurer |
| [Revue native](../rust/crates/atelier-providers/src/codex.rs) : `run_native_review` | Cible `uncommittedChanges` | Ne vérifie pas à elle seule les affirmations du dernier tour ou un résultat scientifique |
| [Épingles](../rust/crates/atelier-runtime/src/evidence.rs) : `load`, `add_pin`, `remove_pin` | Erreur de lecture/JSON convertie en liste vide, ensuite réécrite | Risque d'effacement au prochain ajout/retrait |
| [Calculs](../rust/crates/atelier-workspace/src/compute/mod.rs) | Suivi Mac/NAS/Slurm déjà présent ; PID disparu déjà classé `unknown` | Ajouter la continuité d'une expérience, sans recréer le suivi existant |
| [Lanceur](../scripts/atelier-run) | Commande concaténée tronquée à 200 caractères ; succès selon code retour | Informations insuffisantes pour reproduire et valider une expérience |
| [Provenance](../rust/crates/atelier-runtime/src/prov.rs) | Contexte commun aux figures du tour, commandes bornées, Python du serveur | Contexte utile mais pas recette exacte de production de chaque figure |
| [Contexte](../rust/crates/atelier-runtime/src/send.rs) | Injection par session/hash, reçu de contexte et handoff existants | Ajouter un état scientifique explicite ; aucune perte par compaction démontrée |

Les mutations des épingles sont déjà sérialisées par le dispatcher : ne pas
présenter une course entre sockets comme un défaut établi. Les protections de
durabilité des conversations doivent être conservées.

## Ordre des livraisons

1. **A — Vérification fiable.** Premier chantier recommandé.
2. **B — Conservation des preuves.** Indépendant de A, livrable isolément.
3. **C1 — Manifeste d'expérience et provenance exacte.**
4. **C2 — Reprise et validation des expériences.** Dépend de A et C1.
5. **D — État scientifique durable.** S'appuie sur les identifiants de C1.
6. **E — Évaluation intégrée.** Les scénarios commencent dès A ; cette livraison
   clôt la vérification transversale, elle ne reporte pas les tests à la fin.

### A — Restaurer un vérificateur digne de confiance

**Responsabilité principale :** `atelier-runtime` ; extraction proposée d'un
module `review.rs`, avec stockage dans `atelier-store` si nécessaire. Adapter
`atelier-providers`, le protocole et le consommateur frontend au strict nécessaire.
L'ancien `sidecar/reviewer.mjs` sert de référence comportementale, pas de backend
à réactiver.

1. Caractériser le contrat actuel : `enabled`, déclencheur, provider/modèle/effort,
   action manuelle, revalidation après correction et résultats affichés.
2. Construire une entrée de revue immuable liée à `threadId` et `turnId` : demande,
   réponses du tour, résultats d'outils pertinents, sorties et diff du tour. Signaler
   toute entrée manquante ou tronquée. Réutiliser les références de gros payloads
   du journal plutôt que dupliquer tout l'historique.
3. Exécuter la revue dans une session distincte en lecture seule, en respectant
   la configuration. Ne pas passer une session Claude à Codex ni remplacer le
   handler du tour actif. Une capacité absente produit un état explicite.
4. Définir un résultat structuré : `passed`, `failed`, `inconclusive`, plus les
   contrôles effectués, les preuves et leur périmètre. Erreur d'exécution/annulation
   restent distinctes. Une réponse vide, un JSON invalide ou la seule expression
   « no findings » ne permettent pas de conclure `passed`.
5. Restaurer le déclenchement backend à la clôture durable du tour, selon les
   réglages. Dédupliquer avec l'identité du tour et de la configuration de revue.
   Persister la demande et le résultat pour survivre à une déconnexion de l'UI.
6. Séparer revue des affirmations et revue Git native. Conserver un adaptateur
   pour les consommateurs existants : aucun badge positif pour une revue incomplète.
7. Borner la correction automatique par une politique explicite : pas de boucle
   infinie, pas de correction après annulation, pas de nouvelle autorisation déduite
   d'un verdict ; ne pas étendre les effets de bord actuels sans décision produit.

**Acceptation :**

- Une réponse vide, ambiguë, hors format ou arrivée pour un ancien tour ne valide
  pas le tour courant.
- Un constat négatif reste négatif même si le texte contient « no findings ».
- Les réglages de modèle/provider/déclenchement sont appliqués ou leur indisponibilité
  est signalée ; déclenchement automatique une fois par identité de revue.
- Une revue n'interrompt pas une génération en cours et reste consultable après
  reconnexion ; crash en cours de revue => état honnête et reprise contrôlée.
- Une revue sans accès aux preuves indique précisément sa limite.

### B — Préserver le registre de preuves en cas d'erreur

**Fichiers principaux :** `evidence.rs`, handlers correspondants de `ws_router.rs`.

1. Retourner un résultat typé depuis la lecture : fichier absent, données valides,
   format incompatible, corruption ou erreur d'accès.
2. Seul un fichier absent équivaut à un registre neuf. Sur les autres erreurs,
   refuser la mutation et retourner une erreur exploitable par l'interface.
3. Conserver les octets originaux ; prévoir une copie de récupération avant toute
   réparation explicite. Ne pas remplacer spontanément un registre endommagé.
4. Conserver écriture atomique, sérialisation et déduplication par source existantes.

**Acceptation :** les tests d'ajout et de retrait sur un registre corrompu prouvent
que les octets restent inchangés ; lecture impossible et version inconnue ne
deviennent jamais un registre vide réécrit ; un registre absent fonctionne normalement.

### C1 — Enrichir `atelier-run` en registre d'expériences

**Surfaces :** `scripts/atelier-run`, `atelier-workspace/src/compute/`,
`atelier-store`, `prov.rs`, contrat partagé si exposé aux clients.

Un manifeste versionné ajoute progressivement :

| Domaine | Informations à conserver |
| --- | --- |
| Identité | `experimentId`, `runId`, `threadId`/`turnId` optionnels, hôte et identité native du job |
| Exécution | Tableau `argv` complet, cwd, paramètres déclarés, horaires, code retour |
| Entrées | Chemins/URI et versions ou empreintes des données déclarées ; état explicite si inconnu |
| Code | Commit et référence à l'état local réellement exécuté, y compris modifications non commitées pertinentes |
| Environnement | Exécutable réellement lancé, versions/lockfile ou image déclarés ; informations observées distinctes des informations déclarées |
| Sorties | Artefacts déclarés et empreintes, logs, relation avec le run producteur |
| Validation | Identité/version des contrôles, mesures, résultat, limites et date |

1. Introduire une v2 tout en lisant les manifestes v1 ; ne pas réécrire les anciens
   runs pour inventer les champs manquants. La commande tronquée reste un résumé UI.
2. Permettre les lancements autonomes sans conversation ; identité Atelier
   transmise explicitement pour les calculs initiés par un agent.
3. Capturer l'environnement au lieu d'exécution. Ne jamais exporter l'environnement
   complet ou des secrets ; les arguments sensibles doivent être expurgés, avec
   indication explicite que la reproduction requiert une configuration externe.
4. Déclarer les entrées/sorties du pilote. Pour les gros datasets, réutiliser une
   version immuable ou une empreinte vérifiée en cache ; taille/mtime seuls ne
   constituent pas une preuve d'identité. Borner le travail de calcul d'empreinte.
5. Relier `.prov.json` au run qui déclare l'artefact. Garder le contexte de tour
   existant, identifié comme tel, lorsqu'aucun producteur exact n'est connu.
6. Stocker les enregistrements durables hors bundle ; aucune collecte/suppression
   des anciens artefacts au titre de ce lot.

**Acceptation :** arguments avec espaces et commande longue restitués fidèlement
hors secrets ; v1 toujours lisible ; deux figures de runs distincts ont chacune
leur producteur ; un script préexistant non modifié peut être enregistré comme
générateur ; un environnement inconnu n'est pas remplacé par celui du serveur.

### C2 — Reprendre un calcul et ses contrôles sans le dupliquer

1. Ajouter un coordinateur durable léger autour des adaptateurs existants.
   Séparer l'état d'exécution (`queued/running/completed/failed/unknown`, et annulation
   explicite si nécessaire) du résultat des contrôles scientifiques.
2. Persister l'intention de lancement avant l'action et l'identité native dès
   réception. Une soumission externe au résultat incertain doit être recherchée
   sur l'hôte avec un identifiant de corrélation avant tout nouvel essai. Ne pas
   promettre « exactly once » si le backend distant ne le garantit pas.
3. À la reprise, réconcilier job, logs et artefacts : retrouver un job encore actif,
   conserver `unknown` lorsque les preuves manquent, puis exécuter seulement les
   contrôles restants. Identifier un processus au-delà du seul PID réutilisable.
4. Introduire des contrôles exécutables configurés par projet. Les résultats
   référencent exactement le code, les entrées et sorties contrôlés. Modification
   d'une dépendance => validation périmée, sans effacer son historique.
5. Garder les seuils scientifiques définis dans le projet : ne pas imposer un
   seuil universel de convergence, de significativité ou de performance. Les
   questions ouvertes peuvent rester « nécessite une appréciation humaine ».
6. Attendre les calculs sans tour LLM périodique inutile ; relancer l'agent seulement
   à la fin, à l'échec ou lorsqu'une action utile est requise, dans le mandat reçu.
7. Livrer d'abord la reprise locale, puis NAS/Slurm. Un Mac fermé n'héberge plus le
   coordinateur actif : la reprise au retour et un service distant autonome sont
   deux garanties différentes. Ce plan ne déploie pas de service distant implicite.

**Acceptation :** interruption avant/après soumission, perte de connexion, PID
réutilisé et job déjà terminé n'entraînent ni réussite inventée ni relancement
aveugle ; code retour 0 avec contrôle numérique échoué reste scientifiquement
non validé ; annulation ne déclenche pas de nouvelle soumission.

### D — Conserver un état scientifique exploitable entre sessions

1. Définir un petit état versionné par projet/objectif : question, contraintes,
   décisions humaines, hypothèses, essais rejetés et raisons, résultats vérifiés,
   limites, expériences actives et prochaine action.
2. Relier les éléments aux `runId`, sources ou événements d'origine. Distinguer
   observation, proposition de l'agent et décision de l'utilisateur. Un résumé
   généré ne peut pas promouvoir seul une hypothèse en résultat vérifié.
3. Construire un contexte borné et à la demande pour reprise/handoff. Journaliser
   la version injectée ; utiliser les interfaces publiques des providers et ne
   pas prétendre connaître leur contexte interne complet.
4. Conserver l'injection actuelle par hash ; ne pas remettre tout le corpus à
   chaque tour. Gérer les mises à jour concurrentes par révision et fusion explicite.
5. Invalider les références périmées via les dépendances du registre d'expériences.

**Acceptation :** après handoff ou compaction exercée avec un provider réel, la
prochaine action conserve les décisions et limites du scénario ; un échec connu
n'est pas réessayé sans raison ; un résumé ne transforme pas un contrôle absent
en contrôle réussi. Mesurer ce résultat, sans supposer un bug de compaction initial.

### E — Évaluer le comportement scientifique de bout en bout

Utiliser un petit projet synthétique isolé, avec données et critères connus,
sans toucher aux résultats de thèse. Le
[benchmark de durabilité existant](../docs/benchmarks/2026-09-13-codex-durability-endurance.json)
reste utile pour la persistance ; son provider simulé ne démontre pas la réussite
d'une recherche réelle.

| Scénario | Preuve attendue |
| --- | --- |
| Données → ajustement → figure | Résultat numérique attendu et filiation complète des artefacts |
| Exécution réussie, unités volontairement erronées | Contrôle scientifique échoué, jamais badge de validation |
| Revue vide ou affirmation sans preuve | Résultat non concluant ou problème correctement attribué |
| Interruption aux frontières de lancement/écriture | Reprise cohérente, absence de doublon, états inconnus explicites |
| Changement de données ou de code après validation | Validation historique conservée mais marquée périmée |
| Handoff/compaction avec essai rejeté et décision humaine | État scientifique correctement retrouvé et respecté |

Les tests déterministes vérifient les garanties backend dès chaque lot. Les
essais avec modèles réels mesurent ensuite résultat, fidélité des références,
coût et durée ; rapporter le nombre d'essais et les échecs, pas une promesse de
fiabilité générale à partir d'un unique succès. Les essais payants prolongés et
les soumissions HPC nécessitent une portée et un budget déjà autorisés.

## Vérifications et définition de terminé

Pour **ce plan documentaire** : vérifier les liens locaux, les dépendances,
la cohérence des critères et faire relire indépendamment. Aucun build ni relance.

Lors de l'implémentation, choisir les commandes selon les fichiers touchés,
vérifier leur présence dans `package.json` et compléter les fixtures requises :

```bash
cargo test --manifest-path rust/Cargo.toml --locked -p atelier-store
cargo test --manifest-path rust/Cargo.toml --locked -p atelier-runtime
cargo test --manifest-path rust/Cargo.toml --locked -p atelier-providers
cargo test --manifest-path rust/Cargo.toml --locked -p atelier-workspace
npm run test:protocol
npm run typecheck
npm run test:frontend
git diff --check
```

Les tests du lanceur utilisent `python3 scripts/tests/test_atelier_run.py` ;
les commandes du pilote sont définies dans l'annexe. Ne pas lancer
toutes les suites pour une correction isolée ; élargir si le risque ou un échec
le justifie. Toute modification de contrat partagé couvre aussi les clients
mobiles concernés. La revue indépendante précède la conclusion de chaque lot.

Avant de déclarer un changement applicatif terminé : suivre la
[procédure runtime actuelle](../docs/agent-reference/atelier-runtime.md), construire
avec `npm run tauri:build:app`, vérifier le chemin du processus et exercer le
comportement dans le bundle du bon worktree. L'arrêt/reconstruction d'une instance
ouverte exige l'autorisation prévue par cette procédure. Si elle manque, finir
les contrôles possibles et rapporter la validation du bundle en attente.

Chaque livraison rapporte séparément : proposé, appliqué, testé automatiquement,
observé dans l'app et limites restantes. Un lot peut être livré sans attendre
la fin du programme ; son statut ne couvre que ses propres critères.

## Inspirations et limites de transposition

- [DeepSeek Harness](https://www.deepseek.com/harness/en/) : services composables
  et journal des injections de contexte. Inspiration architecturale ; aucune
  dépendance au remplacement du runtime Rust ou à ses API internes.
- [Anthropic — Long-running Claude for scientific computing](https://www.anthropic.com/research/long-running-Claude) :
  critères quantifiables, référence indépendante et notes persistantes des essais.
  Le cas présenté conserve des limites scientifiques ; la durée d'autonomie
  ne constitue pas une preuve de validité du résultat.

Sources consultées le 2026-09-14 lors de l'audit préparatoire. Rafraîchir uniquement
les contrats externes utilisés au moment d'une implémentation.
