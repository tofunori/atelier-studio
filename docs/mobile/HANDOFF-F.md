# Handoff jalon F — plan 034

### Périmètre livré

Résilience réseau + lifecycle iOS/web pour le companion :

1. **Machine d'état** `offline → connecting → authenticating → syncing → live | degraded` (`networkMachine.ts`)
2. **Reconnect unique** + backoff exponentiel + jitter + plafond 30 s (`reconnectController.ts`, `backoff.ts`)
3. **Resume `lastSequence`** + `snapshotRequired` → full reload (`syncEngine.ts`)
4. **File d'envoi locale** : `pending_local | inflight | acked | durable | failed` ; retry manuel ; recovery kill avant ack (`sendQueue.ts`, persistée)
5. **Cache journal versionné** v1 + migration v0 + purge bornée (`threadCache.ts`)
6. **Lifecycle** visibility + online/offline : background ne promet pas de stream ; foreground resync (`lifecycle.ts`, `useNetworkSession`)
7. **ChatScreen** hydrate cache → delta/snapshot, file d'attente UI « Réessayer », offline send queue

### Fichiers

- `mobile/src/transport/{backoff,networkMachine,reconnectController,sendQueue,syncEngine,useNetworkSession}.ts`
- `mobile/src/storage/threadCache.ts`
- `mobile/src/app/lifecycle.ts`
- `mobile/src/chat/ChatScreen.tsx`, `App.tsx`, CSS
- tests + `docs/mobile/HANDOFF-F.md`

### Scénarios couverts (tests / logique)

| Scénario | Preuve |
|----------|--------|
| Offline pendant stream | queue pending_local + machine offline |
| Mac/gateway down | reconnect loop single + backoff |
| Backend nouveau / resume seq | syncEngine delta + snapshot |
| Tailscale / version | uiReason tailscale_missing / version_incompatible |
| Kill après send avant ack | parseQueue → recover inflight→pending_local |
| 1000 events catch-up | syntheticCatchUpEvents + no gaps |
| Foreground | FOREGROUND_RESUME → syncing + networkEpoch resync |
| Pas de faux done | stop uniquement après interrupt ; pas d'inférence socket |

### Tests exécutés

```text
cd mobile && npm run typecheck  → OK
cd mobile && npm test           → 52 passed
cd mobile && npm run build      → OK
```

### Mesures appareil

- Coupures physiques iPhone / avion 30 s : **non exécutées** ici (pas d'IPA).
- Gate Codex F : rejouer sur device réel recommandé.

### Limites

1. Toujours pas de **WS live** gateway→client (poll/resync history). Jalon F = reprise journal, pas stream push.
2. `degraded` mappé UI sur phase `connecting` + label « Connexion dégradée ».
3. Cache = projection ; max 800 events / 20 threads.
4. Même thread Mac+iPhone : OK via journal (pas de présence temps réel).

### Demande à Codex

**`GO`** pour jalon G (Gallery/fichiers) si la revue machine/queue/sync est OK ;
ou **`GO avec corrections`** si le mapping phase/degraded ou le resync epoch doit être raffiné.
