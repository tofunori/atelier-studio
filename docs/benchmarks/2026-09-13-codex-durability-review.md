# Réception indépendante — durabilité Codex, 13 septembre 2026

## Périmètre

Implémentation confiée à GPT-5.6-Sol, effort high ; réception par l'agent parent.
Le [plan](../plans/2026-09-13-codex-scientific-durability.md) définit les contrats.
Les tests de panne utilisent un profil temporaire et un fournisseur simulé :
aucun calcul ou journal scientifique utilisateur n'est ciblé.

## Régression initiale reproduite

Commande :

```sh
node scripts/codex-durability-review.mjs --server /Users/tofunori/Documents/atelier-studio/src-tauri/target/release/bundle/macos/Atelier.app/Contents/Resources/rust-server/atelier-studio-server
```

Le 13 septembre à 15:03 UTC, contre le bundle antérieur au correctif :
un tour `fake` contenant un message Unicode de plus de 512 Kio reçoit le statut
`completed`, mais `getHistory` ne contient aucun événement `user`.
La fixture échoue sur `0 !== 1`, avant même le redémarrage prévu.
Le profil est conservé sous
`/var/folders/lx/xw0kd3hs76v7_lsd5lrr9z6m0000gn/T/atelier-durability-review-xmnNVu`.

Cela démontre une perte dans l'historique Atelier, pas une perte des données
du projet ni une panne du modèle Codex. Le fournisseur de ce test est simulé.

## Réception du correctif

Réception source et serveur isolé terminée, avec les réserves ci-dessous. Après
la consigne initiale « attend avant de relancer », l'utilisateur a explicitement
demandé « relance » : le bundle corrigé a donc été construit et activé.

Première réception externe, serveur debug compilé à 15:17 UTC :
SHA-256 `aaf4ba6fc8f16c38522b2be67f75b04d1571cfd4dcec64fe7dfb643de2f687ba`.
Ce candidat précède les dernières corrections de revue ; ne pas le confondre
avec le futur bundle final.

- Message Unicode de **828 046 octets** relu exactement avant/après SIGKILL.
- Reçu terminé conservé, même demande non réexécutée après reconnexion.
- Fork conservant le texte intégral.
- Corruption de même taille, JSON toujours valide : défaut d'intégrité visible.
- Fichier payload absent : défaut explicite ; restauration exacte après remise.
- Crash après admission : reçu `uncertain`, aucun rejeu après nouvelle demande
  avec la même identité.

Premier essai d'endurance **échoué**, à ne pas compter comme dix minutes validées :
428,042 secondes, 2 262 reçus, quatre scénarios terminés ; timeout de
`receiptStatus` pendant le scénario dix conversations courtes. Rapport :
`/var/folders/lx/xw0kd3hs76v7_lsd5lrr9z6m0000gn/T/atelier-durability-review-awigov/endurance.json`.
La cause exacte du timeout n'est pas établie ; voir le diagnostic ci-dessous.
Le banc comptait également les
réponses de consultation de reçu comme des notifications terminales, produisant
des faux doublons ; l'instrumentation distingue maintenant ces deux voies et
remonte les erreurs WS corrélées au lieu de les masquer derrière un timeout.

Contrôles parent déjà passés : 83 tests frontend de récupération/historique,
quatre tests supplémentaires du reducer de supervision, 49 tests de protocole,
deux tests de la consigne de portée des fichiers et `npm run typecheck`.

## Implémentation gelée et contrôles finaux

Sol high a livré et gelé les lots 1 à 3. Le dernier serveur isolé a l'empreinte
SHA-256 `09895415aff1ce0dbd80fa2ac7801a1f8082ad436d6d469e1779f3631e56c70c`.
Il ne s'agit pas d'un nouveau bundle `.app` chargé dans Atelier.

- Store : 35 tests réussis ; harness : cinq ; providers : 303, deux ignorés
  réseau/authentification ; runtime : 232.
- Après les derniers changements fork/rewind : store 35/35, fork runtime 2/2,
  édition/rewind 2/2, puis nouvelle exécution parent de **tout le runtime : 232/232**.
- Nouvelle exécution frontend parent : **87/87**.
- `git diff --check` ciblé réussi. Le contrôle global `cargo fmt --all -- --check`
  signale une dérive de formatage préexistante ; aucun formatage massif appliqué.

Les tests de silence utilisent des délais raccourcis et des statuts natifs
simulés, pas une exécution réelle de 45 minutes ni plusieurs heures de modèle.
La liaison est vérifiée avant `turn/start`, à la reprise, après réouverture du
registre, et face aux échecs de sauvegarde ou identités périmées.

## Corrections du banc et portée de ses mesures

La limite de lecture est de huit `FastRead` par connexion WS. Les dix reçus du
lot dont la sonde avait expiré sont pourtant tous durablement `completed` dans
le profil : cet incident n'établit pas une perte de reçus. Un refus `REQUEST_BUSY`
ignoré par l'ancienne instrumentation est une explication cohérente avec le code,
mais le premier rapport ne contient pas la réponse permettant de l'affirmer.

Le banc borne maintenant les consultations à quatre, sans réduire les dix chats
concurrents. Une rafale séparée vérifie les refus explicites et une lecture réussie
après surcharge. Les contradictions terminales sont contrôlées au fil des messages,
y compris les réponses de consultation. Les répétitions identiques restent
mesurées : une réponse `send` tardive peut légitimement répéter le reçu terminé
déjà diffusé. Elles ne prouvent pas une seconde exécution.

À la fin de chaque scénario, le nombre exact de messages utilisateur, réponses
et identités uniques est comparé aux envois attendus. Cela couvre les pertes et
doublons visibles dans les journaux du fournisseur simulé, sans prétendre prouver
l'exécution distante exactement une fois d'un fournisseur réel.

## Endurance finale mesurée et verdict qualifié

Sur le serveur gelé identifié ci-dessus, le fournisseur simulé a traité
**3 778 envois en 610,992 secondes (10 min 11 s)** : six scénarios croisant
1, 5 et 10 conversations avec des historiques courts et longs, et 18 reconnexions.
Les décomptes finaux des messages utilisateur, réponses et identités uniques sont
exacts dans les 32 conversations des scénarios. Aucun timeout de confirmation,
reçu échoué ou incertain, erreur de protocole ou état terminal contradictoire.
Ce contrôle compte les événements ; il ne compare pas octet par octet chacun des
3 778 contenus. Le cas Unicode de 828 046 octets est, lui, comparé exactement.

**Le wrapper strict original a néanmoins échoué** : neuf notifications terminales
spontanées n'étaient pas observées au moment de la mesure dans le scénario
10 conversations courtes. Les reçus étaient réconciliés et les historiques finaux
complets. Les données recueillies ne distinguent pas notification tardive et
notification jamais reçue ; la livraison systématique des notifications n'est
donc pas validée. Une répétition terminale identique a aussi été observée, sans
contradiction d'état ni doublon d'identité de message.

Les fichiers bruts restent inchangés :

- [Mesures d'endurance](2026-09-13-codex-durability-endurance.json), banc `ok: true`.
- [Réception brute](2026-09-13-codex-durability-reception-raw.json), wrapper
  `ok: false` sur l'assertion des neuf notifications.
- [Évaluation qualifiée](2026-09-13-codex-durability-assessment.json), séparant
  persistance vérifiée et livraison des notifications non établie.

Le compteur ambigu `receiptLosses` a ensuite été renommé
`terminalFramesNotObservedAtMeasurement` : il demeure rapporté, mais n'est plus
assimilé à une perte durable. Un nouvel essai de **66,064 secondes, 757 envois et
six scénarios**, sur le même binaire, valide cette instrumentation (`ok: true`,
zéro notification absente à la mesure). Il ne remplace ni n'efface la réserve du
test long. Rapport conservé :
`/var/folders/lx/xw0kd3hs76v7_lsd5lrr9z6m0000gn/T/atelier-durability-review-0Ghjd4/review.json`.

Les deux réceptions finales passent aussi les cas de grosse sortie avec SIGKILL,
anti-rejeu, fork, corruption JSON valide, payload absent et reçu en vol incertain.
L'échec d'append injecté reste visible et n'est pas acquitté comme un succès ; ce
test seul ne prouve pas l'absence de toute exécution du fournisseur. La rafale de
64 lectures produit des refus explicites `REQUEST_BUSY`, puis une lecture réussie.

## Limites non masquées

- Maximum de 64 Mio par événement externalisé ; lecture/materialisation encore
  intégrale du journal et de ses payloads, sans borne agrégée de mémoire.
- Pas de collecte automatique des payloads devenus orphelins après suppression,
  troncature ou échec. Le test n'efface aucun journal utilisateur.
- Le verrou protège les clones du journal au sein d'un serveur, pas plusieurs
  processus écrivant simultanément dans le même profil.
- Les écrivains auxiliaires historiques (mailbox, liens d'agents, widgets,
  miroir de réponse) conservent leur wrapper best-effort. La garantie renforcée
  est celle des chemins traités, pas une garantie universelle de tout Atelier.
- Le changement de modèle/compaction et une endurance native de plusieurs heures
  restent des validations distinctes non effectuées ici.
- Le bundle corrigé a été construit et relancé après autorisation explicite ;
  cette observation locale ne remplace pas l'endurance native de plusieurs heures.

## Activation du bundle corrigé

`npm run tauri:build:app` s'est terminé avec succès et a produit le bundle release
signé du checkout courant. L'application a été relancée depuis
`src-tauri/target/release/bundle/macos/Atelier.app` : processus principal PID
36328, démarré le 13 septembre 2026 à 13:07:27 heure locale.

Le sidecar Rust du même bundle est le PID 36435. Son endpoint `/health`
authentifié répond `ok: true`, version 1.9.0, et son identité correspond au PID et
au port inscrits dans `sidecar.lock`. L'interface Atelier est visible, le projet
Chapitre1-Albedo, sa conversation et la galerie ont été restaurés. Ces contrôles
valident le bundle chargé et son démarrage ; ils ne déclenchent pas une nouvelle
analyse Codex coûteuse et ne prouvent pas encore une session native de plusieurs
heures.

## Scénario natif longue durée à exécuter séparément

Ce scénario n'est **pas exécuté** par la fixture simulée et ne constitue pas une
validation déjà acquise. Prévoir au moins deux heures et un budget de modèle
explicite avant de lancer un essai coûteux.

1. Démarrer une instance isolée du bundle candidat, avec un profil et un corpus
   synthétiques distincts des projets utilisateurs. Relever versions, PID,
   modèle, effort, paramètres et empreintes des fichiers d'entrée.
2. Envoyer une tâche analytique en lecture seule dont les résultats attendus sont
   calculables indépendamment. Journaliser les identifiants Atelier, session
   native, tour et reçu dès le début, avant toute sortie finale.
3. Inclure une commande silencieuse dépassant 45 minutes. Vérifier son statut
   natif `inProgress`, l'absence d'interruption automatique et le fonctionnement
   de Stop sur un second tour sacrifiable, sans arrêter le premier.
4. Produire des sorties Unicode au-delà de 512 Kio, puis des tours suffisants pour
   observer une vraie compaction native. Comparer avant/après les checkpoints
   factuels, les valeurs calculées, les références et les empreintes des sorties.
5. Fermer/reconnecter le client ; simuler une rupture de transport contrôlée sur
   l'instance de test. Comparer l'historique et les identités ; ne jamais renvoyer
   automatiquement une commande dont l'effet est incertain.
6. Arrêter brutalement le seul serveur de test pendant un premier tour et le
   relancer avec le même profil. Vérifier que la session est retrouvée, que le reçu
   en vol est annoncé comme incertain, et que les sorties natives récupérables ne
   sont ni dupliquées ni attribuées à un autre tour.
7. Comparer les calculs aux résultats indépendants, les journaux avant/après et les
   événements terminaux. Relever toute sortie manquante, tout changement d'identité,
   faux succès, perte de contrôle Stop, consommation excessive ou doublon.

La robustesse du transport et du stockage ne valide pas les hypothèses, modèles,
références ou interprétations scientifiques produits par l'assistant.
