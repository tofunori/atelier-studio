# Banc de reprise durable du chat

Ces deux scripts exercent le contrat WS avec le provider `fake`, sans coût
fournisseur ni interface Tauri :

- `scripts/chat-recovery-bench.mjs` mesure admission, confirmation de reçu,
  ping et reprise d'historique pour 1, 5 et 10 chats, historique court/long,
  reconnexions bornées et une durée configurable. Il écrit un JSON avec
  médiane, p95 et maximum. Le temps fournisseur reste explicitement
  `unavailable` ; le banc mesure le temps Atelier observable par WS.
- `scripts/chat-recovery-restart.mjs` est un fixture en deux phases. `accept`
  écrit l'identifiant accepté dans un fichier d'état ; l'opérateur arrête le
  seul serveur fixture, le relance avec le même `ATELIER_APP_DIR`, puis lance
  `reconcile`. Le retry du même identifiant est refusé comme nouvelle
  exécution si le statut est `uncertain`, `completed` ou `cancelled`.

Construire ou sélectionner le serveur séparément, puis garder le même profil :

```sh
ATELIER_APP_DIR=/tmp/atelier-chat-recovery-fixture \
ATELIER_TOKEN=fixture-token \
node scripts/chat-recovery-restart.mjs --phase=accept \
  --url=ws://127.0.0.1:PORT --state=/tmp/chat-recovery.json

# arrêter puis relancer le même serveur avec le même ATELIER_APP_DIR

ATELIER_APP_DIR=/tmp/atelier-chat-recovery-fixture \
ATELIER_TOKEN=fixture-token \
node scripts/chat-recovery-restart.mjs --phase=reconcile \
  --url=ws://127.0.0.1:PORT --state=/tmp/chat-recovery.json
```

Pour une mesure courte et reproductible avant l'endurance :

```sh
ATELIER_APP_DIR=/tmp/atelier-chat-recovery-fixture \
ATELIER_TOKEN=fixture-token \
node scripts/chat-recovery-bench.mjs --url=ws://127.0.0.1:PORT \
  --duration-ms=30000 --reconnect-cycles=3 \
  --chats=1,5,10 --history=short,long --max-receipts=2880 \
  --pacing-ms=250 --long-turns=12 --long-prompt-chars=4096 \
  --output=/tmp/chat-recovery-bench.json
```

Le plafond est global : `max-receipts=2880` répartit 480 envois par scénario
sur les six combinaisons, et la durée globale est partagée entre ces scénarios.
Le pacing est appliqué par chat, tandis que les chats d'un même scénario sont
admis en parallèle ; le rapport contient le budget, le quota et la durée
réellement observés. Les reçus `receiptStatus` et les historiques sont corrélés
par `requestId`, afin qu'une ancienne trame en file ne devienne pas une mesure
de confirmation ou de reprise. Le rapport conserve aussi les échecs de requête
avec leur type et leurs identifiants, puis retourne un code non nul.

Pour l'endurance globale, reprendre la même matrice avec `--duration-ms=600000`
et un profil fixture dédié. Vérifier `ok`, `receiptsSent`, `receiptLosses`,
`duplicateTerminalFrames`, `confirmationTimeouts`, les durées réelles de chaque
scénario et la RSS du seul processus Rust. Le script ne supprime pas le profil.
Le nettoyage du profil fixture et l'arrêt du seul processus lancé restent à la
charge du protocole d'exécution isolé.
