# Handoff jalon H — plan 034

### Périmètre livré

Notifications, interactions (contrat 025) et finitions natives mobile :

1. **Notifications opt-in** — désactivées par défaut ; permission uniquement à l'activation
2. **Contenu minimal** écran verrouillé — titres génériques ; option titre de fil sans prompt/données science
3. **Deep links** `atelier://open?threadId=&requestId=&projectId=` + événement `atelier-deeplink`
4. **InteractionCard** approval / user_input / mcp_elicitation — anti double-submit ; secrets hors DOM après envoi
5. **respondInteraction** → gateway `/remote/v1/interaction` + idempotence `clientRequestId`
6. **Badge** increment sur error/interaction ; **clear** à la consultation réelle du thread
7. **Document picker** contextual (+ Fichier dans composer) sans permission au cold start
8. **Haptique** light/success/warning sur send/stop/interaction seulement
9. Réglages : section Notifications

### Fichiers

- `mobile/src/native/{notifications,badge,haptics,documentPicker}.ts`
- `mobile/src/chat/{InteractionCard,interactionTypes}.ts(x)`
- `mobile/src/chat/{TurnBlock,Transcript,ChatScreen,store/reducer}.ts(x)`
- `mobile/src/settings/SettingsScreen.tsx`, `App.tsx`, CSS
- tests + `docs/mobile/HANDOFF-H.md`

### Contrats/invariants

- Pas de prompt ni secret dans notifications.
- État terminal interaction : serveur autoritaire ; UI optimiste puis resync.
- Double soumission interaction bloquée (sent/busy).
- Permission notification jamais au boot.

### Tests exécutés

```text
cd mobile && npm run typecheck → OK
cd mobile && npm test          → 72 passed
cd mobile && npm run build     → OK
```

### Mesures appareil

- Notifs lock/unlock, deep link OS, badge dock iOS : **à valider sur device** (pas d'IPA ici).
- Web Notification API testée en unit (contenu) ; permission mockable.

### Limites

1. Push distante Mac→iOS absente (local notifications à la détection client d'events journal).
2. Plugin Tauri haptics/badge optionnels (fallback web).
3. Deep link custom scheme nécessite config iOS Info.plist à `ios:init`.
4. Upload Mac des fichiers locaux pickés non implémenté (attach metadata only).

### Demande à Codex

**`GO`** pour jalon I (hardening / distribution privée / docs) si revue privacy notifs + interactions OK.
