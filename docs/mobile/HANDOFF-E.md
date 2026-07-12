# Handoff jalon E — plan 034

### Périmètre livré

Moteur de chat fluide dans `mobile/` :

1. **Store normalisé** (`chat/store/`) — durable / transport / présentation séparés ; reducer pur live ≡ replay ; dédup `eventId` ; turns pour virtualisation.
2. **Buffer streaming** (`stream/frameBuffer.ts`) — ≤1 flush visuel / frame ; flush immédiat pour done/error/interaction/text/user.
3. **Sélecteurs fins** + métriques (`reduceCount`, `visualFlushCount`).
4. **Virtualisation par turn** + ancre hauteur (`Transcript`, `TurnBlock`, `ResizeObserver`).
5. **Contrat scroll** pinned / reading / catch-up (`scroll/scrollContract.ts`) + chip « Nouveaux messages ».
6. **Composer** auto-grow borné, Send/Stop même géométrie, shelf réservé, haptique légère send/stop.
7. **Send/interrupt** branchés sur gateway (`sendMessage`, `interruptThread`) + optimistic user + `clientRequestId`.
8. Promote idle des bulles stream (texte léger → `promoted`).

### Fichiers

- `mobile/src/chat/store/*`, `stream/*`, `scroll/*`, `Composer.tsx`, `Transcript.tsx`, `TurnBlock.tsx`, `ChatScreen.tsx`
- `mobile/src/App.tsx` — utilise `ChatScreen`
- `mobile/src/transport/gatewayClient.ts` — send/interrupt
- `mobile/src/design/mobile.css` — styles chat
- tests associés + `docs/mobile/HANDOFF-E.md`

### Contrats/invariants

- Même reducer pour history et live.
- Pas d'inférence de done hors événement (stop envoie done local interrupted seulement après ack interrupt).
- Scroll reading : ne vole pas la position ; catch-up explicite.
- Streaming turn non démontré hors fenêtre virtuelle (toujours inclus).
- VoiceOver : virtualisation désactivable (`disableVirtualization`).

### Tests exécutés

```text
cd mobile && npm run typecheck  → OK
cd mobile && npm test           → 30 passed (0 unhandled after ResizeObserver polyfill)
cd mobile && npm run build      → OK
```

Couverture : reducer/idempotence, frame buffer, scroll modes, composer send/stop, slice E, tokens.

### Mesures appareil

- FPS / long tasks iPhone : **non mesurés** ici (pas d'app iOS installée ; CocoaPods toujours bloquant).
- Instrumentation UI : compteurs flushes/reduces affichés en header chat (dev).
- Stress 500 messages : reducer unit via materialize (transcripts package B) — virtualisation prête ; soak 30 min hors scope auto.

### Preuves visuelles

- À capturer sur device après install iOS.

### Limites et risques restants

1. **Pas de WS live** depuis gateway — send ack seulement ; stream réel = jalon F (reconnect + events).
2. Markdown/KaTeX enrichi : promote flag seulement ; rendu MD riche encore plain text (E perf path posé).
3. Virtualisation simplifiée (estime + window) — pas @tanstack/virtual ; suffisant MVP.
4. Mesures FPS appareil manquent pour gate E produit strict.
5. Typing pendant stream non E2E UI (logique buffer/composer unit testés).

### Drift

- `ThreadView` lecture seule conservé mais App n'y passe plus.
- APP_VERSION → `0.1.0-e`.

### Demande à Codex

**`GO`** pour jalon F (résilience réseau) si le moteur E est accepté en revue code + tests ;
**`GO avec corrections`** si virtualisation/scroll doivent être renforcés avant F.
Mesures iPhone physiques restent un gap documenté pour la gate produit E.
