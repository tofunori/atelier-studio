# Vérification indépendante de l'endurance

Exécution du parent sur le serveur du bundle Stop, avec le fournisseur simulé
et un profil temporaire. Durée réelle : **610,009 s**. Six scénarios, 18
reconnexions, 2 634 envois. L'app utilisateur n'a pas été arrêtée pendant le test.

| Chats | Historique | Envois | Admission p95 ms | Confirmation p95 ms | Reprise p95 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | court | 354 | 22,7 | 47,3 | 18,8 |
| 1 | long | 360 | 29,8 | 49,2 | 15,5 |
| 5 | court | 480 | 132,6 | 98,4 | 5,4 |
| 5 | long | 480 | 111,2 | 90,4 | 4,4 |
| 10 | court | 480 | 331,7 | 216,5 | 3,2 |
| 10 | long | 480 | 269,7 | 166,1 | 2,5 |

La confirmation est mesurée **après admission**, jusqu'à l'arrivée de l'état
terminal ; ce n'est pas une latence totale utilisateur. Le temps du fournisseur
simulé est inclus et ne représente pas un fournisseur externe. Les pings sont
mesurés entre les lots, pas sous une charge continue dédiée. Leur p95 maximal
observé est de 4,3 ms. L'admission dépasse 250 ms p95 avec dix chats : ne pas
présenter ce seuil comme satisfait partout. Le maximum d'admission est 655,7 ms.

Les historiques longs accumulent des tours de prompts synthétiques d'environ
4 096 caractères, par lots de 12 tours et par chat. Les mesures portent sur le
runtime et le protocole, pas sur la fluidité du rendu de ces historiques dans
WebKit. Les échantillons RSS du serveur restent entre environ 7 et 37 MiB avec
des baisses entre scénarios ; ce test ne démontre pas l'absence de toute fuite
sur une session de plusieurs jours ou dans le client.

Un audit indépendant des fichiers du journal et des reçus confirme :

- 2 634 identifiants reçus, 2 634 messages utilisateur ;
- 2 634 événements texte et 2 634 fins de tour ;
- une occurrence par identifiant et par tour, aucun identifiant inconnu ;
- aucun reçu non terminé, aucune ligne JSON invalide.

Le protocole a livré onze répétitions de reçus terminaux, sans double exécution
dans le journal. Les répétitions de messages de contrôle ne sont donc pas
comptées comme des réponses dupliquées.

## Preuves

- `2026-09-08-parent-endurance.json` : mesures brutes par scénario.
- `2026-09-08-parent-integrity.json` : audit du journal indépendant du banc.
- `2026-09-08-parent-provenance.json` : empreintes du script et du serveur.
- `2026-09-08-parent-smoke.json` : essai préalable de 413 envois.

Le script `scripts/chat-recovery-bench.mjs` avait la même empreinte que la copie
figée exécutée. Le checkout incluait des modifications non committées : le HEAD
seul ne décrit pas le binaire testé. Cette réception du banc ne clôture pas le
lot de reprise automatique des lectures refusées ni la validation finale.

## Limite de la référence historique

Une reconstruction isolée du HEAD `efd6b686` a été tentée dans
`/tmp/atelier-recovery-baseline`. Elle échoue avec E0583 : `lib.rs` déclare
`ws_connection` et `ws_dispatch`, mais ces deux modules sont encore non suivis
dans le checkout. Journal : `/tmp/atelier-parent-baseline-build.log`.
Les mesures ci-dessus ne constituent donc pas une comparaison numérique exacte
avant/après. Le test antérieur de double livraison reste une preuve distincte ;
aucun module actuel n’a été injecté dans la référence pour fabriquer un résultat.
