# Plan 038 — Narval Run Monitor

## Objectif produit

Ajouter à Atelier une surface Narval qui transforme le suivi actuellement enfoui
dans le chat en une vue de recherche exploitable : navigation distante, état Slurm,
inspection d'un job, logs et outputs. La première tranche est strictement en lecture
seule. Elle ne soumet, n'annule, ne déplace et ne supprime rien sur Narval.

Le parcours cible est :

`chat → job Slurm → dossier distant → logs → outputs`

## Périmètre de la tranche

### Inclus

- nouvelle surface `narval` dans le rail Atelier ;
- connexion en deux sauts via `ssh nas`, puis `ssh narval-vpn` depuis le NAS ;
- alias de passerelle et d'hôte configurables par variables d'environnement ;
- arborescence distante paresseuse, limitée aux racines autorisées ;
- liste des jobs actifs via `squeue` ;
- historique récent via `sacct` ;
- détails d'un job et raison d'attente ;
- aperçu borné des logs texte et liste des outputs du dossier du job ;
- rafraîchissement manuel et automatique lorsque la surface est visible ;
- ouverture d'un terminal Atelier connecté au même hôte ;
- états chargement, vide, erreur, déconnecté et données périmées ;
- traductions FR/EN et tests frontend/Rust.

### Exclus

- `sbatch`, `scancel`, écriture ou suppression distante ;
- édition distante transparente ;
- montage SSHFS ;
- transfert automatique de gros fichiers ;
- découverte générique de grappes HPC ;
- conservation d'identifiants ou de secrets SSH dans Atelier.

## Architecture

### 1. Contrat frontend

La surface consomme des snapshots versionnés et ne construit aucune commande SSH.
Les messages WebSocket proposés sont :

- `narvalStatus { profile }`
- `narvalListDirectory { profile, path }`
- `narvalSnapshot { profile }`
- `narvalInspectJob { profile, jobId }`
- `narvalReadText { profile, path, tailLines }`

Les réponses portent un `requestId`, un `observedAt` et soit une charge utile, soit
une erreur typée (`unavailable`, `auth`, `timeout`, `not_found`, `invalid_path`,
`command_failed`). Cela permet d'ignorer proprement les réponses anciennes après un
changement de sélection.

### 2. Backend Rust

Créer `atelier-workspace::narval` avec un exécuteur de commande injecté pour les
tests. Le chemin de production appelle directement `ssh` avec une liste d'arguments,
jamais par interpolation dans un shell local.

Contraintes :

- `BatchMode=yes`, `ConnectTimeout=8`, keepalive et timeout global ;
- sortie stdout/stderr bornée ;
- job IDs numériques uniquement ;
- chemins absolus normalisés, sans NUL et sous une racine autorisée ;
- commandes distantes fixes avec paramètres encodés/validés ;
- aucun mot de passe, token ou clé privée lu ou persisté par Atelier ;
- lecture de fichiers limitée aux formats texte et à un nombre de lignes maximal.

Le parseur reste séparé de l'exécution afin de tester les sorties réelles ou
partielles de `squeue`, `sacct` et `scontrol` sans accès réseau.

### 3. Modèle de données

- `NarvalProfile`: identifiant, alias SSH, utilisateur Slurm, racines visibles ;
- `RemoteEntry`: nom, chemin, kind, taille, date de modification ;
- `SlurmJob`: id, nom, état normalisé, temps, CPUs, partition, raison ;
- `SlurmJobDetail`: job + workDir, command, stdout, stderr, ressources ;
- `RemoteTextPreview`: chemin, contenu, troncature, date observée ;
- `NarvalSnapshot`: connexion, jobs actifs, runs récents, observation.

### 4. Surface React

`NarvalSurface` utilise une grille à trois zones :

1. `NarvalFileTree` : recherche, dossiers paresseux, sélection et retry ;
2. `NarvalJobs` : table Slurm et liste de runs récents ;
3. `NarvalInspector` : onglets Overview, Logs et Outputs.

Composition shadcn obligatoire :

- `Table` pour les jobs ;
- `ScrollArea` pour les trois régions longues ;
- `Tabs` avec `TabsList` pour l'inspecteur ;
- `Badge` pour les états Slurm ;
- `Progress` lorsque Slurm expose une progression exploitable ;
- `Button`, `Input`, `Skeleton`, `Empty`, `Alert`, `Separator` et `Collapsible`
  selon leurs rôles natifs.

Les couleurs d'état passent par des variantes/tokens sémantiques. Les classes sont
réservées à la mise en page ; les icônes viennent de `lucide-react` et respectent
les attributs `data-icon` dans les boutons.

## Séquence d'implémentation

1. Installer `table` et `scroll-area` après dry-run et revue du registre.
2. Ajouter les types, parseurs et tests Rust du domaine Narval.
3. Brancher les routes WebSocket Rust et les réponses avec `requestId`.
4. Ajouter un client/hook React isolant chargement, cache court et polling visible.
5. Ajouter la surface, le rail, les traductions et les trois panneaux.
6. Relier l'ouverture du terminal SSH sans ajouter d'action destructive.
7. Ajouter les tests de rendu, sélection, erreurs, réponses périmées et polling.
8. Passer les validations ciblées, puis le protocole complet AGENTS.

## Critères d'acceptation

- Atelier reste réactif si SSH est lent, non authentifié ou indisponible ;
- aucune opération distante mutante n'est accessible ;
- un dossier ne charge ses enfants qu'à l'ouverture ;
- les jobs actifs et récents sont distingués clairement ;
- sélectionner un job peuple l'inspecteur et ses logs sans bloquer la liste ;
- une réponse obsolète ne remplace pas une sélection plus récente ;
- le polling s'arrête quand la surface n'est plus visible ;
- clavier, focus et noms accessibles couvrent les contrôles principaux ;
- typecheck, build Vite, tests sidecar/Rust/frontend et build Tauri passent selon
  les règles du dépôt ;
- l'app buildée est relancée après extinction des anciens processus et le process
  `tauri-app` est réellement présent.

## Évolution ultérieure

Une tranche séparée pourra ajouter soumission et annulation avec confirmations,
politique d'autorisation, journal d'audit et lien automatique au Run Ledger. Ces
capacités ne doivent pas être activées implicitement par la tranche lecture seule.
