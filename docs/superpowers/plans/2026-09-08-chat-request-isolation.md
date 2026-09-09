# Isolation des requêtes de chat

Objectif : garder les commandes et les réponses disponibles lorsqu'un catalogue,
un historique, un accès disque ou un service externe est lent.

## Contrats

- La réception WebSocket et l'écriture réseau ne font aucun travail métier.
- Les contrôles (interruption, réponse à une interaction, terminal) disposent
  d'une capacité distincte des lectures coûteuses et des actions ordonnées.
- Les actions d'un chat restent FIFO. Deux chats peuvent préparer leurs tours
  simultanément. Une action globale constitue une barrière conservatrice.
- Les lectures ont un délai maximal et sont annulées à la déconnexion. Leurs
  réponses restent privées et portent les identifiants de la requête.
- Une écriture admise n'est pas abandonnée au milieu de ses effets lors d'une
  déconnexion. Un dépassement signale explicitement que le travail continue ;
  il ne provoque aucun rejeu automatique.
- Stop annule aussi les envois qui attendent encore leur préparation.
- Capacités par connexion et par processus, file bornée et limites de travail
  disque empêchent une reconnexion de contourner les protections.
- Un client qui ne consomme plus son flux est déconnecté pour resynchronisation,
  plutôt que d'accumuler une file illimitée ou d'ignorer silencieusement les pertes.
- Une erreur de lecture d'historique ne termine pas un tour en cours.

## Étapes et critères de sortie

1. Classer explicitement les routes existantes ; conserver les routes inconnues
   dans la voie ordonnée globale. Tester la couverture de l'inventaire.
2. Implémenter admission, ordonnanceur et exécution hors de la boucle réseau.
   Borner également les opérations synchrones qui peuvent survivre à un timeout.
3. Ajouter les erreurs corrélées et l'affichage adapté dans le client, ainsi que
   l'annulation pendant la préparation d'un envoi.
4. Tester avec de vrais WebSockets : lecture bloquée, surcharge, FIFO, deux chats,
   Stop avant démarrage, déconnexion, réponse privée et récupération.
5. Faire une revue indépendante du résultat et résoudre les constats.
6. Exécuter TypeScript, build web, tests frontend ciblés, sidecar et runtime Rust.
   Suivre le protocole de build/relance du .app et tester la création/réponse
   visible pendant une requête lente. Documenter les preuves et les limites.

## Implémentation

Référence comparée : snapshot local de Synara du 7 septembre 2026,
`/tmp/synara-stream-audit-20260907/apps/server/src/wsRequestAdmission.ts` et
`wsRpc.ts`. Le principe repris est la séparation des capacités de contrôle,
d'actions et de lectures ; Atelier conserve son runtime Rust et ajoute une
voie terminal ainsi qu'une voie réservée au statut et à la liste des chats.

La réception ne fait que décoder et admettre. Une tâche réseau distincte écrit
les réponses et les événements, avec une file de 128 messages et un délai
maximum de 5 secondes par écriture. Un retard du bus force une reconnexion,
qui recharge la liste et l'historique. Les handlers s'exécutent hors des workers
réseau Tokio, y compris leurs parties synchrones.

| Voie | Par connexion | Par processus | Budget des requêtes admises |
| --- | ---: | ---: | ---: |
| Interruption / permissions / interactions | 8 | 16 | 1 Mio |
| Terminal | 8 | 16 | 1 Mio |
| Statut / liste des chats / préférences | 8 | 16 | 1 Mio |
| Lectures coûteuses (attente incluse) | 32 | 64 | 16 Mio |
| Historiques (attente incluse) | 8 | 16 | 1 Mio |
| Actions ordonnées | 32 | 64 | 64 Mio |

Les lectures coûteuses exécutent au plus 4 tâches par connexion et 8 par processus ;
les historiques ont des workers distincts avec les mêmes limites. Le délai inclut
l’attente : les rafales de démarrage ne sont plus refusées dès la cinquième lecture.

Ces budgets comptent le texte entrant arrondi au Kio ; ils ne constituent pas
une limite de RSS de l'application. Les workers disque imbriqués ont aussi
leurs quotas : 8 pour les lectures, 8 pour les historiques, 8 pour les actions, 2 pour le préchauffage
des snapshots. Une opération disque synchrone conserve son quota jusqu'à sa fin.

Les lectures expirent à 15 secondes, ou 30 secondes pour les historiques et
certaines lectures distantes. Les actions acceptées continuent après fermeture
du socket ; après 15 secondes, le client reçoit `requestDelayed` et aucune
réémission automatique n'a lieu. Les refus et expirations portent le type de
requête, ses identifiants et les champs attendus par les consommateurs concernés.

L'admission réserve atomiquement l'ordre et le jeton d'annulation d'un envoi.
Stop annule les envois antérieurs ; les suivants attendent sa fin. L'ouverture,
les frappes et la fermeture d'un terminal partagent une file distincte. Les
instantanés `threads` sont numérotés sous le verrou du store et portent l'identité
du runtime ; le client ignore un instantané dépassé et accepte un nouveau runtime.
Les réponses `history` et `reverted` portent aussi une révision : allouée avant
libération de l'action, elle empêche un historique capturé avant une révision
ou un ancien accusé `reverted` de réintroduire les messages retirés.

La revue indépendante a entraîné des corrections sur l'ordre du terminal,
Stop entre deux sockets, les instantanés inversés, les lectures gbrain/Zotero,
les erreurs de diff et de Calculs, le maintien de Stop après refus d'un steer,
la réconciliation d'un done manqué et le nettoyage des interruptions achevées.

## Limite explicite

Les limites d'admission garantissent l'isolation des capacités, pas la disponibilité
des fournisseurs externes. Une opération système synchrone déjà bloquée ne peut
pas toujours être interrompue ; elle conserve son permis jusqu'à sa fin pour
empêcher une accumulation de remplaçants.

## Validation

- Runtime Rust : **222 tests réussis**, dont 14 tests avec de vrais WebSockets.
- Frontend ciblé (`ws`, orchestration App, anatomie du chat) : **131 tests réussis**.
- Sidecar : **656 tests réussis**.
- `npx tsc --noEmit` et `npx vite build` : réussis.
- Revue indépendante : tous les constats traités, y compris le dernier test
  de 1000 interruptions sans accumulation.
- Build `.app` final et relance suivant le protocole : réussis ; processus
  `tauri-app` PID **12829**, chemin du checkout confirmé.
- Runtime du bundle : santé OK, backend Rust, version app 1.8.0.
- Test réel sur ce runtime, huit catalogues lents lancés sur deux connexions :
  nouveau chat confirmé en **25 ms**, réponse Claude `ATELIER_ISOLATION_OK` en
  **11007 ms**, fin réussie en **11244 ms**. Les catalogues expirent à environ
  15 secondes sans bloquer ping ni les listes de chats.
- Contrôle visuel du premier rebuild : chat créé depuis l’interface, visible dans
  la sidebar, réponse `ATELIER_ISOLATION_OK`, puis « Tour terminé », sous catalogues
  lents. Cette réussite était insuffisante : Thierry a signalé le bandeau
  « Serveur occupé » persistant dans d’autres chats.
- Correction de cette régression : file de lectures bornée, voie distincte pour
  les historiques, retrait du double getHistory à la sélection, bandeau limité
  au chat/projet concerné et supprimé après récupération confirmée. La revue a
  également fait ajouter projectRoot à la réponse commands pour cette récupération.
- Contrôle final du bundle : réussi. Passage du projet Albedo-Modis-Pipeline-Analysis
  à Chapitre1-Albedo ; « Une phrase bien seule » charge son historique sans
  bandeau. Le message réel de Thierry « est-ce le bon terme ? » reçoit sa réponse
  puis « Tour terminé » ; son message suivant démarre normalement. Aucune action
  de test n’a interrompu ces tours utilisateur.
- Charge finale : huit catalogues simultanés expirent à 15 secondes ; l’historique
  de test arrive en **62 ms** et ping en **61 ms**. Après la charge, commands porte
  bien le projectRoot attendu dans le bundle final. Les expirations de catalogue
  sous charge artificielle restent explicites et ne bloquent pas l’historique.
- Preuves finales : `/tmp/atelier-burst-live-final.log`,
  `/tmp/atelier-burst-ui-final.jpeg`, `/tmp/atelier-burst-{rust,front,sidecar}.log`.
  Les scénarios testés ne garantissent pas la disponibilité de tous les fournisseurs
  externes ni l’absence de tout autre défaut lors d’une utilisation prolongée.


Les tests couvrent notamment catalogue/historique bloqués, saturation des lectures,
ping et Stop disponibles, réponse d'un chat indépendant, ordre FIFO, Stop avant
et après un send, survie des mutations à la déconnexion, reconnexion sous charge,
réponses privées, perte du bus, erreurs de diff réessayables et instantanés périmés.
Le chat de test conservé porte le titre « Test isolation du chat » et l’ID
`de35f9c4-6d7c-44ef-b53f-0b111d7cbd16`.
Les fichiers de logs de validation sont conservés dans `/tmp/atelier-isolation-*`.
