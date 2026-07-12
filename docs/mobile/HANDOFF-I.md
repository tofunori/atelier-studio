# Handoff jalon I — plan 034 (hardening & distribution)

### Périmètre livré

Hardening, documentation opérationnelle et distribution **privée** :

1. **Matrice de compatibilité** client/serveur (`COMPATIBILITY.md`)
2. **Migration / rollback** (`MIGRATION.md`)
3. **Rétention cache & données perso** (`DATA_RETENTION.md`) + purge âge 14 j code
4. **Checklist révocation** appareil perdu (`REVOCATION_CHECKLIST.md`)
5. **Runbook** ops (`RUNBOOK.md`)
6. **Distribution iOS privée** (`DISTRIBUTION.md`)
7. **Politique secrets** + `npm run mobile:check-secrets`
8. **Soak multi-appareil** checklist (`SOAK_CHECKLIST.md`)
9. Index docs (`docs/mobile/README.md`)
10. Diagnostics enrichis (networkState, badge, cacheThreads, scrub erreurs)
11. Script agrégé `npm run verify:mobile`

### Fichiers

- `docs/mobile/{COMPATIBILITY,MIGRATION,DATA_RETENTION,REVOCATION_CHECKLIST,RUNBOOK,DISTRIBUTION,SECRETS_POLICY,SOAK_CHECKLIST,README,HANDOFF-I}.md`
- `scripts/check-mobile-secrets.mjs`
- `mobile/src/native/secrets.ts`, threadCache purgeExpired, App diagnostics
- `package.json` — `mobile:check-secrets`, `verify:mobile`

### Contrats/invariants

- Aucun secret dans diagnostics / scan source mobile+docs.
- Cache = projection ; purge taille + âge.
- Funnel / App Store public hors scope (documenté).
- Sidecar reste loopback.

### Tests exécutés

```text
npm run mobile:check-secrets     → OK
cd mobile && npm test            → (incl. secrets + cache expiry)
npm run verify:mobile            → protocol + remote + mobile suite
```

### Mesures appareil / soak

- Soak table humaine dans `SOAK_CHECKLIST.md` — **non exécutée** automatiquement.
- Gate Codex I : audit final + findings sévérité.

### Done criteria plan 034 §19 (auto-évaluation)

| Critère | Statut |
|---------|--------|
| Appairage / révocation sans credentials desktop | **Oui** (C+I docs) |
| Projets/threads/history canoniques | **Oui** (gateway journal) |
| Live/replay même reducer | **Oui** (E) — live WS push limité |
| Send/stop/interactions idempotents | **Oui** (gateway + queue F) |
| Budgets chat device physique | **Partiel** (pas de mesures iPhone) |
| Scroll ne vole pas la lecture | **Oui** (E tests) |
| Composer fluide | **Oui** (E) |
| Reprises réseau | **Oui** (F) |
| Gallery/viewers | **Oui** (G) |
| Paths hors projet refusés | **Oui** (C security) |
| Notifications privacy + deep link | **Oui** (H) |
| a11y / touch / reduced motion | **Partiel** (implémenté, non audit device) |
| 0 HIGH sécu ouvert connu | **À confirmer Codex** |
| Desktop non régressé | **Oui** (mobile isolé) |
| Build/install/révocation documentés | **Oui** (I) |

### Limites restantes (produit)

1. CocoaPods / IPA / signatures : opérateur
2. Stream WS push temps réel non livré (resync HTTP)
3. Soak multi-device non coché
4. Metrics FPS iPhone non collectées

### Demande à Codex

**Audit final** : `GO` programme 034 MVP fermé, ou findings CRITICAL/HIGH bloquants avec preuves.
Rejouer `npm run verify:mobile` + revue docs + 1 scénario adversarial sécu hors suite.
